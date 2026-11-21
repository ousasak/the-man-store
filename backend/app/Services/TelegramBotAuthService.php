<?php

namespace App\Services;

use App\Models\Order;
use App\Models\TelegramLinkCode;
use App\Models\TelegramUser;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class TelegramBotAuthService
{
    public function __construct(private TelegramService $telegram)
    {
    }

    /**
     * Create a one-time deep-link code for staff or driver Telegram binding.
     *
     * @return array{code: string, purpose: string, deep_link: ?string, expires_at: string, bot_command: string}
     */
    public function createLinkCode(User $target, User $createdBy, int $ttlMinutes = 10): array
    {
        if (! $target->isActive()) {
            throw new RuntimeException('Cannot link an inactive user.');
        }

        $purpose = $this->purposeForUser($target);
        if ($purpose === null) {
            throw new RuntimeException('This account type cannot be linked to Telegram.');
        }

        $code = $this->generateUniqueCode();

        TelegramLinkCode::query()
            ->where('user_id', $target->id)
            ->whereNull('used_at')
            ->where('expires_at', '>', now())
            ->update(['expires_at' => now()]);

        $row = TelegramLinkCode::create([
            'user_id' => $target->id,
            'code' => $code,
            'purpose' => $purpose,
            'created_by' => $createdBy->id,
            'expires_at' => now()->addMinutes(max(1, $ttlMinutes)),
        ]);

        $payload = $purpose.'_'.$code;

        return [
            'code' => $code,
            'purpose' => $purpose,
            'role' => $target->role,
            'deep_link' => $this->telegram->buildBotDeepLink($payload),
            'bot_command' => '/start '.$payload,
            'expires_at' => $row->expires_at->toIso8601String(),
        ];
    }

    /**
     * Redeem a staff_/driver_/customer_ start payload and link Telegram.
     * The shop user's role is never changed.
     *
     * @return array{ok: bool, message: string, user: ?User}
     */
    public function redeemStartPayload(string $payload, TelegramUser $telegramUser): array
    {
        $payload = trim($payload);
        if (! preg_match('/^(staff|driver|customer)_([A-Z0-9]{6,16})$/i', $payload, $m)) {
            return ['ok' => false, 'message' => 'invalid', 'user' => null];
        }

        $purpose = strtolower($m[1]);
        $code = strtoupper($m[2]);

        return DB::transaction(function () use ($purpose, $code, $telegramUser) {
            /** @var TelegramLinkCode|null $row */
            $row = TelegramLinkCode::query()
                ->where('code', $code)
                ->lockForUpdate()
                ->first();

            if (! $row || $row->purpose !== $purpose) {
                return ['ok' => false, 'message' => 'not_found', 'user' => null];
            }

            if ($row->isUsed()) {
                return ['ok' => false, 'message' => 'used', 'user' => null];
            }

            if ($row->isExpired()) {
                return ['ok' => false, 'message' => 'expired', 'user' => null];
            }

            $user = User::query()->find($row->user_id);
            if (! $user || ! $user->isActive()) {
                return ['ok' => false, 'message' => 'inactive', 'user' => null];
            }

            $expectedPurpose = $this->purposeForUser($user);
            if (! $this->purposeMatchesCode($purpose, $expectedPurpose)) {
                return ['ok' => false, 'message' => 'role_mismatch', 'user' => null];
            }

            TelegramUser::query()
                ->where('user_id', $user->id)
                ->where('id', '!=', $telegramUser->id)
                ->update(['user_id' => null]);

            if ($telegramUser->user_id && (int) $telegramUser->user_id !== (int) $user->id) {
                $existing = User::query()->find($telegramUser->user_id);
                if ($existing && ($existing->isAdmin() || $existing->isDriver())) {
                    return ['ok' => false, 'message' => 'telegram_busy', 'user' => null];
                }
                if ($existing && $existing->isCustomer() && $user->isCustomer()) {
                    return ['ok' => false, 'message' => 'telegram_busy', 'user' => null];
                }
            }

            $this->telegram->linkTelegramToUser($telegramUser, (int) $user->id);

            $row->update([
                'used_at' => now(),
                'used_by_telegram_user_id' => $telegramUser->telegram_user_id,
            ]);

            return ['ok' => true, 'message' => 'linked', 'user' => $user->fresh()];
        });
    }

    /**
     * Sign in with this phone, or create a customer account when it is new.
     * Existing shop roles are never changed.
     *
     * @return array{ok: bool, message: string, user: ?User}
     */
    public function linkByPhone(TelegramUser $telegramUser, string $phone): array
    {
        $matches = $this->findUsersByPhone($phone);

        if ($matches->isEmpty()) {
            $result = $this->registerCustomerByPhone($telegramUser, $phone);
        } elseif ($matches->count() > 1) {
            return ['ok' => false, 'message' => 'ambiguous', 'user' => null];
        } else {
            /** @var User $user */
            $user = $matches->first();
            if (! $user->isActive()) {
                return ['ok' => false, 'message' => 'inactive', 'user' => null];
            }
            $result = $this->attachTelegramToUser($telegramUser, $user, 'linked');
        }

        if (($result['ok'] ?? false) && $result['user']) {
            $result['user'] = $this->telegram->syncTelegramProfileToUser($telegramUser, $result['user']);
            app(TelegramCartService::class)->mergeGuestCartIntoUser($telegramUser, $result['user']);
        }

        return $result;
    }

    /**
     * Website "Login with Telegram": confirm in the already-open bot session.
     *
     * @return array{code: string, bot_url: ?string}
     */
    public function createWebsiteLoginSession(): array
    {
        $code = bin2hex(random_bytes(8));
        Cache::put($this->websiteLoginCacheKey($code), ['status' => 'pending'], now()->addMinutes(10));

        return [
            'code' => $code,
            'bot_url' => $this->telegram->buildBotDeepLink('web_'.$code),
        ];
    }

    /**
     * @return array{ok: bool, message: string, user: ?User}
     */
    public function approveWebsiteLoginSession(string $code, TelegramUser $telegramUser): array
    {
        $key = $this->websiteLoginCacheKey($code);
        $row = Cache::get($key);
        if (! is_array($row) || ($row['status'] ?? '') !== 'pending') {
            return ['ok' => false, 'message' => 'expired', 'user' => null];
        }

        $user = $this->linkedUser($telegramUser);
        if (! $user) {
            Cache::put($key, ['status' => 'denied', 'message' => 'not_linked'], now()->addMinutes(5));

            return ['ok' => false, 'message' => 'not_linked', 'user' => null];
        }

        $user = $this->telegram->syncTelegramProfileToUser($telegramUser, $user);
        $token = $user->createToken('themanstorepro')->plainTextToken;
        Cache::put($key, [
            'status' => 'ready',
            'token' => $token,
            'user' => $this->shopAuthPayload($user, $telegramUser),
        ], now()->addMinutes(5));

        return ['ok' => true, 'message' => 'ready', 'user' => $user];
    }

    /**
     * @return array{status: string, token?: string, user?: array<string, mixed>, message?: string}
     */
    public function consumeWebsiteLoginSession(string $code): array
    {
        $key = $this->websiteLoginCacheKey($code);
        $row = Cache::get($key);
        if (! is_array($row)) {
            return ['status' => 'expired'];
        }

        if (($row['status'] ?? '') === 'ready') {
            Cache::forget($key);

            return $row;
        }

        return $row;
    }

    public function resolveLinkedShopUser(TelegramUser $telegramUser): ?User
    {
        return $this->linkedUser($telegramUser);
    }

    private function websiteLoginCacheKey(string $code): string
    {
        return 'tg_web_login:'.$code;
    }

    /**
     * @return array{ok: bool, message: string, user: ?User}
     */
    private function registerCustomerByPhone(TelegramUser $telegramUser, string $phone): array
    {
        return DB::transaction(function () use ($telegramUser, $phone) {
            $formattedPhone = $this->formatPhoneForStorage($phone);
            $email = 'tg'.$telegramUser->telegram_user_id.'@telegram.themanstore.local';
            $existing = User::query()->where('email', $email)->first();

            if ($existing) {
                if (! $existing->isActive()) {
                    return ['ok' => false, 'message' => 'inactive', 'user' => null];
                }
                if ($formattedPhone !== '' && trim((string) $existing->phone) === '') {
                    $existing->update(['phone' => $formattedPhone]);
                }

                return $this->attachTelegramToUser($telegramUser, $existing->fresh(), 'linked');
            }

            $user = User::create([
                'name' => $this->displayNameFromTelegram($telegramUser),
                'email' => $this->uniqueTelegramCustomerEmail($telegramUser),
                'password' => Hash::make(Str::random(32)),
                'role' => 'customer',
                'status' => 'active',
                'phone' => $formattedPhone !== '' ? $formattedPhone : null,
                'email_verified_at' => now(),
                'social_type' => 'telegram',
            ]);

            return $this->attachTelegramToUser($telegramUser, $user, 'registered');
        });
    }

    /**
     * @return array{ok: bool, message: string, user: ?User}
     */
    private function attachTelegramToUser(TelegramUser $telegramUser, User $user, string $message): array
    {
        TelegramUser::query()
            ->where('user_id', $user->id)
            ->where('id', '!=', $telegramUser->id)
            ->update(['user_id' => null]);

        if ($telegramUser->user_id && (int) $telegramUser->user_id !== (int) $user->id) {
            $existing = User::query()->find($telegramUser->user_id);
            if ($existing && ($existing->isAdmin() || $existing->isDriver())) {
                return ['ok' => false, 'message' => 'telegram_busy', 'user' => null];
            }
            if ($existing && $existing->isCustomer() && $user->isCustomer()) {
                return ['ok' => false, 'message' => 'telegram_busy', 'user' => null];
            }
        }

        $this->telegram->linkTelegramToUser($telegramUser, (int) $user->id);

        return ['ok' => true, 'message' => $message, 'user' => $user->fresh()];
    }

    /**
     * @return array<string, mixed>
     */
    public function shopAuthPayload(User $user, ?TelegramUser $telegramUser = null): array
    {
        $telegramUser ??= TelegramUser::query()
            ->where('user_id', $user->id)
            ->orderByDesc('last_interacted_at')
            ->first();

        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
            'role' => $user->role,
            'status' => $user->status,
            'is_active' => $user->isActive(),
            'created_at' => $user->created_at?->toIso8601String(),
            'profile_image_url' => $user->profile_image_url,
            'telegram_username' => $telegramUser?->username,
            'social_type' => $user->social_type,
        ];
    }

    private function displayNameFromTelegram(TelegramUser $telegramUser): string
    {
        $name = trim(implode(' ', array_filter([
            trim((string) $telegramUser->first_name),
            trim((string) $telegramUser->last_name),
        ])));

        if ($name === '' && filled($telegramUser->username)) {
            $name = (string) $telegramUser->username;
        }

        return mb_substr($name !== '' ? $name : 'The Man Store member', 0, 120);
    }

    private function uniqueTelegramCustomerEmail(TelegramUser $telegramUser): string
    {
        $email = 'tg'.$telegramUser->telegram_user_id.'@telegram.themanstore.local';
        if (! User::query()->where('email', $email)->exists()) {
            return $email;
        }

        return 'tg'.$telegramUser->telegram_user_id.'.'.Str::lower(Str::random(6)).'@telegram.themanstore.local';
    }

    private function formatPhoneForStorage(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if ($digits === '') {
            return '';
        }

        if (str_starts_with($digits, '855') && strlen($digits) > 3) {
            return '0'.ltrim(substr($digits, 3), '0');
        }

        if (! str_starts_with($digits, '0') && strlen($digits) >= 8) {
            return '0'.$digits;
        }

        return $digits;
    }

    /**
     * @return \Illuminate\Support\Collection<int, User>
     */
    public function findUsersByPhone(string $raw)
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if (strlen($digits) < 8) {
            return collect();
        }

        $variants = $this->phoneLookupValues($digits);
        $suffix = substr($digits, -9);

        return User::query()
            ->where(function ($query) use ($variants, $suffix) {
                foreach (array_values($variants) as $index => $variant) {
                    $method = $index === 0 ? 'whereRaw' : 'orWhereRaw';
                    $query->{$method}("regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ?", [$variant]);
                }
                if (strlen($suffix) >= 8) {
                    $query->orWhereRaw(
                        "right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), ?) = ?",
                        [strlen($suffix), $suffix]
                    );
                }
            })
            ->get();
    }

    public function unlinkUser(User $user): void
    {
        TelegramUser::query()
            ->where('user_id', $user->id)
            ->update(['user_id' => null]);

        TelegramLinkCode::query()
            ->where('user_id', $user->id)
            ->whereNull('used_at')
            ->update(['expires_at' => now()]);
    }

    public function linkedUser(TelegramUser $telegramUser): ?User
    {
        if (! $telegramUser->user_id) {
            return null;
        }

        $user = $telegramUser->relationLoaded('user')
            ? $telegramUser->user
            : User::query()->find($telegramUser->user_id);

        if (! $user || ! $user->isActive()) {
            return null;
        }

        return $user;
    }

    /** Admin / superadmin who may operate shop bot actions. */
    public function resolveStaffActor(TelegramUser $telegramUser): ?User
    {
        $user = $this->linkedUser($telegramUser);

        return ($user && $user->isAdmin()) ? $user : null;
    }

    public function resolveDriverActor(TelegramUser $telegramUser): ?User
    {
        $user = $this->linkedUser($telegramUser);

        return ($user && $user->isDriver()) ? $user : null;
    }

    public function resolveSuperAdminActor(TelegramUser $telegramUser): ?User
    {
        $user = $this->linkedUser($telegramUser);

        return ($user && $user->isSuperAdmin()) ? $user : null;
    }

    /**
     * Linked shop owner (superadmin) and staff (admin) may update any order from Telegram.
     */
    public function staffCanManageOrders(User $user): bool
    {
        return $user->isAdmin();
    }

    /**
     * Shop staff/owner, linked driver, or an unlocked external courier.
     */
    public function canUpdateOrderStatus(TelegramUser $telegramUser, Order $order): bool
    {
        $user = $this->linkedUser($telegramUser);
        if ($user && $this->staffCanManageOrders($user)) {
            return true;
        }
        if ($user && $user->isDriver() && $this->driverCanOpenJob($user, $order)) {
            return true;
        }

        return $this->courierCanOpenJob($order);
    }

    public function driverCanOpenJob(User $driver, Order $order): bool
    {
        if (! $driver->isDriver() || ! $driver->isActive()) {
            return false;
        }

        $status = strtolower((string) ($order->status ?? ''));

        return ! in_array($status, ['cancelled'], true);
    }

    /**
     * External courier (no shop account): job QR works only after admin unlock.
     */
    public function courierCanOpenJob(Order $order): bool
    {
        $status = strtolower((string) ($order->status ?? ''));
        if (in_array($status, ['cancelled'], true)) {
            return false;
        }

        $order->loadMissing('shipment');
        $shipment = $order->shipment;
        if (! $shipment) {
            return false;
        }

        return $shipment->isCourierJobUnlocked();
    }

    /**
     * @return array{unlocked: bool, unlocked_at: ?string, unlocked_by: ?int, deep_link: ?string, start_payload: string}
     */
    public function courierJobStatus(Order $order): array
    {
        $order->loadMissing('shipment');
        $shipment = $order->shipment;
        $key = $order->order_number ?: (string) $order->id;

        return [
            'unlocked' => (bool) $shipment?->isCourierJobUnlocked(),
            'unlocked_at' => $shipment?->courier_job_unlocked_at?->toIso8601String(),
            'unlocked_by' => $shipment?->courier_job_unlocked_by,
            'deep_link' => $this->buildDriverJobDeepLink($order),
            'start_payload' => 'job_'.$key,
        ];
    }

    public function unlockCourierJob(Order $order, User $actor, ?string $pickedUpByName = null, ?string $pickedUpByPhone = null): Order
    {
        if (! $actor->isSuperAdmin() && ! $actor->hasAdminPermission('orders', 'edit') && ! $actor->hasAdminPermission('shipments', 'edit')) {
            throw new RuntimeException('You do not have permission to confirm courier pickup.');
        }

        $order->loadMissing('shipment');
        $shipment = $order->shipment;
        if (! $shipment) {
            $shipment = $order->shipment()->create([
                'provider' => 'External',
                'status' => 'processing',
            ]);
        }

        $updates = [
            'courier_job_unlocked_at' => now(),
            'courier_job_unlocked_by' => $actor->id,
        ];

        if (! $shipment->picked_up_at) {
            $updates['picked_up_at'] = now();
        }
        if ($pickedUpByName !== null && trim($pickedUpByName) !== '') {
            $updates['picked_up_by_name'] = trim($pickedUpByName);
        }
        if ($pickedUpByPhone !== null && trim($pickedUpByPhone) !== '') {
            $updates['picked_up_by_phone'] = trim($pickedUpByPhone);
        }

        $shipment->update($updates);

        return $order->fresh(['shipment', 'user', 'items']);
    }

    public function lockCourierJob(Order $order, User $actor): Order
    {
        if (! $actor->isSuperAdmin() && ! $actor->hasAdminPermission('orders', 'edit') && ! $actor->hasAdminPermission('shipments', 'edit')) {
            throw new RuntimeException('You do not have permission to lock courier job.');
        }

        $order->loadMissing('shipment');
        if ($order->shipment) {
            $order->shipment->update([
                'courier_job_unlocked_at' => null,
                'courier_job_unlocked_by' => null,
            ]);
        }

        return $order->fresh(['shipment', 'user', 'items']);
    }

    public function buildDriverJobDeepLink(Order $order): ?string
    {
        $key = $order->order_number ?: (string) $order->id;

        return $this->telegram->buildBotDeepLink('job_'.$key);
    }

    public function telegramLinkStatus(User $user): array
    {
        $linked = TelegramUser::query()
            ->where('user_id', $user->id)
            ->orderByDesc('last_interacted_at')
            ->first();

        return [
            'linked' => (bool) $linked,
            'telegram_username' => $linked?->username,
            'telegram_user_id' => $linked?->telegram_user_id,
            'chat_id' => $linked?->chat_id,
            'last_interacted_at' => $linked?->last_interacted_at?->toIso8601String(),
            'can_link' => $this->purposeForUser($user) !== null,
            'purpose' => $this->purposeForUser($user),
            'role' => $user->role,
        ];
    }

    public function purposeForUser(User $user): ?string
    {
        if ($user->isDriver()) {
            return TelegramLinkCode::PURPOSE_DRIVER;
        }

        if ($user->isAdmin()) {
            return TelegramLinkCode::PURPOSE_STAFF;
        }

        if ($user->isCustomer()) {
            return TelegramLinkCode::PURPOSE_CUSTOMER;
        }

        return null;
    }

    private function purposeMatchesCode(string $codePurpose, ?string $expected): bool
    {
        if ($expected === null) {
            return false;
        }

        if ($codePurpose === $expected) {
            return true;
        }

        return $codePurpose === TelegramLinkCode::PURPOSE_STAFF
            && in_array($expected, [TelegramLinkCode::PURPOSE_STAFF, 'admin', 'superadmin'], true);
    }

    /**
     * @return list<string>
     */
    private function phoneLookupValues(string $digits): array
    {
        $values = [$digits];

        if (str_starts_with($digits, '855') && strlen($digits) > 3) {
            $local = substr($digits, 3);
            $values[] = $local;
            $values[] = '0'.$local;
        }

        if (str_starts_with($digits, '0') && strlen($digits) > 1) {
            $local = substr($digits, 1);
            $values[] = $local;
            $values[] = '855'.$local;
        }

        return array_values(array_unique(array_filter($values)));
    }

    private function generateUniqueCode(): string
    {
        for ($i = 0; $i < 12; $i++) {
            $code = strtoupper(Str::random(8));
            $code = preg_replace('/[^A-Z0-9]/', 'X', $code) ?: Str::upper(bin2hex(random_bytes(4)));
            if (! TelegramLinkCode::query()->where('code', $code)->exists()) {
                return $code;
            }
        }

        return strtoupper(bin2hex(random_bytes(5)));
    }
}
