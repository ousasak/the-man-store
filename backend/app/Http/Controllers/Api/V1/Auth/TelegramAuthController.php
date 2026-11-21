<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Models\OtpCode;
use App\Models\TelegramUser;
use App\Models\User;
use App\Services\TelegramOidcService;
use App\Services\TelegramBotAuthService;
use App\Services\TelegramService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class TelegramAuthController extends Controller
{
    public function __construct(
        private TelegramBotAuthService $botAuth,
        private TelegramService $telegram,
        private TelegramOidcService $oidc,
    ) {
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'id' => ['required', 'integer'],
            'first_name' => ['nullable', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'username' => ['nullable', 'string', 'max:120'],
            'photo_url' => ['nullable', 'string', 'max:2048'],
            'auth_date' => ['required', 'integer'],
            'hash' => ['required', 'string'],
        ]);

        if (! $this->isValidTelegramLogin($data)) {
            return response()->json(['message' => 'Telegram login could not be verified.'], 401);
        }

        if (abs(time() - (int) $data['auth_date']) > 86400) {
            return response()->json(['message' => 'Telegram login expired. Try again.'], 401);
        }

        $telegramId = (int) $data['id'];
        $name = trim(($data['first_name'] ?? '').' '.($data['last_name'] ?? '')) ?: ('Telegram '.$telegramId);
        $username = trim((string) ($data['username'] ?? ''));
        $email = 'tg'.$telegramId.'@telegram.themanstore.local';

        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $telegramUser?->user_id ? User::query()->find($telegramUser->user_id) : null;

        if (! $user) {
            $user = User::query()->where('email', $email)->first();
        }

        if (! $user && $username !== '') {
            $user = User::query()
                ->where('email', strtolower($username).'@telegram.themanstore.local')
                ->first();
        }

        if (! $user) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make(Str::random(32)),
                'role' => 'customer',
                'status' => 'active',
                'email_verified_at' => now(),
                'social_type' => 'telegram',
            ]);
        } elseif (! $user->isActive()) {
            return response()->json(['message' => 'This account is inactive.'], 422);
        }

        TelegramUser::updateOrCreate(
            ['telegram_user_id' => $telegramId],
            [
                'user_id' => $user->id,
                'chat_id' => $telegramUser?->chat_id ?: $telegramId,
                'username' => $username !== '' ? $username : ($telegramUser?->username),
                'first_name' => $data['first_name'] ?? $telegramUser?->first_name,
                'last_name' => $data['last_name'] ?? $telegramUser?->last_name,
                'last_interacted_at' => now(),
            ]
        );

        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $this->telegram->applyLoginWidgetProfile($user, $data, $telegramUser);

        return response()->json($this->sessionPayload($user->fresh()));
    }

    public function loginWithOidc(Request $request)
    {
        $data = $request->validate([
            'id_token' => ['required', 'string', 'max:8192'],
        ]);

        $claims = $this->oidc->verifyIdToken($data['id_token']);
        if (! $claims) {
            return response()->json(['message' => 'Telegram login could not be verified.'], 401);
        }

        $telegramId = (int) ($claims['id'] ?? 0);
        $given = trim((string) ($claims['given_name'] ?? ''));
        $family = trim((string) ($claims['family_name'] ?? ''));
        $name = trim((string) ($claims['name'] ?? ''));
        if ($name === '') {
            $name = trim($given.' '.$family);
        }
        $username = trim((string) ($claims['preferred_username'] ?? ''));
        $photoUrl = trim((string) ($claims['picture'] ?? ''));
        $phone = trim((string) ($claims['phone_number'] ?? ''));

        $widget = [
            'id' => $telegramId,
            'first_name' => $given !== '' ? $given : $name,
            'last_name' => $family,
            'username' => $username,
            'photo_url' => $photoUrl,
        ];

        $email = 'tg'.$telegramId.'@telegram.themanstore.local';
        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $telegramUser?->user_id ? User::query()->find($telegramUser->user_id) : null;

        if (! $user) {
            $user = User::query()->where('email', $email)->first();
        }

        if (! $user && $username !== '') {
            $user = User::query()
                ->where('email', strtolower($username).'@telegram.themanstore.local')
                ->first();
        }

        if (! $user && $phone !== '') {
            $digits = preg_replace('/\D+/', '', $phone) ?? '';
            if (strlen($digits) >= 8) {
                $user = User::query()
                    ->where('phone', $phone)
                    ->orWhere('phone', $digits)
                    ->orWhere('phone', '0'.ltrim($digits, '0'))
                    ->first();
            }
        }

        if (! $user) {
            $user = User::create([
                'name' => $name !== '' ? $name : ('Telegram '.$telegramId),
                'email' => $email,
                'phone' => $phone !== '' ? $phone : null,
                'password' => Hash::make(Str::random(32)),
                'role' => 'customer',
                'status' => 'active',
                'email_verified_at' => now(),
                'social_type' => 'telegram',
            ]);
        } elseif (! $user->isActive()) {
            return response()->json(['message' => 'This account is inactive.'], 422);
        } elseif ($phone !== '' && ! filled($user->phone)) {
            $user->update(['phone' => $phone]);
        }

        TelegramUser::updateOrCreate(
            ['telegram_user_id' => $telegramId],
            [
                'user_id' => $user->id,
                'chat_id' => $telegramUser?->chat_id ?: $telegramId,
                'username' => $username !== '' ? $username : ($telegramUser?->username),
                'first_name' => $widget['first_name'] ?: ($telegramUser?->first_name),
                'last_name' => $widget['last_name'] ?: ($telegramUser?->last_name),
                'last_interacted_at' => now(),
            ]
        );

        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $this->telegram->applyLoginWidgetProfile($user->fresh(), $widget, $telegramUser);

        return response()->json($this->sessionPayload($user->fresh()));
    }

    public function createWebSession(): \Illuminate\Http\JsonResponse
    {
        try {
            $session = $this->botAuth->createWebsiteLoginSession();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Telegram web session create failed', [
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => 'Could not start Telegram login. Please try again.',
            ], 503);
        }

        if (empty($session['bot_url'])) {
            return response()->json(['message' => 'Telegram bot is not configured.'], 422);
        }

        return response()->json([
            'code' => $session['code'],
            'bot_url' => $session['bot_url'],
            'bot_username' => $this->telegram->botUsername(),
        ]);
    }

    public function pollWebSession(string $code): \Illuminate\Http\JsonResponse
    {
        $code = strtolower(preg_replace('/[^a-f0-9]/', '', $code) ?? '');
        if (strlen($code) < 8) {
            return response()->json(['status' => 'expired']);
        }

        $row = $this->botAuth->consumeWebsiteLoginSession($code);
        $status = (string) ($row['status'] ?? 'expired');

        if ($status === 'ready' && ! empty($row['token'])) {
            return response()->json([
                'status' => 'ready',
                'token' => $row['token'],
                'user' => $row['user'] ?? null,
            ]);
        }

        if ($status === 'denied') {
            return response()->json([
                'status' => 'denied',
                'message' => 'Open the The Man Store bot and tap Login / Register first, then try again.',
            ]);
        }

        return response()->json(['status' => $status === 'pending' ? 'pending' : 'expired']);
    }

    public function loginWithWebApp(Request $request)
    {
        $data = $request->validate([
            'init_data' => ['required', 'string', 'max:4096'],
        ]);

        $parsed = $this->parseWebAppInitData($data['init_data']);
        if (! $parsed) {
            return response()->json(['message' => 'Telegram session could not be verified.'], 401);
        }

        $userJson = (string) ($parsed['user'] ?? '');
        $tgUser = json_decode($userJson, true);
        if (! is_array($tgUser)) {
            return response()->json(['message' => 'Telegram session is missing a user.'], 401);
        }

        $telegramId = (int) ($tgUser['id'] ?? 0);
        if ($telegramId <= 0) {
            return response()->json(['message' => 'Telegram session is missing a user.'], 401);
        }

        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $telegramUser?->user_id ? User::query()->find($telegramUser->user_id) : null;

        $first = trim((string) ($tgUser['first_name'] ?? ''));
        $last = trim((string) ($tgUser['last_name'] ?? ''));
        $username = trim((string) ($tgUser['username'] ?? ''));
        $photoUrl = trim((string) ($tgUser['photo_url'] ?? ''));
        $name = trim($first.' '.$last) ?: ($username !== '' ? $username : ('Telegram '.$telegramId));
        $email = 'tg'.$telegramId.'@telegram.themanstore.local';

        if (! $user) {
            $user = User::query()->where('email', $email)->first();
        }

        if (! $user && $username !== '') {
            $user = User::query()
                ->where('email', strtolower($username).'@telegram.themanstore.local')
                ->first();
        }

        if (! $user) {
            $user = User::create([
                'name' => $name,
                'email' => $email,
                'password' => Hash::make(Str::random(32)),
                'role' => 'customer',
                'status' => 'active',
                'email_verified_at' => now(),
                'social_type' => 'telegram',
            ]);
        } elseif (! $user->isActive()) {
            return response()->json(['message' => 'This account is inactive.'], 422);
        }

        TelegramUser::updateOrCreate(
            ['telegram_user_id' => $telegramId],
            [
                'user_id' => $user->id,
                'chat_id' => $telegramUser?->chat_id ?: $telegramId,
                'username' => $username !== '' ? $username : ($telegramUser?->username),
                'first_name' => $first !== '' ? $first : ($telegramUser?->first_name),
                'last_name' => $last !== '' ? $last : ($telegramUser?->last_name),
                'last_interacted_at' => now(),
            ]
        );

        $telegramUser = TelegramUser::query()->where('telegram_user_id', $telegramId)->first();
        $user = $this->telegram->applyLoginWidgetProfile($user->fresh(), [
            'id' => $telegramId,
            'first_name' => $first,
            'last_name' => $last,
            'username' => $username,
            'photo_url' => $photoUrl,
        ], $telegramUser);

        return response()->json($this->sessionPayload($user->fresh()));
    }

    /**
     * @return array<string, string>|null
     */
    private function parseWebAppInitData(string $initData): ?array
    {
        $token = trim((string) config('services.telegram.bot_token'));
        if ($token === '' || $initData === '') {
            return null;
        }

        $params = [];
        parse_str($initData, $params);
        $hash = strtolower((string) ($params['hash'] ?? ''));
        if ($hash === '') {
            return null;
        }
        unset($params['hash']);
        ksort($params);

        $parts = [];
        foreach ($params as $key => $value) {
            $parts[] = $key.'='.$value;
        }

        $secretKey = hash_hmac('sha256', $token, 'WebAppData', true);
        $computed = hash_hmac('sha256', implode("\n", $parts), $secretKey);
        if (! hash_equals($computed, $hash)) {
            return null;
        }

        if (abs(time() - (int) ($params['auth_date'] ?? 0)) > 86400) {
            return null;
        }

        return $params;
    }

    public function startPhoneLogin(Request $request)
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:30'],
        ]);

        $matches = $this->botAuth->findUsersByPhone($data['phone']);
        if ($matches->isEmpty()) {
            return response()->json([
                'message' => 'No The Man Store account uses this phone. Open the Telegram bot, tap Login / Register, and share this number first.',
            ], 422);
        }

        if ($matches->count() > 1) {
            return response()->json([
                'message' => 'More than one account uses this number. Ask the shop to clean up the phone on those profiles.',
            ], 422);
        }

        /** @var User $user */
        $user = $matches->first();
        if (! $user->isActive()) {
            return response()->json(['message' => 'This shop account is inactive.'], 422);
        }

        $telegramUser = TelegramUser::query()
            ->where('user_id', $user->id)
            ->where('chat_id', '>', 0)
            ->orderByDesc('last_interacted_at')
            ->first();

        if (! $telegramUser) {
            return response()->json([
                'message' => 'Open @'.($this->telegram->botUsername() ?: 'themanstore_bot').' first, then tap Login / Register so we can send you a code.',
            ], 422);
        }

        $code = (string) random_int(100000, 999999);
        $otpKey = 'tg-login:'.$user->id;
        $expiresMinutes = 10;

        OtpCode::query()->where('email', $otpKey)->where('purpose', 'telegram_login')->delete();
        OtpCode::create([
            'email' => $otpKey,
            'purpose' => 'telegram_login',
            'code_hash' => Hash::make($code),
            'expires_at' => now()->addMinutes($expiresMinutes),
        ]);

        $sent = $this->telegram->sendMessage(
            (string) $telegramUser->chat_id,
            "🔐 <b>Website login code</b>\n\n"
                ."Your Fit &amp; Sleek code is <code>{$code}</code>\n"
                ."It expires in {$expiresMinutes} minutes.\n\n"
                .'If you did not request this, ignore the message.',
            null,
            'HTML'
        );

        if (! $sent) {
            return response()->json([
                'message' => 'Could not send a code to Telegram. Open the bot and try again.',
            ], 422);
        }

        $challengeToken = Str::random(64);
        Cache::put('telegram_web_login:'.$challengeToken, [
            'user_id' => $user->id,
            'otp_key' => $otpKey,
        ], now()->addMinutes($expiresMinutes));

        return response()->json([
            'message' => 'We sent a 6-digit code to your Telegram chat with @'.($this->telegram->botUsername() ?: 'themanstore_bot').'.',
            'challenge_token' => $challengeToken,
            'bot_url' => $this->telegram->botUsername()
                ? 'https://t.me/'.$this->telegram->botUsername()
                : null,
        ]);
    }

    public function verifyPhoneLogin(Request $request)
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
            'code' => ['required', 'string', 'max:8'],
        ]);

        $payload = Cache::get('telegram_web_login:'.$data['challenge_token']);
        if (! is_array($payload) || empty($payload['user_id']) || empty($payload['otp_key'])) {
            return response()->json(['message' => 'This login code expired. Request a new one.'], 422);
        }

        $otp = OtpCode::query()
            ->where('email', $payload['otp_key'])
            ->where('purpose', 'telegram_login')
            ->whereNull('consumed_at')
            ->orderByDesc('id')
            ->first();

        if (! $otp || $otp->expires_at?->isPast()) {
            return response()->json(['message' => 'This login code expired. Request a new one.'], 422);
        }

        if ($otp->attempts >= 5) {
            return response()->json(['message' => 'Too many attempts. Request a new code.'], 422);
        }

        if (! Hash::check(trim($data['code']), $otp->code_hash)) {
            $otp->increment('attempts');

            return response()->json(['message' => 'That code is incorrect. Check Telegram and try again.'], 422);
        }

        $user = User::query()->find($payload['user_id']);
        if (! $user || ! $user->isActive()) {
            return response()->json(['message' => 'This shop account is inactive.'], 422);
        }

        $otp->update(['consumed_at' => now()]);
        Cache::forget('telegram_web_login:'.$data['challenge_token']);

        return response()->json($this->sessionPayload($user));
    }

    /**
     * @return array{token: string, user: array<string, mixed>}
     */
    private function sessionPayload(User $user): array
    {
        return [
            'token' => $user->createToken('themanstorepro')->plainTextToken,
            'user' => $this->botAuth->shopAuthPayload($user),
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function isValidTelegramLogin(array $data): bool
    {
        $token = trim((string) config('services.telegram.bot_token'));
        $hash = strtolower((string) ($data['hash'] ?? ''));
        if ($token === '' || $hash === '') {
            return false;
        }

        unset($data['hash']);
        ksort($data);

        $parts = [];
        foreach ($data as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            $parts[] = $key.'='.$value;
        }

        $checkString = implode("\n", $parts);
        $secretKey = hash('sha256', $token, true);
        $computed = hash_hmac('sha256', $checkString, $secretKey);

        return hash_equals($computed, $hash);
    }
}
