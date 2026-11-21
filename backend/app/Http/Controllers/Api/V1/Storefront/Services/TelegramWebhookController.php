<?php

namespace App\Http\Controllers\Api\V1\Storefront\Services;

use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\Order;
use App\Models\Product;
use App\Models\TelegramUser;
use App\Models\User;
use App\Services\DatabaseBackupService;
use App\Services\TelegramBotAuthService;
use App\Services\TelegramCartService;
use App\Services\TelegramCheckoutService;
use App\Services\TelegramInboxService;
use App\Services\TelegramService;
use App\Services\TelegramShopReportService;
use App\Services\DriverCodScanTokenService;
use App\Support\TelegramBotTexts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class TelegramWebhookController extends Controller
{
    public function __construct(
        private TelegramService $telegram,
        private TelegramBotAuthService $botAuth,
        private TelegramInboxService $inbox,
        private TelegramCartService $cart,
        private TelegramCheckoutService $checkout,
        private TelegramShopReportService $shopReports,
    ) {
    }

    public function handle(Request $request, ?string $secret = null): JsonResponse
    {
        if (! $this->validWebhookSecret($request, $secret)) {
            Log::warning('Telegram webhook rejected (secret mismatch)', [
                'has_header_secret' => $request->hasHeader('X-Telegram-Bot-Api-Secret-Token'),
            ]);

            return response()->json(['message' => 'Forbidden'], 403);
        }

        if (! $this->telegram->isEnabled()) {
            return response()->json(['ok' => true]);
        }

        $update = $request->all();

        if (isset($update['my_chat_member']) && is_array($update['my_chat_member'])) {
            try {
                $this->handleMyChatMember($update['my_chat_member']);
            } catch (\Throwable $e) {
                Log::error('Telegram my_chat_member handler failed', [
                    'error' => $e->getMessage(),
                ]);
            }

            return response()->json(['ok' => true]);
        }

        if (isset($update['callback_query']) && is_array($update['callback_query'])) {
            try {
                $this->handleCallbackQuery($update['callback_query']);
            } catch (\Throwable $e) {
                Log::error('Telegram callback handler failed', [
                    'error' => $e->getMessage(),
                ]);
            }

            return response()->json(['ok' => true]);
        }

        $message = $update['message'] ?? null;

        if (! is_array($message)) {
            return response()->json(['ok' => true]);
        }

        $chat = $message['chat'] ?? null;
        $from = $message['from'] ?? null;

        if (! is_array($chat) || ! is_array($from)) {
            return response()->json(['ok' => true]);
        }

        try {
            $telegramUser = $this->telegram->upsertTelegramUser($from, (int) $chat['id']);
            $this->scheduleKhqrSync($telegramUser);
            $chatId = (int) $chat['id'];
            $contact = $message['contact'] ?? null;

            if (is_array($contact)) {
                $this->handlePhoneContact($telegramUser, $chatId, $from, $contact);

                return response()->json(['ok' => true]);
            }

            $location = $message['location'] ?? null;
            if (is_array($location)) {
                $this->handleCheckoutLocation($telegramUser, $chatId, $location);

                return response()->json(['ok' => true]);
            }

            $caption = trim((string) ($message['caption'] ?? ''));
            $text = $this->normalizeCommandText(trim((string) ($message['text'] ?? '')));
            if ($text === '' && $caption !== '') {
                $text = $this->normalizeCommandText($caption);
            }

            $hasImage = ! empty($message['photo'])
                || (
                    is_array($message['document'] ?? null)
                    && str_starts_with((string) ($message['document']['mime_type'] ?? ''), 'image/')
                );

            if ($text === '') {
                if ($hasImage) {
                    $this->nudgeDriverCodScan($telegramUser, $chatId);
                }

                return response()->json(['ok' => true]);
            }

            if (str_starts_with($text, '/start')) {
                $this->handleStart($telegramUser, $text, $chatId);
            } elseif (str_starts_with($text, '/track')) {
                $this->handleTrack($telegramUser, $text, $chatId);
            } elseif (str_starts_with($text, '/orders')) {
                $this->handleOrders($telegramUser, $chatId);
            } elseif (str_starts_with($text, '/report') || str_starts_with($text, '/dashboard')) {
                $this->sendOwnerReport($telegramUser, $chatId, 'month');
            } elseif (str_starts_with($text, '/language') || str_starts_with($text, '/lang')) {
                $this->telegram->sendLanguageMenu($chatId, $telegramUser);
            } elseif (str_starts_with($text, '/help')) {
                $this->sendHelp($telegramUser, $chatId);
            } elseif (str_starts_with($text, '/login') || str_starts_with($text, '/register')) {
                $this->handleMenuAction($telegramUser, $chatId, 'link');
            } elseif (str_starts_with($text, '/chatid')) {
                $this->handleChatId($chat, $chatId);
            } elseif (str_starts_with($text, '/backup')) {
                $this->handleBackup($telegramUser, $chatId);
            } elseif ($action = $this->menuActionFromText($text)) {
                $this->handleMenuAction($telegramUser, $chatId, $action);
            } elseif ($this->handlePendingDriverCodQr($telegramUser, $chatId, $text)) {
                // KHQR pasted after driver COD button
            } elseif ($this->isTypingCheckoutAddress($telegramUser)) {
                $this->handleTypedCheckoutAddress($telegramUser, $chatId, $text);
            } elseif (str_starts_with($text, '/search')) {
                $query = trim(preg_replace('/^\/search(@\S+)?\s*/', '', $text) ?? '');
                $this->sendProducts($telegramUser, $chatId, $query !== '' ? $query : null);
            } elseif (str_starts_with($text, '/cart')) {
                $this->sendCart($telegramUser, $chatId);
            } elseif (in_array($this->linkedRole($telegramUser), ['customer', 'guest'], true)) {
                $product = $this->inbox->findProductFromMessage($text);
                if ($product) {
                    $this->sendProductCard($telegramUser, $chatId, $product);
                } else {
                    $this->sendProducts($telegramUser, $chatId, $text);
                }
            } else {
                $this->sendHelp($telegramUser, $chatId);
            }
        } catch (\Throwable $e) {
            Log::error('Telegram webhook handler failed', [
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json(['ok' => true]);
    }

    /**
     * @param  array<string, mixed>  $member
     */
    private function handleMyChatMember(array $member): void
    {
        $chat = $member['chat'] ?? null;
        $from = $member['from'] ?? null;
        $newStatus = (string) ($member['new_chat_member']['status'] ?? '');
        $oldStatus = (string) ($member['old_chat_member']['status'] ?? '');

        if (! is_array($chat) || ! is_array($from)) {
            return;
        }

        $chatId = (int) ($chat['id'] ?? 0);
        if ($chatId <= 0 || ($chat['type'] ?? '') !== 'private') {
            return;
        }

        if (! in_array($newStatus, ['member', 'restricted'], true)) {
            return;
        }

        if (! in_array($oldStatus, ['kicked', 'left', ''], true)) {
            return;
        }

        $telegramUser = $this->telegram->upsertTelegramUser($from, $chatId);
        $this->sendWelcomeOnce($telegramUser, $chatId);
    }

    private function sendWelcomeOnce(TelegramUser $telegramUser, int $chatId): void
    {
        $lock = 'tg-welcome-'.$chatId;
        if (! cache()->add($lock, 1, 8)) {
            return;
        }

        $this->sendWelcome($telegramUser, $chatId);
    }

    /**
     * @param  array<string, mixed>  $chat
     */
    private function handleChatId(array $chat, int $chatId): void
    {
        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $title = trim((string) ($chat['title'] ?? $chat['username'] ?? $chat['first_name'] ?? ''));
        $type = trim((string) ($chat['type'] ?? 'unknown'));

        $lines = [
            '🆔 <b>Chat ID</b>',
            '',
            '<code>'.$e((string) $chatId).'</code>',
            'Type: '.$e($type),
        ];

        if ($title !== '') {
            $lines[] = 'Name: '.$e($title);
        }

        $this->telegram->sendMessage((string) $chatId, implode("\n", $lines), null, 'HTML');
    }

    private function handleBackup(TelegramUser $telegramUser, int $chatId): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);

        if (! $this->isAllowedBackupChat($chatId, $telegramUser)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                '⛔ Backup command is only available in the backup / admin group.',
                $this->roleReplyKeyboard($telegramUser),
                null
            );

            return;
        }

        if (! $this->botAuth->resolveSuperAdminActor($telegramUser)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'backup_superadmin_only'),
                $this->roleReplyKeyboard($telegramUser),
                null
            );

            return;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            '⏳ Starting database backup… please wait.',
            $this->roleReplyKeyboard($telegramUser),
            null
        );

        dispatch(function () {
            try {
                // Manual Telegram /backup always dumps, even if data is unchanged.
                app(DatabaseBackupService::class)->run(force: true);
            } catch (\Throwable $e) {
                Log::error('Telegram /backup failed', ['error' => $e->getMessage()]);
            }
        })->afterResponse();
    }

    private function isAllowedBackupChat(int $chatId, ?TelegramUser $telegramUser = null): bool
    {
        if ($this->telegram->isAdminChatId($chatId)) {
            return true;
        }

        if ($telegramUser && $this->botAuth->resolveSuperAdminActor($telegramUser) && $chatId > 0) {
            return true;
        }

        $backupChat = trim((string) config('backup.telegram_chat_id'));
        if ($backupChat === '') {
            return false;
        }

        return (string) $chatId === (string) (int) $backupChat;
    }

    private function handleStart(TelegramUser $telegramUser, string $text, int $chatId): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $parts = preg_split('/\s+/', $text, 2);
        $payload = isset($parts[1]) ? trim($parts[1]) : '';

        if ($payload === '') {
            $this->sendWelcomeOnce($telegramUser, $chatId);

            return;
        }

        if (str_starts_with($payload, 'web_')) {
            $this->handleWebsiteLogin($telegramUser, substr($payload, 4), $chatId);

            return;
        }

        if (preg_match('/^(staff|driver|customer)_/i', $payload)) {
            $this->handleStaffOrDriverLink($telegramUser, $payload, $chatId, $locale);

            return;
        }

        if (str_starts_with($payload, 'job_')) {
            $this->handleDriverJobStart($telegramUser, substr($payload, 4), $chatId, $locale);

            return;
        }

        if (str_starts_with($payload, 'order_')) {
            $orderKey = substr($payload, 6);
            $order = Order::findByPublicKey($orderKey)?->load('shipment');

            if (! $order) {
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'order_not_found', ['key' => $orderKey])
                );

                return;
            }

            $this->telegram->subscribeChatToOrder($telegramUser, $order);
            $label = $order->order_number ?: '#'.$order->id;
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'order_subscribed', ['label' => $label])
            );
            $this->telegram->sendInvoiceToChat($chatId, $order, $locale);

            return;
        }

        if (str_starts_with($payload, 'link_')) {
            $segments = explode('_', $payload);
            if (count($segments) !== 3) {
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'invalid_account_link')
                );

                return;
            }

            $userId = (int) $segments[1];
            $signature = $segments[2];

            if (! $this->telegram->verifyAccountLinkSignature($userId, $signature)) {
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'account_link_invalid')
                );

                return;
            }

            $this->telegram->linkTelegramToUser($telegramUser, $userId);
            $linkedUser = User::query()->find($userId);
            $telegramUser->user_id = $userId;
            if ($linkedUser) {
                $telegramUser->setRelation('user', $linkedUser);
            }
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'account_linked', [
                    'role' => $this->displayRoleName($linkedUser),
                    'name' => $linkedUser?->name ?: ('#'.$userId),
                ]),
                $this->roleReplyKeyboard($telegramUser)
            );
            $this->sendWelcome($telegramUser, $chatId);

            return;
        }

        $this->sendWelcome($telegramUser, $chatId);
    }

    private function handleWebsiteLogin(TelegramUser $telegramUser, string $code, int $chatId): void
    {
        $code = strtolower(preg_replace('/[^a-f0-9]/', '', $code) ?? '');
        $result = $this->botAuth->approveWebsiteLoginSession($code, $telegramUser);
        $user = $result['user'];

        if (! $result['ok'] || ! $user) {
            $copy = match ($result['message']) {
                'not_linked' => 'Open Login / Register here first, then tap Continue with Telegram on the website again.',
                default => 'That website login link expired. Go back to the website and tap Continue with Telegram again.',
            };
            $this->telegram->sendMessage((string) $chatId, $copy, $this->roleReplyKeyboard($telegramUser), null);

            return;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            'You are signed in on the The Man Store website as '.$user->name.'. You can go back to the shop.',
            $this->roleReplyKeyboard($telegramUser),
            null
        );
    }

    private function handleStaffOrDriverLink(
        TelegramUser $telegramUser,
        string $payload,
        int $chatId,
        string $locale
    ): void {
        $result = $this->botAuth->redeemStartPayload($payload, $telegramUser);
        $isDriver = str_starts_with(strtolower($payload), 'driver_');
        $isCustomer = str_starts_with(strtolower($payload), 'customer_');

        if (! $result['ok'] || ! $result['user']) {
            $reason = match ($result['message']) {
                'expired' => 'expired',
                'used' => 'already used',
                'inactive' => 'account inactive',
                'telegram_busy' => 'this Telegram is linked to another account',
                'role_mismatch' => 'role mismatch',
                default => 'invalid or not found',
            };
            $key = $isDriver ? 'driver_link_failed' : ($isCustomer ? 'customer_link_failed' : 'staff_link_failed');
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, $key, ['reason' => $reason])
            );

            return;
        }

        $linked = $result['user'];
        $role = strtolower((string) $linked->role);
        $key = match ($role) {
            'driver' => 'driver_linked',
            'customer' => 'customer_linked',
            default => 'staff_linked',
        };
        $telegramUser->user_id = $linked->id;
        $telegramUser->setRelation('user', $linked);
        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, $key, [
                'name' => $linked->name ?: ('#'.$linked->id),
                'role' => $this->displayRoleName($linked),
            ]),
            $this->roleReplyKeyboard($telegramUser)
        );
        $this->sendWelcome($telegramUser, $chatId);
    }

    private function handleDriverJobStart(
        TelegramUser $telegramUser,
        string $orderKey,
        int $chatId,
        string $locale
    ): void {
        $order = Order::findByPublicKey($orderKey)?->load(['shipment', 'user', 'items']);
        if (! $order) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'order_not_found', ['key' => $orderKey])
            );

            return;
        }

        // External courier: no shop account required — admin must unlock after pickup confirm.
        if (! $this->botAuth->courierCanOpenJob($order)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'courier_job_locked')
            );

            return;
        }

        $this->telegram->sendDriverJobCard($chatId, $order, $locale);
    }

    private function handleTrack(TelegramUser $telegramUser, string $text, int $chatId): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $parts = preg_split('/\s+/', $text, 2);
        $orderKey = isset($parts[1]) ? trim($parts[1]) : '';

        if ($orderKey === '') {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'track_usage')
            );

            return;
        }

        $order = Order::findByPublicKey($orderKey)?->load('shipment');

        if (! $order) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'order_not_found', ['key' => $orderKey])
            );

            return;
        }

        if ($telegramUser->user_id && (int) $telegramUser->user_id !== (int) $order->user_id) {
            $linked = $this->botAuth->linkedUser($telegramUser);
            if (! $linked || (! $linked->isAdmin() && ! $linked->isDriver())) {
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'order_not_yours')
                );

                return;
            }
        }

        $this->telegram->subscribeChatToOrder($telegramUser, $order);
        $this->telegram->sendOrderStatusReply($chatId, $order, $locale);
    }

    private function handleOrders(TelegramUser $telegramUser, int $chatId): void
    {
        $actor = $this->botAuth->linkedUser($telegramUser);

        if (! $actor) {
            $this->sendInbox($telegramUser, $chatId, $this->inbox->guestProfileHtml(), 'profile');

            return;
        }

        $shopWide = $actor->isAdmin();
        $orders = $shopWide
            ? Order::query()->orderByDesc('id')->limit(6)->get()
            : Order::query()->where('user_id', $actor->id)->orderByDesc('id')->limit(6)->get();

        $this->sendInbox($telegramUser, $chatId, $this->inbox->ordersHtml($orders, $shopWide), 'orders');
    }

    private function sendWelcome(TelegramUser $telegramUser, int $chatId): void
    {
        $role = $this->linkedRole($telegramUser);
        $user = $this->botAuth->linkedUser($telegramUser);
        $html = $this->inbox->welcomeHtml($role, $user?->name);
        $keyboard = $this->roleReplyKeyboard($telegramUser);

        $sent = $this->telegram->sendMessage((string) $chatId, $html, $keyboard, 'HTML');
        if (! $sent) {
            $this->telegram->sendMessage((string) $chatId, strip_tags($html), $keyboard, null);
        }

        $this->telegram->setChatMenuButton($chatId, $this->telegram->shopNowMenuButton());
    }

    /**
     * @return array{keyboard: list<list<array{text: string}>>, resize_keyboard: bool}
     */
    private function roleReplyKeyboard(TelegramUser $telegramUser): array
    {
        $role = $this->linkedRole($telegramUser);

        $rows = match ($role) {
            'superadmin' => [
                [['text' => '📦 Orders'], ['text' => '💳 Payments']],
                [['text' => '📊 Report'], ['text' => '📅 Today']],
                [['text' => '👤 Account'], ['text' => '💾 Backup']],
                [['text' => '🚪 Sign out']],
            ],
            'admin' => [
                [['text' => '📦 Orders'], ['text' => '🚚 Shipments']],
                [['text' => '👥 Customers'], ['text' => '👤 Account']],
                [['text' => '🚪 Sign out'], ['text' => '❓ Help']],
            ],
            'driver' => [
                [['text' => '📦 Orders'], ['text' => '👤 Account']],
                [['text' => '🚪 Sign out'], ['text' => '❓ Help']],
            ],
            'customer' => [
                [['text' => '🛍 Collection'], ['text' => '🛒 Cart']],
                [['text' => '📦 Orders'], ['text' => '👤 Account']],
                [['text' => '🚪 Sign out'], ['text' => '❓ Help']],
            ],
            default => [
                [['text' => '🛍 Collection'], ['text' => '🛒 Cart']],
                [['text' => '🔐 Login / Register'], ['text' => '❓ Help']],
            ],
        };

        return [
            'keyboard' => $rows,
            'resize_keyboard' => true,
        ];
    }

    private function linkedRole(TelegramUser $telegramUser): string
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user) {
            return 'guest';
        }
        if ($user->isSuperAdmin()) {
            return 'superadmin';
        }
        if ($user->isAdmin()) {
            return 'admin';
        }
        if ($user->isDriver()) {
            return 'driver';
        }

        return 'customer';
    }

    private function welcomeKey(TelegramUser $telegramUser): string
    {
        return match ($this->linkedRole($telegramUser)) {
            'superadmin' => 'welcome_superadmin',
            'admin' => 'welcome_admin',
            default => 'welcome_customer',
        };
    }

    private function helpKey(TelegramUser $telegramUser): string
    {
        return match ($this->linkedRole($telegramUser)) {
            'superadmin' => 'help_superadmin',
            'admin' => 'help_admin',
            'guest' => 'help_guest',
            default => 'help_customer',
        };
    }

    private function frontendUrl(string $path = ''): string
    {
        $shop = rtrim((string) config('app.frontend_url', 'https://themanstore.com'), '/');
        $path = ltrim($path, '/');

        return $path === '' ? $shop : $shop.'/'.$path;
    }

    private function menuActionFromText(string $text): ?string
    {
        $normalized = mb_strtolower(trim($text));
        $normalized = preg_replace('/[^\p{L}\p{N}\s]+/u', '', $normalized) ?? $normalized;
        $normalized = trim(preg_replace('/\s+/', ' ', $normalized) ?? $normalized);

        return match ($normalized) {
            'view products', 'shop now', 'shop', 'collection' => 'shop',
            'my orders', 'orders' => 'orders',
            'search' => 'search',
            'cart', 'my cart', 'bag' => 'cart',
            'checkout' => 'checkout',
            'my profile', 'profile', 'account' => 'profile',
            'payments', 'payment' => 'payments',
            'dashboard', 'report', 'reports' => 'report',
            'today' => 'today',
            'shipments', 'shipment' => 'shipments',
            'customers', 'customer' => 'customers',
            'backup' => 'backup',
            'link account', 'link', 'connect', 'connect telegram', 'share phone number',
            'login', 'log in', 'register', 'sign in', 'sign up', 'login register' => 'link',
            'logout', 'log out', 'sign out', 'signout' => 'logout',
            'cancel' => 'cancel',
            'help' => 'help',
            default => null,
        };
    }

    /**
     * @return list<string>
     */
    private function allowedMenuActions(TelegramUser $telegramUser): array
    {
        return match ($this->linkedRole($telegramUser)) {
            'superadmin' => ['orders', 'payments', 'dashboard', 'report', 'today', 'profile', 'backup', 'help', 'shop', 'search', 'cart', 'checkout', 'link', 'logout', 'cancel'],
            'admin' => ['orders', 'shipments', 'customers', 'profile', 'help', 'shop', 'search', 'cart', 'checkout', 'link', 'logout', 'cancel'],
            'driver' => ['orders', 'profile', 'help', 'link', 'logout', 'cancel'],
            default => ['shop', 'search', 'cart', 'checkout', 'orders', 'profile', 'help', 'link', 'logout', 'cancel'],
        };
    }

    private function handleMenuAction(TelegramUser $telegramUser, int $chatId, string $action): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);

        if (! in_array($action, $this->allowedMenuActions($telegramUser), true)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'menu_denied'),
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        match ($action) {
            'orders' => $this->handleOrders($telegramUser, $chatId),
            'help' => $this->sendHelp($telegramUser, $chatId),
            'backup' => $this->handleBackup($telegramUser, $chatId),
            'shop' => $this->sendProducts($telegramUser, $chatId),
            'search' => $this->sendInbox($telegramUser, $chatId, $this->inbox->searchPromptHtml(), 'products'),
            'cart' => $this->sendCart($telegramUser, $chatId),
            'checkout' => $this->handleCheckout($telegramUser, $chatId),
            'profile' => $this->handleProfileCard($telegramUser, $chatId),
            'payments' => $this->sendInbox($telegramUser, $chatId, $this->inbox->paymentsHtml(), 'payments'),
            'dashboard' => $this->sendOwnerReport($telegramUser, $chatId, 'month'),
            'report' => $this->sendOwnerReport($telegramUser, $chatId, 'month'),
            'today' => $this->sendOwnerReport($telegramUser, $chatId, 'today'),
            'shipments' => $this->sendInbox($telegramUser, $chatId, $this->inbox->shipmentsHtml(), 'shipments'),
            'customers' => $this->sendInbox($telegramUser, $chatId, $this->inbox->customersHtml(), 'customers'),
            'link' => $this->handleLinkAccount($telegramUser, $chatId),
            'logout' => $this->handleLogout($telegramUser, $chatId),
            'cancel' => $this->handleCheckoutCancel($telegramUser, $chatId),
            default => $this->sendHelp($telegramUser, $chatId),
        };
    }

    private function sendOwnerReport(TelegramUser $telegramUser, int $chatId, string $period): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        if (! $this->botAuth->resolveSuperAdminActor($telegramUser)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'menu_denied'),
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            $this->shopReports->html($period),
            $this->shopReports->keyboard($period),
            'HTML'
        );
    }

    private function displayRoleName(?User $user): string
    {
        if (! $user) {
            return 'customer';
        }
        if ($user->isSuperAdmin()) {
            return 'Shop owner';
        }
        if ($user->isAdmin()) {
            return 'Staff';
        }
        if ($user->isDriver()) {
            return 'Driver';
        }

        return 'Customer';
    }

    private function handleLinkAccount(TelegramUser $telegramUser, int $chatId): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if ($user) {
            $this->sendInbox(
                $telegramUser,
                $chatId,
                $this->inbox->alreadyLinkedHtml((string) $user->role, (string) $user->name),
                'profile'
            );

            return;
        }

        $this->sendInbox($telegramUser, $chatId, $this->inbox->linkAccountHtml(), 'link');
        $this->telegram->sendMessage(
            (string) $chatId,
            'Tap <b>Share phone number</b> to login or create your Fit &amp; Sleek account.',
            $this->phoneShareKeyboard(),
            'HTML'
        );
    }

    /**
     * @param  array<string, mixed>  $from
     * @param  array<string, mixed>  $contact
     */
    private function handlePhoneContact(TelegramUser $telegramUser, int $chatId, array $from, array $contact): void
    {
        $fromId = (int) ($from['id'] ?? 0);
        $contactUserId = (int) ($contact['user_id'] ?? 0);

        if ($fromId <= 0 || $contactUserId !== $fromId) {
            $this->sendInbox($telegramUser, $chatId, $this->inbox->phoneLinkFailedHtml('not_yours'), 'link');
            $this->telegram->sendMessage(
                (string) $chatId,
                'Use the button below to share your own number.',
                $this->phoneShareKeyboard(),
                null
            );

            return;
        }

        $phone = trim((string) ($contact['phone_number'] ?? ''));
        if ($phone === '') {
            $this->sendInbox($telegramUser, $chatId, $this->inbox->phoneLinkFailedHtml('invalid'), 'link');
            $this->telegram->sendMessage(
                (string) $chatId,
                'Tap Share phone number again.',
                $this->phoneShareKeyboard(),
                null
            );

            return;
        }

        $result = $this->botAuth->linkByPhone($telegramUser, $phone);
        if (! $result['ok'] || ! $result['user']) {
            $this->sendInbox(
                $telegramUser,
                $chatId,
                $this->inbox->phoneLinkFailedHtml((string) $result['message']),
                'link'
            );
            $this->telegram->sendMessage(
                (string) $chatId,
                'Tap Share phone number to try again, or Cancel.',
                $this->phoneShareKeyboard(),
                null
            );

            return;
        }

        $user = $result['user'];
        $telegramUser->user_id = $user->id;
        $telegramUser->setRelation('user', $user);
        $this->cart->mergeGuestCartIntoUser($telegramUser, $user);

        $this->sendInbox(
            $telegramUser,
            $chatId,
            $this->inbox->phoneLinkSuccessHtml($user, $result['message'] === 'registered'),
            'profile'
        );
        $this->sendWelcome($telegramUser, $chatId);

        if ($this->consumeCheckoutIntent($telegramUser)) {
            $this->handleCheckout($telegramUser, $chatId);
        }
    }

    /**
     * @return array{keyboard: list<list<array<string, mixed>>>, resize_keyboard: bool, one_time_keyboard: bool}
     */
    private function phoneShareKeyboard(): array
    {
        return [
            'keyboard' => [
                [['text' => '📱 Share phone number', 'request_contact' => true]],
                [['text' => '✕ Cancel']],
            ],
            'resize_keyboard' => true,
            'one_time_keyboard' => true,
        ];
    }

    private function handleProfileCard(TelegramUser $telegramUser, int $chatId): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user) {
            $this->sendInbox($telegramUser, $chatId, $this->inbox->guestProfileHtml(), 'profile');

            return;
        }

        $this->sendInbox($telegramUser, $chatId, $this->inbox->profileHtml($user, $telegramUser), 'profile');
    }

    private function handleLogout(TelegramUser $telegramUser, int $chatId): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if ($user) {
            $this->botAuth->unlinkUser($user);
        }

        $telegramUser->user_id = null;
        $telegramUser->unsetRelation('user');

        $this->sendInbox($telegramUser, $chatId, $this->inbox->signedOutHtml(), 'signed_out');
        $this->sendWelcome($telegramUser, $chatId);
    }

    private function sendInbox(TelegramUser $telegramUser, int $chatId, string $html, string $screen): void
    {
        $this->telegram->sendMessage(
            (string) $chatId,
            $html,
            $this->inbox->inlineKeyboard($screen, $this->linkedRole($telegramUser), $this->frontendUrl()),
            'HTML'
        );
    }

    private function sendProducts(TelegramUser $telegramUser, int $chatId, ?string $query = null): void
    {
        $catalog = $this->inbox->productsCatalog($query);
        $count = $this->cart->itemCount($telegramUser);
        $this->telegram->sendMessage(
            (string) $chatId,
            $catalog['html'],
            $this->inbox->productsKeyboard($catalog['products'], $this->linkedRole($telegramUser), $count),
            'HTML'
        );
    }

    private function sendProductCard(TelegramUser $telegramUser, int $chatId, Product $product): void
    {
        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->productHtml($product),
            $this->inbox->productKeyboard($product, $this->cart->itemCount($telegramUser)),
            'HTML'
        );
    }

    private function sendCart(TelegramUser $telegramUser, int $chatId): void
    {
        $snap = $this->cart->snapshot($telegramUser);
        $role = $this->linkedRole($telegramUser);
        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->cartHtml($snap['items'], $snap['total'], $snap['count'], $role !== 'guest'),
            $this->inbox->cartKeyboard($snap['items'], $role, $this->frontendUrl(), $snap['count'] === 0),
            'HTML'
        );
    }

    private function handleAddToCart(string $callbackId, TelegramUser $telegramUser, int $chatId, int $productId): void
    {
        $result = $this->cart->addProduct($telegramUser, $productId);
        $toast = match ($result['message']) {
            'added' => 'Added to cart',
            'out_of_stock' => 'Out of stock',
            'not_found' => 'Product not found',
            default => 'Could not add to cart',
        };
        $this->telegram->answerCallbackQuery($callbackId, $toast);
        if ($result['ok']) {
            $this->sendCart($telegramUser, $chatId);
        }
    }

    private function handleCheckout(TelegramUser $telegramUser, int $chatId): void
    {
        $snap = $this->cart->snapshot($telegramUser);
        if ($snap['count'] === 0) {
            $this->sendCart($telegramUser, $chatId);

            return;
        }

        $role = $this->linkedRole($telegramUser);
        if ($role === 'guest') {
            $this->rememberCheckoutIntent($telegramUser);
            $this->sendInbox($telegramUser, $chatId, $this->inbox->checkoutLoginHtml(), 'checkout');
            $this->telegram->sendMessage(
                (string) $chatId,
                'Share your phone to login or register, then send your delivery location.',
                $this->phoneShareKeyboard(),
                null
            );

            return;
        }

        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user || ! $user->canPlaceStorefrontOrder()) {
            $this->telegram->sendMessage(
                (string) $chatId,
                'This account cannot place a shop order. Use the website cart if you are shopping as a customer.',
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        $this->putCheckoutDraft($telegramUser, ['step' => 'location']);
        $addresses = Address::query()
            ->where('user_id', $user->id)
            ->orderByDesc('is_default')
            ->orderByDesc('id')
            ->limit(4)
            ->get();

        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->checkoutLocationHtml($addresses),
            $this->inbox->checkoutLocationKeyboard($addresses, $this->frontendUrl()),
            'HTML'
        );
        $this->telegram->sendMessage(
            (string) $chatId,
            'Desktop: pick Phnom Penh or type your address. Phone GPS is optional.',
            $this->roleReplyKeyboard($telegramUser)
        );
    }

    /**
     * @param  array<string, mixed>  $location
     */
    private function handleCheckoutLocation(TelegramUser $telegramUser, int $chatId, array $location): void
    {
        $draft = $this->checkoutDraft($telegramUser);
        if (! in_array((string) ($draft['step'] ?? ''), ['location', 'address_detail', 'address_text'], true)) {
            $this->telegram->sendMessage(
                (string) $chatId,
                'Tap Checkout first, then share your delivery location.',
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user) {
            $this->handleCheckout($telegramUser, $chatId);

            return;
        }

        $lat = (float) ($location['latitude'] ?? 0);
        $lng = (float) ($location['longitude'] ?? 0);
        if ($lat === 0.0 && $lng === 0.0) {
            $this->telegram->sendMessage(
                (string) $chatId,
                'That location could not be read. Share delivery location again.',
                $this->locationShareKeyboard()
            );

            return;
        }

        $address = $this->checkout->addressFromGps($lat, $lng, $user);
        $this->showCheckoutReview($telegramUser, $chatId, $user, $address);
    }

    private function isTypingCheckoutAddress(TelegramUser $telegramUser): bool
    {
        $step = (string) ($this->checkoutDraft($telegramUser)['step'] ?? '');

        return in_array($step, ['location', 'address_detail', 'address_text'], true);
    }

    private function askTypedCheckoutAddress(TelegramUser $telegramUser, int $chatId, string $province): void
    {
        $this->putCheckoutDraft($telegramUser, [
            'step' => $province === '' ? 'address_text' : 'address_detail',
            'province' => $province,
        ]);
        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->checkoutTypeAddressHtml($province),
            $this->roleReplyKeyboard($telegramUser),
            'HTML'
        );
    }

    private function handleTypedCheckoutAddress(TelegramUser $telegramUser, int $chatId, string $text): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user) {
            $this->handleCheckout($telegramUser, $chatId);

            return;
        }

        $draft = $this->checkoutDraft($telegramUser);
        $province = (string) ($draft['province'] ?? '');

        try {
            $address = $this->checkout->addressFromText($text, $user, $province !== '' ? $province : null);
        } catch (\Throwable $e) {
            $this->telegram->sendMessage(
                (string) $chatId,
                $e->getMessage(),
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        $this->showCheckoutReview($telegramUser, $chatId, $user, $address);
    }

    private function handleSavedCheckoutAddress(string $callbackId, TelegramUser $telegramUser, int $chatId, int $addressId): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        if (! $user) {
            $this->telegram->answerCallbackQuery($callbackId, 'Login first');
            $this->handleCheckout($telegramUser, $chatId);

            return;
        }

        $saved = Address::query()->where('user_id', $user->id)->find($addressId);
        if (! $saved) {
            $this->telegram->answerCallbackQuery($callbackId, 'Address not found');

            return;
        }

        try {
            $address = $this->checkout->addressFromSaved($saved, $user);
        } catch (\Throwable $e) {
            $this->telegram->answerCallbackQuery($callbackId, $e->getMessage());

            return;
        }

        $this->telegram->answerCallbackQuery($callbackId, 'Location saved');
        $this->showCheckoutReview($telegramUser, $chatId, $user, $address);
    }

    /**
     * @param  array<string, mixed>  $address
     */
    private function showCheckoutReview(TelegramUser $telegramUser, int $chatId, User $user, array $address): void
    {
        $snap = $this->cart->snapshot($telegramUser);
        if ($snap['count'] === 0) {
            $this->clearCheckoutDraft($telegramUser);
            $this->sendCart($telegramUser, $chatId);

            return;
        }

        $quote = $this->checkout->quote($user, $snap['cart'], $address);
        $this->putCheckoutDraft($telegramUser, [
            'step' => 'pay',
            'address' => $address,
        ]);

        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->checkoutReviewHtml($address, $quote),
            $this->inbox->checkoutPaymentKeyboard($quote['cod_ok']),
            'HTML'
        );
        $this->telegram->sendMessage(
            (string) $chatId,
            'Location received. Choose KHQR or cash on delivery.',
            $this->roleReplyKeyboard($telegramUser)
        );
    }

    private function handleCheckoutCancel(TelegramUser $telegramUser, int $chatId): void
    {
        $this->clearCheckoutDraft($telegramUser);
        $this->sendWelcome($telegramUser, $chatId);
    }

    private function handleCheckoutPayment(string $callbackId, TelegramUser $telegramUser, int $chatId, string $method): void
    {
        $user = $this->botAuth->linkedUser($telegramUser);
        $draft = $this->checkoutDraft($telegramUser);
        $address = is_array($draft['address'] ?? null) ? $draft['address'] : null;

        if (! $user || ($draft['step'] ?? '') !== 'pay' || ! $address) {
            $this->telegram->answerCallbackQuery($callbackId, 'Share delivery location first');
            $this->handleCheckout($telegramUser, $chatId);

            return;
        }

        $snap = $this->cart->snapshot($telegramUser);
        if ($snap['count'] === 0) {
            $this->telegram->answerCallbackQuery($callbackId, 'Cart is empty');
            $this->sendCart($telegramUser, $chatId);

            return;
        }

        try {
            $order = $this->checkout->placeOrder($user, $snap['cart'], $address, $method);
        } catch (\Throwable $e) {
            $this->telegram->answerCallbackQuery($callbackId, mb_substr($e->getMessage(), 0, 180));

            return;
        }

        $this->clearCheckoutDraft($telegramUser);
        $this->telegram->answerCallbackQuery($callbackId, 'Order placed');
        $this->telegram->subscribeChatToOrder($telegramUser, $order);
        try {
            $this->telegram->syncTelegramProfileToUser($telegramUser, $user);
        } catch (\Throwable) {
            // Photo import is best-effort; checkout must still complete.
        }
        $this->telegram->sendMessage(
            (string) $chatId,
            $this->inbox->orderPlacedHtml((string) ($order->order_number ?: '#'.$order->id), $method),
            $this->roleReplyKeyboard($telegramUser),
            'HTML'
        );
        $this->telegram->sendInvoiceToChat($chatId, $order);
        if ($method !== 'cod') {
            $this->telegram->sendPaymentQrToChat(
                $chatId,
                $order,
                TelegramBotTexts::resolveLocale($telegramUser)
            );
        }
    }

    /**
     * @return array{keyboard: list<list<array<string, mixed>>>, resize_keyboard: bool, one_time_keyboard: bool}
     */
    private function locationShareKeyboard(): array
    {
        return [
            'keyboard' => [
                [['text' => '📍 Share delivery location', 'request_location' => true]],
                [['text' => '✕ Cancel']],
            ],
            'resize_keyboard' => true,
            'one_time_keyboard' => true,
        ];
    }

    /**
     * @param  array<string, mixed>  $draft
     */
    private function putCheckoutDraft(TelegramUser $telegramUser, array $draft): void
    {
        Cache::put($this->checkoutDraftKey($telegramUser), $draft, now()->addMinutes(30));
    }

    /**
     * @return array<string, mixed>
     */
    private function checkoutDraft(TelegramUser $telegramUser): array
    {
        $row = Cache::get($this->checkoutDraftKey($telegramUser));

        return is_array($row) ? $row : [];
    }

    private function clearCheckoutDraft(TelegramUser $telegramUser): void
    {
        Cache::forget($this->checkoutDraftKey($telegramUser));
    }

    private function checkoutDraftKey(TelegramUser $telegramUser): string
    {
        return 'tg-checkout-draft-'.(int) $telegramUser->telegram_user_id;
    }

    private function rememberCheckoutIntent(TelegramUser $telegramUser): void
    {
        Cache::put($this->checkoutIntentKey($telegramUser), 1, now()->addMinutes(30));
    }

    private function consumeCheckoutIntent(TelegramUser $telegramUser): bool
    {
        $key = $this->checkoutIntentKey($telegramUser);
        if (! Cache::pull($key)) {
            return false;
        }

        return true;
    }

    private function checkoutIntentKey(TelegramUser $telegramUser): string
    {
        return 'tg-checkout-intent-'.(int) $telegramUser->telegram_user_id;
    }

    private function validWebhookSecret(Request $request, ?string $pathSecret): bool
    {
        $expected = (string) config('services.telegram.webhook_secret');
        if ($expected === '') {
            return false;
        }

        if ($pathSecret !== null && hash_equals($expected, $pathSecret)) {
            return true;
        }

        $header = (string) $request->header('X-Telegram-Bot-Api-Secret-Token', '');

        return $header !== '' && hash_equals($expected, $header);
    }

    private function normalizeCommandText(string $text): string
    {
        if ($text === '') {
            return '';
        }

        if (preg_match('#^(/\w+)(@\S+)?(\s+.*)?$#', $text, $matches)) {
            return $matches[1].($matches[3] ?? '');
        }

        return $text;
    }

    private function sendHelp(TelegramUser $telegramUser, int $chatId): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, $this->helpKey($telegramUser)),
            $this->roleReplyKeyboard($telegramUser)
        );
    }

    private function handleCallbackQuery(array $callback): void
    {
        $callbackId = (string) ($callback['id'] ?? '');
        $data = (string) ($callback['data'] ?? '');
        $from = $callback['from'] ?? null;
        $message = $callback['message'] ?? null;
        $chat = is_array($message) ? ($message['chat'] ?? null) : null;

        if ($callbackId === '' || ! is_array($from) || ! is_array($chat)) {
            return;
        }

        $chatId = (int) $chat['id'];
        $messageId = (int) ($message['message_id'] ?? 0);
        $telegramUser = $this->telegram->upsertTelegramUser($from, $chatId);
        $this->scheduleKhqrSync($telegramUser);

        if (str_starts_with($data, 'stused_')) {
            $locale = TelegramBotTexts::resolveLocale($telegramUser);
            $this->telegram->answerCallbackQuery(
                $callbackId,
                TelegramBotTexts::get($locale, 'status_already_set_short')
            );

            return;
        }

        if (str_starts_with($data, 'rpt_')) {
            $this->telegram->answerCallbackQuery($callbackId);
            $this->sendOwnerReport($telegramUser, $chatId, substr($data, 4));

            return;
        }

        if (str_starts_with($data, 'ux_')) {
            $action = substr($data, 3);
            $toast = $action === 'logout' ? 'Signed out' : null;
            $this->telegram->answerCallbackQuery($callbackId, $toast);
            $this->handleMenuAction($telegramUser, $chatId, $action);

            return;
        }

        if (str_starts_with($data, 'prd_')) {
            $product = Product::query()->where('is_active', true)->find((int) substr($data, 4));
            $this->telegram->answerCallbackQuery($callbackId, $product ? null : 'Product not found');
            if ($product) {
                $this->sendProductCard($telegramUser, $chatId, $product);
            }

            return;
        }

        if (str_starts_with($data, 'add_')) {
            $this->handleAddToCart($callbackId, $telegramUser, $chatId, (int) substr($data, 4));

            return;
        }

        if (str_starts_with($data, 'rm_')) {
            $removed = $this->cart->removeItem($telegramUser, (int) substr($data, 3));
            $this->telegram->answerCallbackQuery($callbackId, $removed['ok'] ? 'Removed' : 'Could not remove');
            $this->sendCart($telegramUser, $chatId);

            return;
        }

        if (str_starts_with($data, 'caddr_')) {
            $this->handleSavedCheckoutAddress($callbackId, $telegramUser, $chatId, (int) substr($data, 6));

            return;
        }

        if ($data === 'zone_pp' || $data === 'zone_prov' || $data === 'addr_type') {
            $province = match ($data) {
                'zone_pp' => 'Phnom Penh',
                'zone_prov' => 'Province',
                default => '',
            };
            $this->telegram->answerCallbackQuery($callbackId);
            $this->askTypedCheckoutAddress($telegramUser, $chatId, $province);

            return;
        }

        if ($data === 'gps_phone') {
            $this->putCheckoutDraft($telegramUser, ['step' => 'location']);
            $this->telegram->answerCallbackQuery($callbackId, 'Phone only');
            $this->telegram->sendMessage(
                (string) $chatId,
                'On a phone, tap Share delivery location. Telegram Desktop cannot share GPS — type your address instead.',
                $this->locationShareKeyboard()
            );

            return;
        }

        if ($data === 'pay_khqr' || $data === 'pay_cod') {
            $this->handleCheckoutPayment($callbackId, $telegramUser, $chatId, $data === 'pay_cod' ? 'cod' : 'bakong_khqr');

            return;
        }

        if (
            ! str_starts_with($data, 'adminst_')
            && ! str_starts_with($data, 'drivest_')
            && ! str_starts_with($data, 'dpay_')
        ) {
            $this->telegram->answerCallbackQuery($callbackId);
        }

        if ($data === 'lang_menu') {
            $this->telegram->sendLanguageMenu($chatId, $telegramUser);

            return;
        }

        if ($data === 'lang_km' || $data === 'lang_en') {
            $locale = $data === 'lang_km' ? TelegramBotTexts::LOCALE_KM : TelegramBotTexts::LOCALE_EN;
            $telegramUser = $this->telegram->setPreferredLocale($telegramUser, $locale);
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, $locale === TelegramBotTexts::LOCALE_KM ? 'language_set_km' : 'language_set_en'),
                $this->roleReplyKeyboard($telegramUser)
            );

            return;
        }

        if (str_starts_with($data, 'payqr_')) {
            $this->handlePaymentQrCallback($callbackId, $data, $chatId, $telegramUser, $messageId);

            return;
        }

        if (str_starts_with($data, 'paidok_')) {
            $this->handlePaidCheckCallback($callbackId, $data, $chatId, $telegramUser, $messageId);

            return;
        }

        if (str_starts_with($data, 'shopok_')) {
            $this->handleShopKhqrConfirmCallback($callbackId, $data, $chatId, $telegramUser, $messageId);

            return;
        }

        if (str_starts_with($data, 'invoice_')) {
            $this->handleInvoiceCallback($callbackId, $data, $chatId, $telegramUser);

            return;
        }

        if (str_starts_with($data, 'adminst_')) {
            $this->handleAdminStatusCallback($callbackId, $data, $chatId, $telegramUser, $messageId);

            return;
        }

        if (str_starts_with($data, 'dpay_')) {
            $this->handleDriverCodPayCallback($callbackId, $data, $chatId, $telegramUser, $messageId);

            return;
        }

        if (str_starts_with($data, 'drivest_')) {
            $this->handleDriverStatusCallback($callbackId, $data, $chatId, $telegramUser, $messageId);
        }
    }

    private function rejectClosedOrder(
        string $callbackId,
        int $chatId,
        TelegramUser $telegramUser,
        Order $order,
        int $messageId = 0
    ): bool {
        if (! $order->isSuccessfullyClosed()) {
            return false;
        }

        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $this->telegram->answerCallbackQuery(
            $callbackId,
            TelegramBotTexts::get($locale, 'order_closed_short')
        );
        if ($messageId > 0) {
            $this->telegram->editMessageReplyMarkup(
                $chatId,
                $messageId,
                $this->telegram->keyboardForChat($chatId, $order)
            );
        }

        return true;
    }

    private function handlePaymentQrCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $orderId = (int) substr($data, 6);
        if ($orderId <= 0) {
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $order = Order::find($orderId);
        if (! $order) {
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        $driver = $this->botAuth->resolveDriverActor($telegramUser);
        $staff = $this->botAuth->resolveStaffActor($telegramUser);
        $allowed = $this->telegram->canChatAccessOrder($chatId, $order, $telegramUser)
            || $this->botAuth->courierCanOpenJob($order)
            || ($driver && $this->botAuth->driverCanOpenJob($driver, $order))
            || ($staff && $this->botAuth->staffCanManageOrders($staff));

        if (! $allowed) {
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'not_subscribed'));

            return;
        }

        if (! $this->telegram->chatMayReceivePaymentQr($chatId, $order)) {
            $this->telegram->answerCallbackQuery($callbackId, TelegramBotTexts::get($locale, 'payment_qr_customer_denied_short'));
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'payment_qr_customer_denied'),
                $this->telegram->keyboardForChat($chatId, $order)
            );

            return;
        }

        $this->telegram->answerCallbackQuery($callbackId);
        $this->telegram->sendPaymentQrToChat($chatId, $order, $locale);
    }

    private function handlePaidCheckCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $orderId = (int) substr($data, 7);
        if ($orderId <= 0) {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $order = Order::find($orderId);
        if (! $order) {
            $this->telegram->answerCallbackQuery($callbackId, 'Not found');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        $driver = $this->botAuth->resolveDriverActor($telegramUser);
        $staff = $this->botAuth->resolveStaffActor($telegramUser);
        $allowed = $this->telegram->canChatAccessOrder($chatId, $order, $telegramUser)
            || $this->botAuth->courierCanOpenJob($order)
            || ($driver && $this->botAuth->driverCanOpenJob($driver, $order))
            || ($staff && $this->botAuth->staffCanManageOrders($staff));

        if (! $allowed) {
            $this->telegram->answerCallbackQuery($callbackId, 'Denied');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'not_subscribed'));

            return;
        }

        $this->telegram->answerCallbackQuery($callbackId, 'Checking…');

        $canConfirmShop = $order->payment_method === 'cod'
            && $this->telegram->chatMayGenerateCodShopQr($chatId, $order);

        try {
            app(\App\Services\RielpayPaymentService::class)->refreshOrderKhqr($order);
            $order->refresh();
        } catch (\Throwable $e) {
            Log::warning('Telegram paid-check failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
            if ($canConfirmShop) {
                $this->telegram->rememberDriverJobChat($order, $chatId);
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'payment_still_pending_cod'),
                    $this->telegram->shopKhqrConfirmKeyboard($order, $chatId)
                );

                return;
            }
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'payment_check_failed'),
                $this->telegram->keyboardForChat($chatId, $order)
            );

            return;
        }

        if ($order->payment_status === 'paid') {
            $this->telegram->notifyOrderPaid($order->fresh(['user', 'items', 'shipment']));

            return;
        }

        if ($canConfirmShop) {
            $this->telegram->rememberDriverJobChat($order, $chatId);
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'payment_still_pending_cod'),
                $this->telegram->shopKhqrConfirmKeyboard($order, $chatId)
            );

            return;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, 'payment_still_pending'),
            $this->telegram->keyboardForChat($chatId, $order)
        );
    }

    private function handleShopKhqrConfirmCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $orderId = (int) substr($data, 7);
        if ($orderId <= 0) {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $order = Order::find($orderId);
        if (! $order) {
            $this->telegram->answerCallbackQuery($callbackId, 'Not found');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        if ($order->payment_method !== 'cod' || ! $this->telegram->chatMayGenerateCodShopQr($chatId, $order)) {
            $this->telegram->answerCallbackQuery($callbackId, 'Denied');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'not_subscribed'));

            return;
        }

        $this->telegram->rememberDriverJobChat($order, $chatId);

        if ($order->payment_status === 'paid') {
            $this->telegram->answerCallbackQuery($callbackId, 'Already paid');
            $this->telegram->notifyOrderPaid($order->fresh(['user', 'items', 'shipment']));

            return;
        }

        try {
            app(\App\Services\CodCollectionService::class)->confirmShopKhqrReceived($order, [
                'notes' => 'telegram_shop_received chat:'.$chatId,
            ]);
        } catch (\Throwable $e) {
            Log::warning('Telegram shop KHQR confirm failed', [
                'order_id' => $order->id,
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);
            $this->telegram->answerCallbackQuery($callbackId, 'Failed');
            $this->telegram->sendMessage((string) $chatId, '❌ '.$e->getMessage());

            return;
        }

        $this->telegram->answerCallbackQuery($callbackId, 'Recorded');
        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, 'shop_khqr_confirmed'),
            $this->telegram->keyboardForChat($chatId, $order->fresh(['shipment', 'payments']))
        );
    }

    private function handleInvoiceCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $orderId = (int) substr($data, 8);
        if ($orderId <= 0) {
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $order = Order::find($orderId);
        if (! $order) {
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if (! $this->telegram->canChatAccessOrder($chatId, $order, $telegramUser)) {
            $staff = $this->botAuth->resolveStaffActor($telegramUser);
            if (! $staff || ! $this->botAuth->staffCanManageOrders($staff)) {
                $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'not_subscribed'));

                return;
            }
        }

        $this->telegram->sendInvoiceToChat($chatId, $order, $locale);
    }

    private function handleAdminStatusCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);

        $staff = $this->botAuth->resolveStaffActor($telegramUser);
        $allowed = $staff && $this->botAuth->staffCanManageOrders($staff);

        if (! $allowed) {
            $this->telegram->answerCallbackQuery($callbackId, 'Staff link required');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'staff_action_denied'));

            return;
        }

        $parts = explode('_', $data);
        if (count($parts) < 3) {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $orderId = (int) ($parts[1] ?? 0);
        $status = implode('_', array_slice($parts, 2));
        if ($orderId <= 0 || $status === '') {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'invalid_order'));

            return;
        }

        $order = Order::with('shipment')->find($orderId);
        if (! $order) {
            $this->telegram->answerCallbackQuery($callbackId, 'Not found');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        $result = $this->telegram->updateShipmentStatusFromAdminChat($order, $status, $staff);
        $toast = ! empty($result['closed'])
            ? TelegramBotTexts::get($locale, 'order_closed_short')
            : (! empty($result['already'])
                ? TelegramBotTexts::get($locale, 'status_already_set_short')
                : ($result['ok']
                    ? ('OK · '.str_replace('_', ' ', $status))
                    : ('Fail · '.($result['message'] ?? 'error'))));
        $this->telegram->answerCallbackQuery($callbackId, mb_substr($toast, 0, 180));

        $fresh = $order->fresh(['shipment', 'user', 'items.product']);
        if ($messageId > 0 && $fresh) {
            $this->telegram->editMessageReplyMarkup(
                $chatId,
                $messageId,
                $this->telegram->keyboardForChat($chatId, $fresh)
            );
        }

        if (! empty($result['already']) || ! empty($result['closed'])) {
            return;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            ($result['ok'] ? '' : '❌ ').$result['message'],
            null,
            null
        );
    }

    private function nudgeDriverCodScan(TelegramUser $telegramUser, int $chatId): bool
    {
        $pending = Cache::get('tg-cod-qr:'.$chatId);
        if (! is_array($pending) || empty($pending['order_id'])) {
            return false;
        }

        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $order = Order::query()->with(['user', 'items', 'shipment', 'payments'])->find((int) $pending['order_id']);
        if (! $order) {
            return false;
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, 'driver_cod_scan_nudge')
        );
        $this->telegram->sendPaymentQrToChat($chatId, $order, $locale);

        return true;
    }

    private function handlePendingDriverCodQr(TelegramUser $telegramUser, int $chatId, string $text): bool
    {
        $pending = Cache::get('tg-cod-qr:'.$chatId);
        if (! is_array($pending) || empty($pending['order_id'])) {
            return false;
        }

        $looksLikeQr = str_starts_with($text, '000201')
            || preg_match('/@[a-z]{3,12}\b/i', $text)
            || strlen($text) >= 40;
        if (! $looksLikeQr) {
            return false;
        }

        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $order = Order::with(['shipment', 'payments'])->find((int) $pending['order_id']);
        if (! $order || $order->payment_method !== 'cod') {
            Cache::forget('tg-cod-qr:'.$chatId);

            return false;
        }

        if ($order->isSuccessfullyClosed()) {
            Cache::forget('tg-cod-qr:'.$chatId);
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'order_closed'),
                $this->telegram->keyboardForChat($chatId, $order),
                null
            );

            return true;
        }

        $method = \App\Services\CodCollectionService::DRIVER_QR;
        $this->telegram->rememberDriverJobChat($order, $chatId);

        try {
            $cod = app(\App\Services\CodCollectionService::class);
            $detected = $cod->detectBankFromQr($text);
            $cod->collectCash(
                $order,
                $method,
                isset($pending['verified_by']) ? (int) $pending['verified_by'] : null,
                null,
                [
                    'qr_payload' => $text,
                    'qr_bank' => $detected['id'],
                    'courier_name' => $pending['courier'] ?? null,
                ],
            );
        } catch (\Throwable $e) {
            $this->telegram->sendMessage((string) $chatId, '❌ '.$e->getMessage());

            return true;
        }

        Cache::forget('tg-cod-qr:'.$chatId);
        if (! empty($pending['scan_token'])) {
            app(DriverCodScanTokenService::class)->forget((string) $pending['scan_token']);
        }
        $fresh = $order->fresh(['shipment', 'payments']);
        $this->telegram->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, 'driver_cod_recorded', [
                'label' => $detected['label'] ?? 'QR',
            ]),
            $fresh ? $this->telegram->buildDriverOrderKeyboard($fresh) : null,
            null
        );

        return true;
    }

    private function handleDriverCodPayCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $parts = explode('_', $data);
        $orderId = (int) ($parts[1] ?? 0);
        $action = (string) ($parts[2] ?? '');
        $order = Order::with(['shipment', 'payments'])->find($orderId);

        if ($orderId <= 0 || ! $order || $action === '') {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        if (! $this->botAuth->courierCanOpenJob($order)) {
            $this->telegram->answerCallbackQuery($callbackId, 'Locked');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'courier_job_locked'));

            return;
        }

        if ($order->payment_method !== 'cod') {
            $this->telegram->answerCallbackQuery($callbackId, 'Not COD');

            return;
        }

        $this->telegram->rememberDriverJobChat($order, $chatId);

        $courierLabel = trim(implode(' ', array_filter([
            $telegramUser->first_name,
            $telegramUser->last_name,
            $telegramUser->username ? '@'.$telegramUser->username : null,
        ]))) ?: ('tg:'.$telegramUser->telegram_user_id);

        try {
            $result = $this->telegram->applyDriverCodAction(
                $order,
                $action,
                $telegramUser->user_id ? (int) $telegramUser->user_id : null,
                $courierLabel,
                $locale,
            );
        } catch (\Throwable $e) {
            $this->telegram->answerCallbackQuery($callbackId, 'Fail');
            $this->telegram->sendMessage((string) $chatId, '❌ '.$e->getMessage());

            return;
        }

        $this->telegram->answerCallbackQuery($callbackId, $result['ok'] ? 'OK' : 'Fail');
        if (! empty($result['send_shop_qr']) && $result['ok']) {
            $this->telegram->rememberDriverJobChat($order, $chatId);
            $this->telegram->sendPaymentQrToChat($chatId, $order->fresh(['user', 'items', 'shipment', 'payments']), $locale);
        }
        if (! empty($result['await_qr'])) {
            $scan = app(DriverCodScanTokenService::class);
            $scanToken = $scan->mint([
                'order_id' => $order->id,
                'kind' => $result['await_qr'],
                'chat_id' => $chatId,
                'verified_by' => $telegramUser->user_id ? (int) $telegramUser->user_id : null,
                'courier' => $courierLabel,
            ]);
            Cache::put('tg-cod-qr:'.$chatId, [
                'order_id' => $order->id,
                'kind' => $result['await_qr'],
                'verified_by' => $telegramUser->user_id ? (int) $telegramUser->user_id : null,
                'courier' => $courierLabel,
                'scan_token' => $scanToken,
            ], now()->addMinutes(DriverCodScanTokenService::TTL_MINUTES));
            $result['keyboard'] = [
                'inline_keyboard' => [[
                    [
                        'text' => TelegramBotTexts::get($locale, 'btn_driver_scan_bank_qr'),
                        'url' => $scan->pageUrl($scanToken),
                    ],
                ]],
            ];
        }
        $this->telegram->sendMessage(
            (string) $chatId,
            ($result['ok'] ? '' : '❌ ').$result['message'],
            $result['keyboard'],
            null
        );
    }

    private function handleDriverStatusCallback(string $callbackId, string $data, int $chatId, TelegramUser $telegramUser, int $messageId = 0): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);

        $parts = explode('_', $data);
        if (count($parts) < 3) {
            $this->telegram->answerCallbackQuery($callbackId, 'Invalid');

            return;
        }

        $orderId = (int) ($parts[1] ?? 0);
        $action = implode('_', array_slice($parts, 2));
        $order = Order::with('shipment')->find($orderId);

        if ($orderId <= 0 || ! $order) {
            $this->telegram->answerCallbackQuery($callbackId, 'Not found');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_not_found_short'));

            return;
        }

        if ($this->rejectClosedOrder($callbackId, $chatId, $telegramUser, $order, $messageId)) {
            return;
        }

        $staff = $this->botAuth->resolveStaffActor($telegramUser);
        $driver = $this->botAuth->resolveDriverActor($telegramUser);
        $shopActor = ($staff && $this->botAuth->staffCanManageOrders($staff))
            ? $staff
            : (($driver && $this->botAuth->driverCanOpenJob($driver, $order)) ? $driver : null);

        if (! $this->botAuth->canUpdateOrderStatus($telegramUser, $order)) {
            $this->telegram->answerCallbackQuery($callbackId, 'Locked');
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'courier_job_locked'));

            return;
        }

        if ($action === 'complete') {
            if ($order->payment_method === 'cod' && ! $order->isPaymentSuccessful()) {
                $this->telegram->answerCallbackQuery($callbackId, 'Pay first');
                $this->telegram->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'driver_complete_need_pay'),
                    $this->telegram->buildDriverOrderKeyboard($order)
                );

                return;
            }
            $action = 'delivered';
        }

        $allowedStatuses = ['shipped', 'in_transit', 'arrived', 'delivered'];
        if (! in_array($action, $allowedStatuses, true)) {
            $this->telegram->answerCallbackQuery($callbackId, 'Not allowed');

            return;
        }

        $shipmentStatus = strtolower((string) ($order->shipment?->status ?? ''));
        if (in_array($shipmentStatus, ['delivered'], true) || in_array(strtolower((string) $order->status), ['completed', 'cancelled'], true)) {
            $this->telegram->answerCallbackQuery($callbackId, TelegramBotTexts::get($locale, 'order_closed_short'));
            $this->telegram->sendMessage((string) $chatId, TelegramBotTexts::get($locale, 'order_closed'), null, null);

            return;
        }

        $courierLabel = trim(implode(' ', array_filter([
            $telegramUser->first_name,
            $telegramUser->last_name,
            $telegramUser->username ? '@'.$telegramUser->username : null,
        ]))) ?: ('tg:'.$telegramUser->telegram_user_id);

        $result = $shopActor
            ? $this->telegram->updateShipmentStatusFromAdminChat($order, $action, $shopActor)
            : $this->telegram->updateShipmentStatusFromAdminChat(
                $order,
                $action,
                null,
                'External courier via Telegram ('.$courierLabel.')'
            );

        if ($result['ok'] && $action === 'delivered' && ! $shopActor) {
            // Close the job only after the customer received the goods.
            if ($order->shipment) {
                $order->shipment->update([
                    'courier_job_unlocked_at' => null,
                    'courier_job_unlocked_by' => null,
                ]);
            }
        }

        $toast = ! empty($result['closed'])
            ? TelegramBotTexts::get($locale, 'order_closed_short')
            : (! empty($result['already'])
                ? TelegramBotTexts::get($locale, 'status_already_set_short')
                : ($result['ok']
                    ? ('OK · '.str_replace('_', ' ', $action))
                    : ('Fail · '.($result['message'] ?? 'error'))));
        $this->telegram->answerCallbackQuery($callbackId, mb_substr($toast, 0, 180));

        $fresh = $order->fresh(['shipment', 'user', 'items']);
        if ($messageId > 0 && $fresh) {
            $keyboard = null;
            if ($shopActor || $this->botAuth->courierCanOpenJob($fresh) || ($driver && $this->botAuth->driverCanOpenJob($driver, $fresh))) {
                $keyboard = $this->telegram->keyboardForChat($chatId, $fresh);
            }
            $this->telegram->editMessageReplyMarkup($chatId, $messageId, $keyboard);
        }

        if (! empty($result['already']) || ! empty($result['closed'])) {
            return;
        }

        $extra = '';
        if ($result['ok'] && $action === 'delivered' && ! $shopActor) {
            $extra = "\n\n".TelegramBotTexts::get($locale, 'courier_job_done_locked');
        }

        $this->telegram->sendMessage(
            (string) $chatId,
            ($result['ok'] ? '' : '❌ ').$result['message'].$extra,
            null,
            null
        );
    }

    private function scheduleKhqrSync(TelegramUser $telegramUser): void
    {
        $userId = (int) ($telegramUser->user_id ?? 0);
        if ($userId <= 0) {
            return;
        }

        dispatch(function () use ($userId) {
            app(\App\Services\RielpayPaymentService::class)->syncUserKhqr($userId);
        })->afterResponse();
    }
}
