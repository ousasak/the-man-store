<?php

namespace App\Services;

use App\Jobs\WatchKhqrPayment;
use App\Models\Notification;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Shipment;
use App\Models\ShipmentTrackingEvent;
use App\Models\TelegramOrderSubscription;
use App\Models\TelegramUser;
use App\Models\User;
use App\Support\ShippingAddress;
use App\Support\TelegramBotTexts;
use Endroid\QrCode\Color\Color;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use App\Support\Media;

class TelegramService
{
    public function __construct(
        private readonly OrderReceiptTokenService $receiptTokens,
        private readonly CodCollectionService $codCollection,
        private readonly RielpayPaymentService $rielpayPayments,
        private readonly InvoiceService $invoices,
    ) {
    }

    public function isEnabled(): bool
    {
        return filled(config('services.telegram.bot_token'));
    }

    public function botUsername(): ?string
    {
        $name = trim((string) config('services.telegram.bot_name', ''));

        return $name !== '' ? ltrim($name, '@') : null;
    }

    /**
     * Numeric bot id (first part of TELEGRAM_BOT_TOKEN). Used by oauth.telegram.org.
     */
    public function botId(): ?int
    {
        $token = trim((string) config('services.telegram.bot_token'));
        if ($token === '' || ! str_contains($token, ':')) {
            return null;
        }

        $id = (int) strtok($token, ':');

        return $id > 0 ? $id : null;
    }

    /**
     * Client ID from BotFather Login Widget (defaults to the bot id).
     */
    public function loginClientId(): ?string
    {
        $configured = trim((string) config('services.telegram.login_client_id', ''));
        if ($configured !== '') {
            return $configured;
        }

        $botId = $this->botId();

        return $botId ? (string) $botId : null;
    }

    /**
     * Persistent composer button. Telegram applies menu_button only when sent as a JSON object.
     *
     * @param  array<string, mixed>|null  $menuButton
     */
    public function setChatMenuButton(?int $chatId = null, ?array $menuButton = null): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }

        $payload = [
            'menu_button' => $menuButton ?? $this->shopNowMenuButton(),
        ];
        if ($chatId !== null && $chatId !== 0) {
            $payload['chat_id'] = $chatId;
        }

        $endpoint = 'https://api.telegram.org/bot'.config('services.telegram.bot_token').'/setChatMenuButton';

        try {
            $response = Http::timeout(15)->post($endpoint, $payload);
            if ($response->successful() && $response->json('ok') === true) {
                return true;
            }

            Log::warning('Telegram setChatMenuButton failed', [
                'chat_id' => $chatId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        } catch (\Throwable $e) {
            Log::error('Telegram setChatMenuButton exception', [
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);
        }

        return false;
    }

    /**
     * @return array{type: string, text: string, web_app: array{url: string}}
     */
    public function shopNowMenuButton(): array
    {
        $shopUrl = rtrim((string) config('app.frontend_url', 'https://themanstore.com'), '/');

        return [
            'type' => 'web_app',
            'text' => '🛍️ Shop Now',
            'web_app' => ['url' => $shopUrl === '' ? 'https://themanstore.com' : $shopUrl],
        ];
    }

    public function customerPayUrl(Order $order): ?string
    {
        $shopUrl = rtrim((string) config('app.frontend_url', 'https://themanstore.com'), '/');
        if ($shopUrl === '' || $order->id <= 0) {
            return null;
        }

        return $shopUrl.'/payment/'.$order->id;
    }

    public function buildBotDeepLink(string $startPayload): ?string
    {
        $username = $this->botUsername();
        if (! $username) {
            return null;
        }

        return 'https://t.me/'.$username.'?start='.rawurlencode($startPayload);
    }

    public function buildOrderConnectLink(Order $order): ?string
    {
        $key = $order->order_number ?: (string) $order->id;

        return $this->buildBotDeepLink('order_'.$key);
    }

    public function buildAccountConnectLink(int $userId): ?string
    {
        $signature = substr(hash_hmac('sha256', (string) $userId, (string) config('app.key')), 0, 16);

        return $this->buildBotDeepLink('link_'.$userId.'_'.$signature);
    }

    public function verifyAccountLinkSignature(int $userId, string $signature): bool
    {
        $expected = substr(hash_hmac('sha256', (string) $userId, (string) config('app.key')), 0, 16);

        return hash_equals($expected, $signature);
    }

    public function notifyOrderPaid(Order $order): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $lockKey = 'tg-order-paid-notified-'.$order->id;
        $order->loadMissing(['user', 'items', 'shipment', 'payments']);
        if ($order->payment_method === 'cod' && $this->codCollection->isPendingCustomerToDriverRemittance($order)) {
            return;
        }

        if (! Cache::add($lockKey, 1, now()->addDay())) {
            return;
        }

        try {
            if ($order->payment_method === 'cod') {
                $this->notifyCodShopPaymentSuccess($order);

                return;
            }

            $this->notifyAdminOfNewOrder($order);
            $this->createInAppNotification(
                $order,
                'order_paid',
                'Order confirmed',
                'Your payment was received. We are preparing your order.'
            );

            $label = $order->order_number ?: '#'.$order->id;
            $total = number_format((float) $order->total, 2);

            $this->notifyOrderRecipients($order, function (string $locale) use ($order, $label, $total) {
                $message = TelegramBotTexts::get($locale, 'order_confirmed', $this->htmlReplace([
                    'label' => $label,
                    'total' => $total,
                ]));

                return [$message, $this->buildOrderActionKeyboard($order, null, $locale)];
            });
        } catch (\Throwable $e) {
            Cache::forget($lockKey);
            Log::error('Telegram notifyOrderPaid failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Shop received COD payment (customer paid shop, or driver paid shop).
     * Alert admin + driver always. Customer only for at-delivery shop payment (២ក / ២ខ), never option 1.
     */
    private function notifyCodShopPaymentSuccess(Order $order): void
    {
        $order->loadMissing(['user', 'items.product', 'shipment', 'payments']);

        $customerPaidShop = $this->codCollection->isCustomerPaysShopSettlement($order);
        $driverAdvance = $this->codCollection->isDriverAdvanceSettlement($order);
        $kind = $customerPaidShop ? 'cod_customer_paid' : 'cod_driver_paid';
        $label = $order->order_number ?: '#'.$order->id;
        $total = number_format((float) $order->total, 2);
        $amount = $this->formatCodSettlementAmount($order);

        $adminCard = $this->formatAdminOrderCardHtml($order, $kind);
        $adminKeyboard = $this->buildAdminOrderKeyboard($order);
        foreach ($this->resolveAdminChatIds() as $chatId) {
            $this->sendMessage((string) $chatId, $adminCard, $adminKeyboard, 'HTML');
        }

        foreach ($this->resolveDriverChatIds($order) as $chatId) {
            $locale = $this->resolveLocaleForChatId((int) $chatId);
            $key = $customerPaidShop ? 'driver_customer_paid_shop' : 'driver_paid_on_behalf';
            $message = TelegramBotTexts::get($locale, $key, $this->htmlReplace([
                'label' => $label,
                'total' => $total,
                'amount' => $amount,
            ]));
            $this->sendMessage(
                (string) $chatId,
                $message,
                $this->buildDriverOrderKeyboard($order),
                'HTML'
            );
        }

        if ($driverAdvance) {
            return;
        }

        $this->createInAppNotification(
            $order,
            'order_paid',
            'Order completed',
            'Payment was received. This order is complete.'
        );

        foreach ($this->resolveOrderChatIds($order) as $chatId) {
            $chatId = (int) $chatId;
            if ($chatId <= 0 || ! $this->isCustomerChatForOrder($chatId, $order)) {
                continue;
            }

            $locale = $this->resolveLocaleForChatId($chatId);
            $key = $customerPaidShop ? 'order_paid_completed' : 'order_completed_paid';
            $message = TelegramBotTexts::get($locale, $key, $this->htmlReplace([
                'label' => $label,
                'total' => $total,
            ]));
            $this->sendMessage(
                (string) $chatId,
                $message,
                $this->buildOrderActionKeyboard($order, null, $locale),
                'HTML'
            );
        }
    }

    public function rememberDriverJobChat(Order $order, int $chatId): void
    {
        if ($chatId <= 0 || $this->isAdminChatId($chatId) || $this->isCustomerChatForOrder($chatId, $order)) {
            return;
        }

        Cache::put('tg-cod-driver-chat:'.$order->id, $chatId, now()->addDays(14));

        $payment = Payment::query()->where('order_id', $order->id)->latest('id')->first();
        if (! $payment) {
            return;
        }

        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        if ((int) ($raw['driver_telegram_chat_id'] ?? 0) === $chatId) {
            return;
        }

        $payment->update([
            'raw_response' => array_merge($raw, ['driver_telegram_chat_id' => $chatId]),
        ]);
    }

    public function notifyOrderPlacedCod(Order $order): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $order->loadMissing(['user', 'items', 'shipment']);

        $this->notifyAdminOfNewCodOrder($order);
        $this->createInAppNotification(
            $order,
            'order_placed_cod',
            'COD order placed',
            'Your COD order was placed. Pay when it is delivered.'
        );

        $label = $order->order_number ?: '#'.$order->id;
        $total = number_format((float) $order->total, 2);

        $this->notifyOrderRecipients($order, function (string $locale) use ($order, $label, $total) {
            $message = TelegramBotTexts::get($locale, 'order_placed_cod', $this->htmlReplace([
                'label' => $label,
                'total' => $total,
            ]));

            return [$message, $this->buildOrderActionKeyboard($order, null, $locale)];
        });
    }

    /**
     * Customer Telegram alert for order status changes (processing, preparing, cancelled, …).
     * Skips statuses that already have dedicated shipment/payment handlers.
     */
    public function notifyOrderStatusChanged(Order $order, string $status): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $status = strtolower(trim($status));
        $skip = ['paid', 'pending_payment', 'processing', 'preparing', 'shipped', 'delivered', 'completed', 'in_transit', 'arrived'];
        if (in_array($status, $skip, true)) {
            return;
        }

        $order->loadMissing(['user', 'shipment']);
        $label = $order->order_number ?: '#'.$order->id;

        $textKey = match ($status) {
            'processing', 'preparing' => 'order_processing',
            'cancelled' => 'order_cancelled',
            'failed' => 'order_failed',
            'returned' => 'order_returned',
            default => null,
        };

        if ($textKey === null) {
            return;
        }

        $this->createInAppNotification(
            $order,
            'order_status_'.$status,
            'Order update',
            'Order '.$label.' is now '.$status.'.'
        );

        $this->notifyOrderRecipients($order, function (string $locale) use ($order, $label, $textKey) {
            $message = TelegramBotTexts::get($locale, $textKey, $this->htmlReplace(['label' => $label]));

            return [$message, $this->buildOrderActionKeyboard($order, null, $locale)];
        });

        if (in_array(strtolower(trim($status)), ['cancelled', 'canceled', 'failed'], true)) {
            $this->notifyStaffOrderEvent($order, $status === 'failed' ? 'failed' : 'cancelled');
        }
    }

    public function notifyShipmentStatusChanged(Shipment $shipment): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $status = strtolower(trim((string) $shipment->status));

        if ($status === 'shipped') {
            $this->notifyOrderShipped($shipment);

            return;
        }

        if ($status === 'delivered') {
            $this->notifyOrderDelivered($shipment);

            return;
        }

        $shipment->loadMissing('order.user');
        $order = $shipment->order;
        if (! $order) {
            return;
        }

        $label = $order->order_number ?: '#'.$order->id;
        $trackingCode = $shipment->tracking_code ?: '—';

        $textKey = match ($status) {
            'processing', 'pending' => 'order_processing',
            'in_transit' => 'order_in_transit',
            'arrived' => 'order_arrived',
            'failed' => 'order_failed',
            'returned' => 'order_returned',
            default => null,
        };

        if ($textKey === null) {
            return;
        }

        // pending is the COD placement state — covered by notifyOrderPlacedCod.
        if ($status === 'pending') {
            return;
        }

        $this->createInAppNotification(
            $order,
            'shipment_'.$status,
            'Shipment update',
            'Order '.$label.' shipment is now '.$status.'.'
        );

        $this->notifyOrderRecipients($order, function (string $locale) use ($order, $shipment, $label, $trackingCode, $textKey) {
            $provider = $shipment->provider && strtolower((string) $shipment->provider) !== 'internal'
                ? (string) $shipment->provider
                : TelegramBotTexts::get($locale, 'courier_fallback');
            $message = TelegramBotTexts::get($locale, $textKey, $this->htmlReplace([
                'label' => $label,
                'provider' => $provider,
                'tracking' => $trackingCode,
            ]));

            return [$message, $this->buildOrderActionKeyboard($order, $shipment, $locale)];
        });
    }

    public function notifyAdminOfNewCodOrder(Order $order): void
    {
        $this->notifyStaffOrderEvent($order, 'cod');
    }

    /**
     * Alert every linked shop owner + staff (and the admin group) about an order event.
     */
    public function notifyStaffOrderEvent(Order $order, string $kind): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $lockKey = 'tg-staff-order-'.$kind.'-'.$order->id;
        if (! Cache::add($lockKey, 1, now()->addDay())) {
            return;
        }

        $order->loadMissing(['user', 'items.product', 'shipment', 'payments']);
        $html = $this->formatAdminOrderCardHtml($order, $kind);
        $keyboard = $this->buildAdminOrderKeyboard($order);
        $sent = 0;

        foreach ($this->resolveAdminChatIds() as $chatId) {
            if ($this->sendMessage((string) $chatId, $html, $keyboard, 'HTML')) {
                $sent++;
            }
        }

        if ($sent === 0) {
            Cache::forget($lockKey);
            Log::warning('Telegram staff order alert had no recipients', [
                'order_id' => $order->id,
                'kind' => $kind,
            ]);
        }
    }

    public function notifyStaffOfNewOrder(Order $order): void
    {
        $kind = strtolower((string) $order->payment_method) === 'cod' ? 'cod' : 'new';
        $this->notifyStaffOrderEvent($order, $kind);
    }

    public function notifyPaymentFailed(Order $order, ?Payment $payment = null, string $reason = 'failed'): void
    {
        $this->notifyStaffOrderEvent($order, $reason === 'expired' ? 'expired' : 'failed');
    }

    public function buildReceiptUrl(Order $order): string
    {
        return $this->receiptTokens->buildReceiptUrl($order);
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    public function buildOrderActionKeyboard(Order $order, ?Shipment $shipment = null, string $locale = TelegramBotTexts::LOCALE_EN): ?array
    {
        if ($order->isSuccessfullyClosed()) {
            return $this->buildClosedOrderKeyboard($order, $locale);
        }

        $order->loadMissing('shipment');
        $shipment ??= $order->shipment;
        $rows = [];

        $actionRow = [];
        $actionRow[] = [
            'text' => TelegramBotTexts::get($locale, 'btn_invoice'),
            'callback_data' => 'invoice_'.$order->id,
        ];

        if ($actionRow !== []) {
            $rows[] = $actionRow;
        }

        if ($order->payment_status !== 'paid' && $order->payment_method === 'bakong_khqr') {
            $rows[] = [[
                'text' => TelegramBotTexts::get($locale, 'btn_payment_qr'),
                'callback_data' => 'payqr_'.$order->id,
            ]];
            $payUrl = $this->customerPayUrl($order);
            if ($payUrl !== null) {
                $rows[] = [[
                    'text' => TelegramBotTexts::get($locale, 'btn_pay_in_app'),
                    'web_app' => ['url' => $payUrl],
                ]];
            }
            $rows[] = [[
                'text' => TelegramBotTexts::get($locale, 'btn_i_paid'),
                'callback_data' => 'paidok_'.$order->id,
            ]];
        }

        if ($shipment && filled($shipment->external_tracking_url)) {
            $provider = $shipment->provider ?: TelegramBotTexts::get($locale, 'courier_fallback');
            $rows[] = [[
                'text' => TelegramBotTexts::get($locale, 'btn_track_on', ['provider' => $provider]),
                'url' => $shipment->external_tracking_url,
            ]];
        }

        return $rows !== [] ? ['inline_keyboard' => $rows] : null;
    }

    public function resolveLocaleForChatId(int $chatId): string
    {
        $user = TelegramUser::where('chat_id', $chatId)
            ->orderByRaw("CASE WHEN preferred_locale IS NULL OR preferred_locale = '' THEN 1 ELSE 0 END")
            ->latest('id')
            ->first();

        return TelegramBotTexts::resolveLocale($user);
    }

    public function resolveLocaleForOrderChat(Order $order, int $chatId): string
    {
        $byChat = TelegramUser::where('chat_id', $chatId)
            ->orderByRaw("CASE WHEN preferred_locale IS NULL OR preferred_locale = '' THEN 1 ELSE 0 END")
            ->latest('id')
            ->first();

        $preferred = strtolower(trim((string) ($byChat?->preferred_locale ?? '')));
        if (in_array($preferred, [TelegramBotTexts::LOCALE_KM, TelegramBotTexts::LOCALE_EN], true)) {
            return $preferred;
        }

        if ($order->user_id) {
            $byUser = TelegramUser::where('user_id', $order->user_id)
                ->whereNotNull('preferred_locale')
                ->where('preferred_locale', '!=', '')
                ->latest('id')
                ->first();
            $userPreferred = strtolower(trim((string) ($byUser?->preferred_locale ?? '')));
            if (in_array($userPreferred, [TelegramBotTexts::LOCALE_KM, TelegramBotTexts::LOCALE_EN], true)) {
                return $userPreferred;
            }
        }

        return TelegramBotTexts::resolveLocale($byChat);
    }

    public function setPreferredLocale(TelegramUser $telegramUser, string $locale): TelegramUser
    {
        $locale = in_array($locale, [TelegramBotTexts::LOCALE_KM, TelegramBotTexts::LOCALE_EN], true)
            ? $locale
            : TelegramBotTexts::LOCALE_EN;

        $telegramUser->update(['preferred_locale' => $locale]);

        return $telegramUser->fresh();
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function buildLanguageMenuKeyboard(): array
    {
        return [
            'inline_keyboard' => [
                [
                    ['text' => '🇰🇭 ខ្មែរ', 'callback_data' => 'lang_km'],
                    ['text' => '🇬🇧 English', 'callback_data' => 'lang_en'],
                ],
            ],
        ];
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    public function buildAdminGroupInviteKeyboard(string $locale): ?array
    {
        $url = trim((string) config('services.telegram.admin_group_invite_url'));
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        if (! filter_var($url, FILTER_VALIDATE_URL) || ! in_array($host, ['t.me', 'telegram.me'], true)) {
            return null;
        }

        return [
            'inline_keyboard' => [[
                [
                    'text' => TelegramBotTexts::get($locale, 'btn_open_admin_group'),
                    'url' => $url,
                ],
            ]],
        ];
    }

    public function sendLanguageMenu(int $chatId, ?TelegramUser $telegramUser = null): void
    {
        $locale = TelegramBotTexts::resolveLocale($telegramUser);
        $this->sendMessage(
            (string) $chatId,
            TelegramBotTexts::get($locale, 'language_prompt'),
            $this->buildLanguageMenuKeyboard()
        );
    }

    public function sendInvoiceToChat(int $chatId, Order $order, ?string $locale = null): bool
    {
        $locale ??= $this->resolveLocaleForChatId($chatId);

        try {
            $order->loadMissing('shipment');
            $message = $this->formatInvoiceTelegramMessage($order, $locale);
            // Keep action buttons after viewing invoice (admin = full status keyboard).
            $keyboard = $this->keyboardForChat($chatId, $order);

            return $this->sendMessage((string) $chatId, $message, $keyboard, 'HTML');
        } catch (\Throwable $e) {
            Log::error('Telegram invoice failed', [
                'order_id' => $order->id,
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);
            $this->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'invoice_failed'),
                $this->keyboardForChat($chatId, $order)
            );

            return false;
        }
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    public function keyboardForChat(int $chatId, Order $order): ?array
    {
        $order->loadMissing('shipment');

        if ($this->isAdminChatId($chatId) || $this->isLinkedAdminChat($chatId)) {
            return $this->buildAdminOrderKeyboard($order);
        }

        if ($order->payment_method === 'cod' && $this->chatMayGenerateCodShopQr($chatId, $order)) {
            return $this->buildDriverOrderKeyboard($order);
        }

        return $this->buildOrderActionKeyboard($order, $order->shipment, $this->resolveLocaleForChatId($chatId));
    }

    private function formatInvoiceTelegramMessage(Order $order, string $locale): string
    {
        $order->loadMissing(['user', 'items.product', 'shipment']);
        $invoice = $this->invoices->buildOrderInvoiceData($order, InvoiceService::AUDIENCE_CUSTOMER);
        $customer = $invoice['customer'] ?? [];
        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $lines = [
            '🧾 <b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'invoice_title'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</b>',
            '',
            htmlspecialchars(TelegramBotTexts::get($locale, 'invoice_number'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': <code>'.$e((string) ($invoice['invoice_number'] ?? '')).'</code>',
            htmlspecialchars(TelegramBotTexts::get($locale, 'invoice_date'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': '.$e((string) ($invoice['invoice_date'] ?? '')),
            htmlspecialchars(TelegramBotTexts::get($locale, 'invoice_status'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': <b>'.$e((string) ($invoice['payment_status'] ?? '')).'</b>',
            '',
            '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'customer'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</b>',
            $e((string) ($customer['name'] ?? TelegramBotTexts::get($locale, 'guest'))),
        ];

        $phone = trim((string) ($customer['phone'] ?? ''));
        if ($phone !== '' && $phone !== '-') {
            $lines[] = $e($phone);
        }

        $address = trim((string) ($customer['full_address'] ?? ''));
        if ($address !== '' && $address !== '-') {
            $lines[] = $e($address);
        }

        $lines[] = '';
        $lines[] = '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'items'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</b>';

        $items = $invoice['items'] ?? [];
        $maxItems = 12;
        $qtyLabel = TelegramBotTexts::get($locale, 'qty_label');
        foreach (array_slice($items, 0, $maxItems) as $item) {
            $name = $e((string) ($item['product_name'] ?? 'Item'));
            $sku = $e((string) ($item['sku'] ?? '-'));
            $qty = (int) ($item['quantity'] ?? 0);
            $total = number_format((float) ($item['grand_total'] ?? 0), 2);
            $lines[] = '• '.$name;
            $lines[] = '  <code>'.$sku.'</code> · '.$qtyLabel.' '.$qty.' — $'.$total;
        }

        $remaining = count($items) - $maxItems;
        if ($remaining > 0) {
            $lines[] = '<i>'.htmlspecialchars(
                TelegramBotTexts::get($locale, 'more_items', ['count' => $remaining, 'plural' => '']),
                ENT_QUOTES | ENT_SUBSTITUTE,
                'UTF-8'
            ).'</i>';
        }

        $lines[] = '';
        $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'subtotal'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': $'.number_format((float) ($invoice['subtotal'] ?? 0), 2);

        if ((float) ($invoice['discount'] ?? 0) > 0) {
            $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'discount'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': −$'.number_format((float) $invoice['discount'], 2);
        }

        $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'shipping'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': $'.number_format((float) ($invoice['shipping_fee'] ?? 0), 2);
        $lines[] = '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'grand_total'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': $'.number_format((float) ($invoice['grand_total'] ?? 0), 2).'</b>';

        $shipment = $order->shipment;
        $provider = $shipment?->provider;
        if ($provider && strtolower((string) $provider) !== 'internal') {
            $lines[] = '';
            $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'courier'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': '.$e((string) $provider);
        }

        if (! empty($invoice['tracking_code'])) {
            $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'tracking_label'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': <code>'.$e((string) $invoice['tracking_code']).'</code>';
        }

        if (! empty($invoice['is_cod']) && ($invoice['payment_status'] ?? '') !== 'PAID') {
            $lines[] = '';
            $lines[] = '<i>'.htmlspecialchars(TelegramBotTexts::get($locale, 'payment_cod'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</i>';
        }

        $message = implode("\n", $lines);
        if (strlen($message) > 4000) {
            $message = substr($message, 0, 3990)."\n…";
        }

        return $message;
    }

    public function canChatAccessOrder(int $chatId, Order $order, ?TelegramUser $telegramUser = null): bool
    {
        if ($this->isAdminChatId($chatId)) {
            return true;
        }

        if (TelegramOrderSubscription::where('order_id', $order->id)->where('chat_id', $chatId)->exists()) {
            return true;
        }

        if ($telegramUser?->user_id && (int) $telegramUser->user_id === (int) $order->user_id) {
            return true;
        }

        return false;
    }

    public function isAdminChatId(int $chatId): bool
    {
        $configured = trim((string) config('services.telegram.admin_chat_id', ''));
        if ($configured === '') {
            return false;
        }

        // Group/supergroup IDs are negative (e.g. -5438165888); compare as strings of ints.
        return (string) $chatId === (string) (int) $configured;
    }

    /** Linked admin / superadmin private chat (not only TELEGRAM_ADMIN_CHAT_ID). */
    public function isLinkedAdminChat(int $chatId): bool
    {
        if ($chatId === 0) {
            return false;
        }

        $tg = TelegramUser::query()->with('user')->where('chat_id', $chatId)->latest('id')->first();
        $user = $tg?->user;

        return $user && $user->isActive() && $user->isAdmin();
    }

    /**
     * Skip seeded demo Telegram chats (200001–200030) that are not real Telegram IDs.
     */
    private function isDeliverableTelegramChatId(int $chatId): bool
    {
        if ($chatId === 0) {
            return false;
        }

        return $chatId < 200000 || $chatId >= 210000;
    }

    public function isCustomerChatForOrder(int $chatId, Order $order): bool
    {
        if ($chatId <= 0 || $this->isAdminChatId($chatId) || $this->isStaffOrDriverChat($chatId)) {
            return false;
        }

        if ($this->resolveDriverChatIds($order)->contains($chatId)) {
            return false;
        }

        if ($order->user_id) {
            return TelegramUser::query()
                ->where('user_id', $order->user_id)
                ->where('chat_id', $chatId)
                ->exists();
        }

        return TelegramOrderSubscription::query()
            ->where('order_id', $order->id)
            ->where('chat_id', $chatId)
            ->exists();
    }

    public function chatMayGenerateCodShopQr(int $chatId, Order $order): bool
    {
        if ($chatId <= 0 || $this->isCustomerChatForOrder($chatId, $order)) {
            return false;
        }

        if ($this->isAdminChatId($chatId) || $this->isStaffOrDriverChat($chatId)) {
            return true;
        }

        $cached = (int) Cache::get('tg-cod-driver-chat:'.$order->id);

        return $cached === $chatId || $this->resolveDriverChatIds($order)->contains($chatId);
    }

    /**
     * Customer chat may receive KHQR for Bakong checkout, or COD ២ខ (customer pays shop).
     * Shop remittance QR (option 1 / ២ក) stays driver/admin only.
     */
    public function chatMayReceivePaymentQr(int $chatId, Order $order): bool
    {
        if ($chatId <= 0) {
            return false;
        }

        if (strtolower((string) $order->payment_method) === 'bakong_khqr') {
            return true;
        }

        if (strtolower((string) $order->payment_method) !== 'cod') {
            return false;
        }

        if ($this->chatMayGenerateCodShopQr($chatId, $order)) {
            return true;
        }

        if (! $this->isCustomerChatForOrder($chatId, $order)) {
            return false;
        }

        $order->loadMissing('payments');
        $payment = $order->payments->sortByDesc('id')->first();
        $plan = $this->codCollection->currentPlan($payment);

        return $plan === CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN;
    }

    private function isStaffOrDriverChat(int $chatId): bool
    {
        $tg = TelegramUser::query()->with('user')->where('chat_id', $chatId)->latest('id')->first();
        $role = strtolower((string) ($tg?->user?->role ?? ''));

        return in_array($role, ['driver', 'admin', 'superadmin', 'staff'], true);
    }

    /**
     * @return array{ok: bool, message: string, customer_notified: bool, already?: bool}
     */
    public function updateShipmentStatusFromAdminChat(
        Order $order,
        string $status,
        ?User $actor = null,
        ?string $actorNote = null
    ): array
    {
        $status = strtolower(trim($status));
        $allowed = ['pending', 'processing', 'shipped', 'in_transit', 'arrived', 'delivered', 'failed', 'returned'];
        if (! in_array($status, $allowed, true)) {
            return ['ok' => false, 'message' => 'Invalid status.', 'customer_notified' => false];
        }

        return DB::transaction(function () use ($order, $status, $actor, $actorNote) {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $lockedOrder) {
                return ['ok' => false, 'message' => 'Order not found.', 'customer_notified' => false];
            }

            $lockedOrder->loadMissing(['shipment', 'user']);
            $shipment = $lockedOrder->shipment;
            if (! $shipment) {
                return ['ok' => false, 'message' => 'Shipment not found for this order.', 'customer_notified' => false];
            }

            $shipment = Shipment::query()->whereKey($shipment->id)->lockForUpdate()->first();
            if (! $shipment) {
                return ['ok' => false, 'message' => 'Shipment not found for this order.', 'customer_notified' => false];
            }

            $lockedOrder->setRelation('shipment', $shipment);
            $current = strtolower(trim((string) $shipment->status));
            if ($lockedOrder->isSuccessfullyClosed()) {
                return [
                    'ok' => false,
                    'closed' => true,
                    'already' => $current === $status,
                    'message' => TelegramBotTexts::get('km', 'order_closed'),
                    'customer_notified' => false,
                ];
            }

            if ($current === $status) {
                return [
                    'ok' => false,
                    'already' => true,
                    'message' => TelegramBotTexts::get('km', 'status_already_set'),
                    'customer_notified' => false,
                ];
            }

            $shippedAt = $shipment->shipped_at;
            $deliveredAt = $shipment->delivered_at;
            if (in_array($status, ['shipped', 'in_transit', 'arrived', 'delivered'], true) && ! $shippedAt) {
                $shippedAt = now();
            }
            if ($status === 'delivered' && ! $deliveredAt) {
                $deliveredAt = now();
            }

            $shipmentUpdate = [
                'status' => $status,
                'shipped_at' => $shippedAt,
                'delivered_at' => $deliveredAt,
            ];

            if ($actor?->isDriver() && in_array($status, ['delivered', 'in_transit', 'shipped'], true)) {
                $shipmentUpdate['delivered_by_user_id'] = $actor->id;
                if (! filled($shipment->delivered_by_name)) {
                    $shipmentUpdate['delivered_by_name'] = $actor->name;
                }
            }

            $shipment->update($shipmentUpdate);

            $actorLabel = $actorNote
                ?: ($actor
                    ? trim(($actor->name ?: 'user').' #'.$actor->id.' ('.$actor->role.')')
                    : 'unknown');

            ShipmentTrackingEvent::create([
                'shipment_id' => $shipment->id,
                'status' => $status,
                'note' => 'Status updated from Telegram bot by '.$actorLabel.'.',
                'updated_by' => $actor?->id,
                'event_time' => now(),
            ]);

            // Sync order status into system (web/app) immediately.
            $orderStatus = match ($status) {
                'processing' => 'processing',
                'shipped' => 'shipped',
                'in_transit' => 'in_transit',
                'arrived' => 'arrived',
                'failed' => 'failed',
                'returned' => 'returned',
                'delivered' => null, // ShipmentObserver sets completed
                default => null,
            };

            if ($orderStatus !== null && (string) $lockedOrder->status !== $orderStatus) {
                $lockedOrder->update(['status' => $orderStatus]);
            }

            $customerNotified = $this->resolveCustomerChatIds($lockedOrder->fresh(['user']) ?? $lockedOrder)->isNotEmpty();

            $statusKm = match ($status) {
                'processing' => 'កំពុងរៀបចំ',
                'shipped' => 'ដឹកចេញ',
                'in_transit' => 'កំពុងដឹក',
                'arrived' => 'មកដល់ទីតាំង',
                'delivered' => 'បានទទួលអីវ៉ាន់',
                'failed' => 'បរាជ័យ',
                'returned' => 'ត្រឡប់',
                default => $status,
            };

            return [
                'ok' => true,
                'message' => "✅ {$statusKm} / ".str_replace('_', ' ', $status)
                    ."\nOrder: ".($lockedOrder->order_number ?: '#'.$lockedOrder->id)
                    ."\nBy: {$actorLabel}"
                    ."\n".($customerNotified
                        ? '📣 Customer Telegram: notified'
                        : '⚠️ Customer Telegram: not linked — alert skipped'),
                'customer_notified' => $customerNotified,
            ];
        });
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function buildDriverOrderKeyboard(Order $order): array
    {
        if ($order->isSuccessfullyClosed()) {
            return $this->buildClosedOrderKeyboard($order);
        }

        $rows = [];
        if ($order->payment_status !== 'paid' && $order->payment_method === 'cod') {
            $rows[] = [[
                'text' => TelegramBotTexts::get('km', 'btn_i_paid'),
                'callback_data' => 'paidok_'.$order->id,
            ]];
            $rows[] = [
                ['text' => TelegramBotTexts::get('km', 'btn_driver_pay_now'), 'callback_data' => 'dpay_'.$order->id.'_now'],
                ['text' => TelegramBotTexts::get('km', 'btn_driver_wait'), 'callback_data' => 'dpay_'.$order->id.'_wait'],
            ];
            $rows[] = [[
                'text' => TelegramBotTexts::get('km', 'btn_driver_shop_prepaid'),
                'callback_data' => 'dpay_'.$order->id.'_wshop',
            ]];
            $plan = $this->codCollection->currentPlan(
                $order->payments()->where('status', 'pending')->latest('id')->first()
            );
            if ($plan === CodCollectionService::COLLECT_AT_DELIVERY_PLAN) {
                $amounts = $this->codCollection->amountBreakdown($order, $plan);
                $rows[] = [[
                    'text' => TelegramBotTexts::get('km', 'btn_generate_shop_khqr_amount', [
                        'remit' => number_format($amounts['shop_qr_usd'], 2),
                    ]),
                    'callback_data' => 'dpay_'.$order->id.'_cq',
                ]];
            }
            if ($plan === CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN) {
                $amounts = $this->codCollection->amountBreakdown($order, $plan);
                $rows[] = [[
                    'text' => TelegramBotTexts::get('km', 'btn_generate_customer_shop_qr', [
                        'total' => number_format($amounts['customer_usd'], 2),
                    ]),
                    'callback_data' => 'dpay_'.$order->id.'_csqr',
                ]];
            }
        } elseif ($order->payment_status !== 'paid') {
            $rows[] = [[
                'text' => '💳 KHQR',
                'callback_data' => 'payqr_'.$order->id,
            ]];
        }

        $order->loadMissing('shipment');
        $current = strtolower((string) ($order->shipment?->status ?? $order->status ?? ''));
        $finished = in_array((string) $order->status, ['completed', 'delivered'], true)
            || in_array($current, ['delivered'], true);

        if (! $finished) {
            $rows[] = [
                $this->telegramStatusButton('📦 ដឹកចេញ', $order->id, 'shipped', $current, 'drivest_'),
                $this->telegramStatusButton('🚚 កំពុងដឹក', $order->id, 'in_transit', $current, 'drivest_'),
            ];
            $rows[] = [
                $this->telegramStatusButton('📍 មកដល់', $order->id, 'arrived', $current, 'drivest_'),
                $this->telegramStatusButton('📦 បានទទួលអីវ៉ាន់', $order->id, 'complete', $current, 'drivest_'),
            ];
        }

        return ['inline_keyboard' => $rows];
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function buildDriverCodAdvanceKeyboard(Order $order): array
    {
        $id = $order->id;

        return ['inline_keyboard' => [
            [
                ['text' => TelegramBotTexts::get('km', 'btn_generate_shop_khqr'), 'callback_data' => 'dpay_'.$id.'_qr'],
            ],
            [
                ['text' => TelegramBotTexts::get('km', 'btn_driver_cash'), 'callback_data' => 'dpay_'.$id.'_cash'],
            ],
        ]];
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function buildDriverCodCustomerQrKeyboard(Order $order): array
    {
        $id = $order->id;

        return ['inline_keyboard' => [
            [
                ['text' => TelegramBotTexts::get('km', 'btn_generate_shop_khqr'), 'callback_data' => 'dpay_'.$id.'_cq'],
            ],
        ]];
    }

    /**
     * @return array{ok: bool, message: string, order: Order, keyboard: array<string, mixed>|null}
     */
    public function applyDriverCodAction(
        Order $order,
        string $action,
        ?int $verifiedBy,
        string $courierLabel,
        string $locale,
    ): array {
        $label = $order->order_number ?: '#'.$order->id;
        $amounts = $this->codCollection->amountBreakdown($order);
        $total = number_format($amounts['customer_usd'], 2);
        $remit = number_format($amounts['shop_qr_usd'], 2);
        $shipping = number_format($amounts['shipping_usd'], 2);
        $goods = number_format($amounts['goods_usd'], 2);

        if ($action === 'now') {
            $this->codCollection->setPlan($order, CodCollectionService::DRIVER_ADVANCE_PLAN);
            $fresh = $order->fresh(['shipment', 'payments']);

            return [
                'ok' => true,
                'message' => TelegramBotTexts::get($locale, 'driver_cod_pay_how', [
                    'label' => $label,
                    'total' => $total,
                ]),
                'order' => $fresh,
                'keyboard' => $this->buildDriverCodAdvanceKeyboard($fresh),
            ];
        }

        if ($action === 'qr' || $action === 'cq' || $action === 'csqr') {
            $this->codCollection->setPlan(
                $order,
                $action === 'cq'
                    ? CodCollectionService::COLLECT_AT_DELIVERY_PLAN
                    : ($action === 'csqr'
                        ? CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN
                        : CodCollectionService::DRIVER_ADVANCE_PLAN)
            );
            $fresh = $order->fresh(['shipment', 'payments']);
            $amounts = $this->codCollection->amountBreakdown($fresh);
            $key = match ($action) {
                'cq' => 'driver_cod_send_customer_qr',
                'csqr' => 'driver_cod_send_customer_shop_qr',
                default => 'driver_cod_send_qr',
            };

            return [
                'ok' => true,
                'message' => TelegramBotTexts::get($locale, $key, [
                    'label' => $label,
                    'total' => number_format($amounts['customer_usd'], 2),
                    'remit' => number_format($amounts['shop_qr_usd'], 2),
                    'shipping' => number_format($amounts['shipping_usd'], 2),
                    'goods' => number_format($amounts['goods_usd'], 2),
                ]),
                'order' => $fresh,
                'keyboard' => $this->buildDriverOrderKeyboard($fresh),
                'send_shop_qr' => true,
                'await_qr' => null,
            ];
        }

        if ($action === 'wait') {
            $this->codCollection->setPlan($order, CodCollectionService::COLLECT_AT_DELIVERY_PLAN);
            $fresh = $order->fresh(['shipment', 'payments']);
            $amounts = $this->codCollection->amountBreakdown($fresh);

            return [
                'ok' => true,
                'message' => TelegramBotTexts::get($locale, 'driver_cod_wait_saved', [
                    'total' => number_format($amounts['customer_usd'], 2),
                    'remit' => number_format($amounts['shop_qr_usd'], 2),
                    'shipping' => number_format($amounts['shipping_usd'], 2),
                    'goods' => number_format($amounts['goods_usd'], 2),
                ]),
                'order' => $fresh,
                'keyboard' => $this->buildDriverOrderKeyboard($fresh),
            ];
        }

        if ($action === 'wshop') {
            $this->codCollection->setPlan($order, CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN);
            $fresh = $order->fresh(['shipment', 'payments']);
            $amounts = $this->codCollection->amountBreakdown($fresh);

            return [
                'ok' => true,
                'message' => TelegramBotTexts::get($locale, 'driver_cod_shop_prepaid_saved', [
                    'total' => number_format($amounts['customer_usd'], 2),
                ]),
                'order' => $fresh,
                'keyboard' => $this->buildDriverOrderKeyboard($fresh),
            ];
        }

        $map = [
            'aba' => [CodCollectionService::DRIVER_QR, 'aba'],
            'ac' => [CodCollectionService::DRIVER_QR, 'acleda'],
            'wing' => [CodCollectionService::DRIVER_QR, 'wing'],
            'oth' => [CodCollectionService::DRIVER_QR, 'other'],
            'cash' => [CodCollectionService::DRIVER_CASH, null],
            'caba' => [CodCollectionService::CUSTOMER_DRIVER_QR, 'aba'],
            'cac' => [CodCollectionService::CUSTOMER_DRIVER_QR, 'acleda'],
            'cwing' => [CodCollectionService::CUSTOMER_DRIVER_QR, 'wing'],
            'coth' => [CodCollectionService::CUSTOMER_DRIVER_QR, 'other'],
        ];

        if (! isset($map[$action])) {
            return [
                'ok' => false,
                'message' => 'Invalid COD action.',
                'order' => $order,
                'keyboard' => $this->buildDriverOrderKeyboard($order),
            ];
        }

        [$method, $qrBank] = $map[$action];
        $payment = $this->codCollection->collectCash(
            $order,
            $method,
            $verifiedBy,
            null,
            [
                'qr_bank' => $qrBank,
                'courier_name' => $courierLabel,
                'currency' => 'USD',
            ],
        );
        $fresh = $order->fresh(['shipment', 'payments', 'user', 'items']);
        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        $settlement = (string) ($raw['settlement_label_km'] ?? $method);

        return [
            'ok' => true,
            'message' => TelegramBotTexts::get($locale, 'driver_cod_recorded', [
                'label' => $settlement,
            ]),
            'order' => $fresh,
            'keyboard' => $this->buildDriverOrderKeyboard($fresh),
        ];
    }

    public function sendDriverJobCard(int $chatId, Order $order, ?string $locale = null): void
    {
        $locale ??= $this->resolveLocaleForChatId($chatId);
        $order->loadMissing('shipment');
        $label = $order->order_number ?: '#'.$order->id;
        $payment = $this->formatPaymentMethodLabel($order);
        if ($order->payment_status === 'paid') {
            $payment .= ' · paid';
        } elseif ($order->payment_method === 'cod') {
            $payment .= ' · unpaid';
        }
        $status = ucfirst(str_replace('_', ' ', (string) ($order->shipment?->status ?: $order->status ?: 'pending')));

        $message = TelegramBotTexts::get($locale, 'driver_job_title', [
            'label' => $label,
            'total' => number_format((float) $order->total, 2),
            'payment' => $payment,
            'status' => $status,
        ]);

        $this->rememberDriverJobChat($order, $chatId);
        $this->sendMessage((string) $chatId, $message, $this->buildDriverOrderKeyboard($order));
    }

    public function sendPaymentQrToChat(int $chatId, Order $order, ?string $locale = null): bool
    {
        $locale ??= $this->resolveLocaleForChatId($chatId);
        if ($order->isSuccessfullyClosed()) {
            $this->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'order_closed'),
                $this->keyboardForChat($chatId, $order),
                null
            );

            return false;
        }

        if ($this->chatMayGenerateCodShopQr($chatId, $order)) {
            $this->rememberDriverJobChat($order, $chatId);
        }

        if (! $this->chatMayReceivePaymentQr($chatId, $order)) {
            $this->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'payment_qr_customer_denied'),
                $this->keyboardForChat($chatId, $order)
            );

            return false;
        }

        if ($order->payment_status === 'paid') {
            $this->notifyOrderPaid($order);

            return true;
        }

        if (RielpayApi::isCircuitOpen()) {
            $this->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get($locale, 'payment_qr_gateway_down'),
                $this->shopKhqrRetryKeyboard($order, $chatId)
            );

            return false;
        }

        try {
            $this->rielpayPayments->refreshOrderKhqr($order);
            $order->refresh();
        } catch (\Throwable) {
            // Fall through and show QR; gateway check also runs in the background.
        }

        if ($order->payment_status === 'paid') {
            $this->notifyOrderPaid($order);

            return true;
        }

        try {
            $payment = $this->resolvePaymentQrForOrder($order);
            $qrString = (string) ($payment['qr_string'] ?? '');
            if ($qrString === '') {
                $this->sendMessage(
                    (string) $chatId,
                    TelegramBotTexts::get($locale, 'payment_qr_failed'),
                    $this->shopKhqrRetryKeyboard($order, $chatId)
                );

                return false;
            }

            $amount = $payment['amount'] ?? null;
            $currency = (string) ($payment['currency'] ?? 'KHR');
            $amountLabel = $currency === 'KHR'
                ? number_format((float) ($amount ?? $this->codCollection->khrAmountForShopKhqr($order))).' ៛'
                : '$'.number_format((float) ($amount ?? $order->total), 2);

            $label = $order->order_number ?: '#'.$order->id;
            $codPlan = $this->codCollection->currentPlan(
                $order->payments()->where('status', 'pending')->latest('id')->first()
            );
            $codNote = $order->payment_method === 'cod'
                ? TelegramBotTexts::get(
                    $locale,
                    $codPlan === CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN
                        ? 'payment_qr_cod_customer_note'
                        : 'payment_qr_cod_note'
                )
                : TelegramBotTexts::get($locale, 'payment_qr_scan_note');

            $expiresNote = '';
            $expiresAt = $payment['expires_at'] ?? null;
            if ($expiresAt) {
                try {
                    $until = \Illuminate\Support\Carbon::parse($expiresAt);
                    $minutes = max(1, (int) ceil(now()->diffInSeconds($until, false) / 60));
                    if ($until->isFuture()) {
                        $expiresNote = TelegramBotTexts::get($locale, 'payment_qr_expires', [
                            'minutes' => $minutes,
                            'time' => $until->timezone(config('app.timezone', 'UTC'))->format('H:i'),
                        ]);
                    }
                } catch (\Throwable) {
                    $expiresNote = '';
                }
            }

            $caption = TelegramBotTexts::get($locale, 'payment_qr_title')."\n\n"
                .TelegramBotTexts::get($locale, 'order_label').": `{$label}`\n"
                .TelegramBotTexts::get($locale, 'amount_label').": *{$amountLabel}*"
                .$codNote
                .$expiresNote;

            $sent = $this->sendPhoto(
                (string) $chatId,
                $this->buildQrPngBytes($qrString),
                $caption,
                $this->keyboardForChat($chatId, $order)
            );

            if ($sent) {
                $paymentId = (int) ($payment['id'] ?? 0);
                if ($paymentId > 0) {
                    WatchKhqrPayment::dispatch($paymentId);
                    $this->rielpayPayments->scheduleAutoConfirm($paymentId, $order->id);
                    dispatch(function () {
                        app(RielpayPaymentService::class)->pollPendingKhqr();
                    })->afterResponse();
                }
            }

            if ($sent && ($this->isAdminChatId($chatId) || $this->isLinkedAdminChat($chatId))) {
                $this->sendMessage(
                    (string) $chatId,
                    "⬆️ KHQR ខាងលើ · បន្តចុចប៊ូតុងខាងក្រោមបាន\n⬆️ QR above · use buttons below to continue",
                    $this->buildAdminOrderKeyboard($order),
                    null
                );
            }

            return $sent;
        } catch (\Throwable $e) {
            Log::error('Telegram payment QR failed', [
                'order_id' => $order->id,
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);

            $message = TelegramBotTexts::get($locale, 'payment_qr_failed_gen');
            $reason = strtolower(trim($e->getMessage()));
            if (
                str_contains($reason, 'unreachable')
                || str_contains($reason, 'temporarily unavailable')
                || str_contains($reason, 'http 530')
                || str_contains($reason, 'http 502')
            ) {
                $message = TelegramBotTexts::get($locale, 'payment_qr_gateway_down');
            }
            if ($this->isAdminChatId($chatId)) {
                $detail = trim($e->getMessage());
                if ($detail !== '') {
                    $message .= "\n\n🛠 ".$detail;
                }
            }

            $this->sendMessage(
                (string) $chatId,
                $message,
                $this->shopKhqrRetryKeyboard($order, $chatId)
            );

            return false;
        }
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    private function shopKhqrRetryKeyboard(Order $order, int $chatId): ?array
    {
        $base = $this->keyboardForChat($chatId, $order) ?? ['inline_keyboard' => []];
        if (! isset($base['inline_keyboard']) || ! is_array($base['inline_keyboard'])) {
            $base['inline_keyboard'] = [];
        }
        $retry = [[
            'text' => TelegramBotTexts::get($this->resolveLocaleForChatId($chatId), 'btn_retry_shop_khqr'),
            'callback_data' => 'payqr_'.$order->id,
        ]];
        array_unshift($base['inline_keyboard'], $retry);

        return $base;
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function shopKhqrConfirmKeyboard(Order $order, int $chatId): array
    {
        $locale = $this->resolveLocaleForChatId($chatId);
        $base = $this->keyboardForChat($chatId, $order) ?? ['inline_keyboard' => []];
        if (! isset($base['inline_keyboard']) || ! is_array($base['inline_keyboard'])) {
            $base['inline_keyboard'] = [];
        }

        array_unshift($base['inline_keyboard'], [[
            'text' => TelegramBotTexts::get($locale, 'btn_confirm_shop_received'),
            'callback_data' => 'shopok_'.$order->id,
        ]]);

        return $base;
    }

    /**
     * @return array<string, mixed>
     */
    private function resolvePaymentQrForOrder(Order $order): array
    {
        $invoiceQr = Payment::query()
            ->where('order_id', $order->id)
            ->khqrProvider()
            ->where('method', Payment::METHOD_INVOICE_KHQR)
            ->where('status', 'pending')
            ->whereNotNull('qr_string')
            ->latest('id')
            ->first();

        if ($invoiceQr) {
            WatchKhqrPayment::dispatch((int) $invoiceQr->id);
            $this->rielpayPayments->scheduleAutoConfirm($invoiceQr, $order);

            return [
                'id' => $invoiceQr->id,
                'qr_string' => $invoiceQr->qr_string,
                'amount' => $invoiceQr->amount,
                'currency' => $invoiceQr->currency ?: 'KHR',
                'expires_at' => null,
                'status' => $invoiceQr->status,
            ];
        }

        if ($order->payment_method === 'cod') {
            $result = $this->codCollection->createCodKhqr($order);

            return $result['payment'];
        }

        if ($order->payment_method !== 'bakong_khqr') {
            throw new \RuntimeException('Online payment is not available for this order.');
        }

        $existing = Payment::where('order_id', $order->id)
            ->khqrProvider()
            ->where('status', 'pending')
            ->where(function ($query) {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('id')
            ->first();

        if ($existing && $existing->qr_string) {
            $expectedKhr = $this->rielpayPayments->khrAmountForOrder($order);
            $payload = is_array($existing->khqr_payload) ? $existing->khqr_payload : [];
            $raw = is_array($existing->raw_response) ? $existing->raw_response : [];
            $encoded = (int) round((float) ($payload['amount'] ?? $raw['amount'] ?? 0));
            if ($encoded === $expectedKhr) {
                WatchKhqrPayment::dispatch((int) $existing->id);
                $this->rielpayPayments->scheduleAutoConfirm($existing, $order);

                return [
                    'id' => $existing->id,
                    'qr_string' => $existing->qr_string,
                    'amount' => $expectedKhr,
                    'currency' => 'KHR',
                    'status' => $existing->status,
                    'expires_at' => optional($existing->expires_at)->toIso8601String(),
                ];
            }
            $existing->update(['status' => 'expired']);
        }

        return DB::transaction(function () use ($order) {
            Payment::where('order_id', $order->id)
                ->khqrProvider()
                ->where('status', 'pending')
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now())
                ->update(['status' => 'expired']);

            $payment = Payment::create([
                'order_id' => $order->id,
                'provider' => 'rielpay',
                'amount' => $order->total,
                'currency' => config('services.rielpay.currency', 'KHR'),
                'method' => 'bakong_khqr',
                'status' => 'pending',
            ]);

            $result = $this->rielpayPayments->generate($order, $payment);
            $khrAmount = $result['khr_amount'] ?? $this->rielpayPayments->khrAmountForOrder($order);
            $payment->update([
                'provider' => 'rielpay',
                'bill_number' => $result['bill_number'],
                'md5' => $result['md5'],
                'khqr_payload' => $result['payload'],
                'qr_string' => $result['qr_string'],
                'expires_at' => $result['expires_at'],
                'raw_response' => $result['payload'],
                'amount' => $khrAmount,
                'currency' => 'KHR',
            ]);

            $fresh = $payment->fresh();
            WatchKhqrPayment::dispatch((int) $fresh->id);
            $this->rielpayPayments->scheduleAutoConfirm($fresh, $order);

            return [
                'id' => $fresh->id,
                'qr_string' => $fresh->qr_string,
                'amount' => $khrAmount,
                'currency' => 'KHR',
                'status' => $fresh->status,
                'expires_at' => optional($fresh->expires_at)->toIso8601String(),
            ];
        });
    }

    private function buildQrPngBytes(string $qrString): string
    {
        $writer = new PngWriter();
        $qrCode = QrCode::create($qrString)
            ->setEncoding(new Encoding('UTF-8'))
            ->setSize(480)
            ->setMargin(12)
            ->setForegroundColor(new Color(0, 0, 0))
            ->setBackgroundColor(new Color(255, 255, 255));

        return $writer->write($qrCode)->getString();
    }

    public function notifyOrderShipped(Shipment $shipment): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $shipment->loadMissing('order.user');
        $order = $shipment->order;
        if (! $order) {
            return;
        }

        $label = $order->order_number ?: '#'.$order->id;
        $provider = $shipment->provider ?: TelegramBotTexts::get(TelegramBotTexts::LOCALE_EN, 'courier_fallback');
        $trackingCode = $shipment->tracking_code ?: '—';

        $this->notifyOrderRecipients($order, function (string $locale) use ($order, $shipment, $label, $trackingCode) {
            $provider = $shipment->provider && strtolower((string) $shipment->provider) !== 'internal'
                ? (string) $shipment->provider
                : TelegramBotTexts::get($locale, 'courier_fallback');
            $message = TelegramBotTexts::get($locale, 'order_shipped', $this->htmlReplace([
                'label' => $label,
                'provider' => $provider,
                'tracking' => $trackingCode,
            ]));

            return [$message, $this->buildOrderActionKeyboard($order, $shipment, $locale)];
        });
        $this->createInAppNotification(
            $order,
            'order_shipped',
            'Order shipped',
            "Your order was handed to {$provider}. Tracking: {$trackingCode}"
        );
    }

    public function notifyOrderDelivered(Shipment $shipment): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $shipment->loadMissing('order.user');
        $order = $shipment->order;
        if (! $order) {
            return;
        }

        $this->notifyOrderDeliveredForOrder($order);
    }

    public function notifyOrderDeliveredForOrder(Order $order): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $order->loadMissing(['user', 'payments']);
        $codShopPaid = $order->payment_method === 'cod'
            && $order->payment_status === 'paid'
            && ! $this->codCollection->isPendingCustomerToDriverRemittance($order);

        if ($codShopPaid) {
            return;
        }

        $label = $order->order_number ?: '#'.$order->id;
        $codPending = $order->payment_method === 'cod' && $order->payment_status !== 'paid';

        $this->createInAppNotification(
            $order,
            'order_delivered',
            'Order delivered',
            'Your order has been delivered. Thank you for shopping with us!'
        );

        $this->notifyOrderRecipients($order, function (string $locale) use ($order, $label, $codPending) {
            $message = TelegramBotTexts::get($locale, 'order_delivered', $this->htmlReplace([
                'label' => $label,
                'cod_note' => $codPending
                    ? TelegramBotTexts::get($locale, 'order_delivered_cod_note')
                    : '',
            ]));

            return [$message, $this->buildOrderActionKeyboard($order, null, $locale)];
        });

        $this->notifyAdminOrderDelivered($order);
    }

    public function notifyAdminOrderDelivered(Order $order): void
    {
        $this->notifyStaffOrderEvent($order, 'completed');
    }

    public function notifyAdminOfNewOrder(Order $order): void
    {
        $this->notifyStaffOrderEvent($order, 'paid');
    }

    public function upsertTelegramUser(array $from, int $chatId): TelegramUser
    {
        return TelegramUser::updateOrCreate(
            ['telegram_user_id' => (int) $from['id']],
            [
                'chat_id' => $chatId,
                'username' => $from['username'] ?? null,
                'first_name' => $from['first_name'] ?? null,
                'last_name' => $from['last_name'] ?? null,
                'language_code' => $from['language_code'] ?? null,
                'last_interacted_at' => now(),
            ]
        );
    }

    public function linkTelegramToUser(TelegramUser $telegramUser, int $userId): void
    {
        $telegramUser->update(['user_id' => $userId]);
    }

    /**
     * Copy Telegram name and profile photo onto the shop user.
     */
    public function syncTelegramProfileToUser(TelegramUser $telegramUser, User $user): User
    {
        $updates = [];
        $name = trim(implode(' ', array_filter([
            trim((string) $telegramUser->first_name),
            trim((string) $telegramUser->last_name),
        ])));
        if ($name === '' && filled($telegramUser->username)) {
            $name = (string) $telegramUser->username;
        }
        if ($name !== '' && trim((string) $user->name) !== $name) {
            $updates['name'] = mb_substr($name, 0, 120);
        }

        $telegramPhotoMarker = 'telegram_'.$telegramUser->telegram_user_id;
        $hasTelegramPhoto = filled($user->profile_image_path)
            && str_contains((string) $user->profile_image_path, $telegramPhotoMarker);
        $photoIsFresh = $hasTelegramPhoto
            && $user->profile_image_updated_at
            && $user->profile_image_updated_at->gt(now()->subHours(6));
        $shouldImportPhoto = ! filled($user->profile_image_path) || ($hasTelegramPhoto && ! $photoIsFresh);

        if ($shouldImportPhoto) {
            $photoPath = $this->importProfilePhoto((int) $telegramUser->telegram_user_id);
            if ($photoPath) {
                $updates['profile_image_path'] = $photoPath;
                $updates['profile_image_updated_at'] = now();
            }
        }

        if ($updates !== []) {
            $user->update($updates);
        }

        return $user->fresh() ?? $user;
    }

    /**
     * Apply official Login Widget data (name, username, photo_url) onto the shop user.
     *
     * @param  array<string, mixed>  $widget
     */
    public function applyLoginWidgetProfile(User $user, array $widget, ?TelegramUser $telegramUser = null): User
    {
        $telegramId = (int) ($widget['id'] ?? $telegramUser?->telegram_user_id ?? 0);
        $name = trim(implode(' ', array_filter([
            trim((string) ($widget['first_name'] ?? '')),
            trim((string) ($widget['last_name'] ?? '')),
        ])));
        if ($name === '' && filled($widget['username'] ?? null)) {
            $name = (string) $widget['username'];
        }

        $updates = [];
        if ($name !== '') {
            $updates['name'] = mb_substr($name, 0, 120);
        }

        $photoUrl = trim((string) ($widget['photo_url'] ?? ''));
        $marker = $telegramId > 0 ? 'telegram_'.$telegramId : '';
        $canReplacePhoto = ! filled($user->profile_image_path)
            || ($marker !== '' && str_contains((string) $user->profile_image_path, $marker));

        if ($canReplacePhoto && $photoUrl !== '' && preg_match('#^https://#i', $photoUrl)) {
            $stored = $this->importPhotoFromUrl($telegramId, $photoUrl);
            if ($stored) {
                $updates['profile_image_path'] = $stored;
                $updates['profile_image_updated_at'] = now();
            } elseif (! filled($user->profile_image_path)) {
                $updates['profile_image_path'] = $photoUrl;
                $updates['profile_image_updated_at'] = now();
            }
        }

        if ($updates !== []) {
            $user->update($updates);
            $user = $user->fresh() ?? $user;
        }

        if ($telegramUser && ! filled($user->profile_image_path)) {
            $user = $this->syncTelegramProfileToUser($telegramUser, $user);
        }

        return $user->fresh() ?? $user;
    }

    public function importPhotoFromUrl(int $telegramUserId, string $url): ?string
    {
        if ($telegramUserId <= 0 || ! preg_match('#^https://#i', $url)) {
            return null;
        }

        try {
            $response = Http::timeout(20)->get($url);
            if (! $response->successful()) {
                return null;
            }

            $bytes = $response->body();
            if (! is_string($bytes) || strlen($bytes) < 200) {
                return null;
            }

            $path = (string) (parse_url($url, PHP_URL_PATH) ?: '');
            $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION)) ?: 'jpg';
            if (! in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
                $ext = 'jpg';
            }

            return Media::put('profile_images/telegram_'.$telegramUserId.'.'.$ext, $bytes);
        } catch (\Throwable $e) {
            Log::warning('Telegram widget photo import failed', [
                'telegram_user_id' => $telegramUserId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    public function importProfilePhoto(int $telegramUserId): ?string
    {
        if (! $this->isEnabled() || $telegramUserId <= 0) {
            return null;
        }

        $token = trim((string) config('services.telegram.bot_token'));

        try {
            $photos = Http::timeout(15)->get(
                'https://api.telegram.org/bot'.$token.'/getUserProfilePhotos',
                ['user_id' => $telegramUserId, 'limit' => 1]
            )->json();

            if (($photos['ok'] ?? false) !== true) {
                return null;
            }

            $sizes = $photos['result']['photos'][0] ?? [];
            if (! is_array($sizes) || $sizes === []) {
                return null;
            }

            $best = $sizes[array_key_last($sizes)] ?? null;
            $fileId = is_array($best) ? ($best['file_id'] ?? null) : null;
            if (! is_string($fileId) || $fileId === '') {
                return null;
            }

            $file = Http::timeout(15)->get(
                'https://api.telegram.org/bot'.$token.'/getFile',
                ['file_id' => $fileId]
            )->json();

            $filePath = (string) ($file['result']['file_path'] ?? '');
            if ($filePath === '') {
                return null;
            }

            $bytes = Http::timeout(20)->get(
                'https://api.telegram.org/file/bot'.$token.'/'.$filePath
            )->body();

            if (! is_string($bytes) || strlen($bytes) < 200) {
                return null;
            }

            $ext = strtolower((string) pathinfo($filePath, PATHINFO_EXTENSION)) ?: 'jpg';
            if (! in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
                $ext = 'jpg';
            }

            return Media::put('profile_images/telegram_'.$telegramUserId.'.'.$ext, $bytes);
        } catch (\Throwable $e) {
            Log::warning('Telegram profile photo import failed', [
                'telegram_user_id' => $telegramUserId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    public function subscribeChatToOrder(TelegramUser $telegramUser, Order $order): void
    {
        TelegramOrderSubscription::firstOrCreate(
            [
                'order_id' => $order->id,
                'chat_id' => $telegramUser->chat_id,
            ],
            ['telegram_user_id' => $telegramUser->id]
        );
    }

    /** Attach the customer's linked Telegram DM so status alerts can reach them. */
    public function subscribeLinkedCustomerChats(Order $order): void
    {
        if (! $order->user_id) {
            return;
        }

        $rows = TelegramUser::query()
            ->where('user_id', $order->user_id)
            ->whereNotNull('chat_id')
            ->get();

        foreach ($rows as $telegramUser) {
            $chatId = (int) $telegramUser->chat_id;
            if ($chatId === 0 || $this->isAdminChatId($chatId) || $this->isStaffOrDriverChat($chatId)) {
                continue;
            }

            TelegramOrderSubscription::firstOrCreate(
                [
                    'order_id' => $order->id,
                    'chat_id' => $chatId,
                ],
                ['telegram_user_id' => $telegramUser->id]
            );
        }
    }

    public function isUserConnected(int $userId): bool
    {
        return TelegramUser::where('user_id', $userId)->exists();
    }

    public function sendOrderStatusReply(int $chatId, Order $order, ?string $locale = null): void
    {
        $locale ??= $this->resolveLocaleForChatId($chatId);
        $order->loadMissing(['user', 'items.product', 'shipment']);
        $label = $order->order_number ?: '#'.$order->id;
        $status = ucfirst(str_replace('_', ' ', (string) $order->status));
        $shipment = $order->shipment;
        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $lines = [
            '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'order_status_title'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</b>',
            '',
            htmlspecialchars(TelegramBotTexts::get($locale, 'order_label'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': <code>'.$e($label).'</code>',
            htmlspecialchars(TelegramBotTexts::get($locale, 'status_label'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').': '.$e($status),
        ];

        if ($shipment) {
            $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'shipment_label'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                .': '.$e(ucfirst(str_replace('_', ' ', (string) $shipment->status)));
            if ($shipment->tracking_code) {
                $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'tracking_label'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
                    .': <code>'.$e((string) $shipment->tracking_code).'</code>';
            }
        }

        $paymentLabel = $this->formatPaymentMethodLabel($order);
        $lines[] = htmlspecialchars(TelegramBotTexts::get($locale, 'invoice_status'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            .': <b>'.$e($order->payment_status === 'paid' ? 'Paid' : 'Pending').'</b>'
            .' · '.$e($paymentLabel);

        $lines[] = '';
        $lines[] = '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'items'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8').'</b>';
        $qtyLabel = TelegramBotTexts::get($locale, 'qty_label');
        $maxItems = 5;
        foreach ($order->items->take($maxItems) as $item) {
            $name = $e((string) ($item->name ?: $item->product?->name ?: 'Item'));
            $qty = (int) ($item->qty ?? 0);
            $lines[] = '• '.$name.' — '.$qtyLabel.' '.$qty;
        }
        $remaining = $order->items->count() - $maxItems;
        if ($remaining > 0) {
            $lines[] = '<i>'.$e(TelegramBotTexts::get($locale, 'more_items', ['count' => $remaining, 'plural' => ''])).'</i>';
        }

        $lines[] = '';
        $lines[] = '<b>'.htmlspecialchars(TelegramBotTexts::get($locale, 'grand_total'), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
            .': $'.number_format((float) $order->total, 2).'</b>';

        $replyMarkup = $this->keyboardForChat($chatId, $order);

        $this->sendMessage((string) $chatId, implode("\n", $lines), $replyMarkup, 'HTML');
    }

    public function answerCallbackQuery(string $callbackQueryId, ?string $text = null): void
    {
        if (! $this->isEnabled()) {
            return;
        }

        $payload = ['callback_query_id' => $callbackQueryId];
        if ($text !== null) {
            $payload['text'] = $text;
        }

        try {
            Http::timeout(10)->post(
                'https://api.telegram.org/bot'.config('services.telegram.bot_token').'/answerCallbackQuery',
                $payload
            );
        } catch (\Throwable $e) {
            Log::warning('Telegram answerCallbackQuery failed', ['error' => $e->getMessage()]);
        }
    }

    public function sendPhoto(string $chatId, string $pngBytes, ?string $caption = null, ?array $replyMarkup = null): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }

        try {
            $multipart = [
                ['name' => 'chat_id', 'contents' => $chatId],
                ['name' => 'photo', 'contents' => $pngBytes, 'filename' => 'payment-qr.png'],
            ];

            if ($caption !== null) {
                $multipart[] = ['name' => 'caption', 'contents' => $caption];
                $multipart[] = ['name' => 'parse_mode', 'contents' => 'Markdown'];
            }

            if ($replyMarkup !== null) {
                $multipart[] = [
                    'name' => 'reply_markup',
                    'contents' => json_encode($replyMarkup, JSON_UNESCAPED_UNICODE),
                ];
            }

            $response = Http::timeout(20)
                ->asMultipart()
                ->post('https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendPhoto', $multipart);

            if (! $response->successful()) {
                Log::warning('Telegram sendPhoto failed', [
                    'chat_id' => $chatId,
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);

                // Retry caption without Markdown if parse failed, keep buttons.
                if ($caption !== null && $replyMarkup !== null) {
                    $retryParts = [
                        ['name' => 'chat_id', 'contents' => $chatId],
                        ['name' => 'photo', 'contents' => $pngBytes, 'filename' => 'payment-qr.png'],
                        ['name' => 'caption', 'contents' => preg_replace('/[*_`]/', '', $caption) ?? $caption],
                        ['name' => 'reply_markup', 'contents' => json_encode($replyMarkup, JSON_UNESCAPED_UNICODE)],
                    ];
                    $retry = Http::timeout(20)
                        ->asMultipart()
                        ->post('https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendPhoto', $retryParts);

                    return $retry->successful();
                }

                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('Telegram sendPhoto exception', [
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function sendDocument(string $chatId, string $filePath, string $filename, ?string $caption = null): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }

        if (! is_readable($filePath)) {
            Log::warning('Telegram sendDocument: file not readable', ['path' => $filePath]);

            return false;
        }

        try {
            $stream = fopen($filePath, 'r');
            if ($stream === false) {
                return false;
            }

            $fields = ['chat_id' => $chatId];
            if ($caption !== null && $caption !== '') {
                $fields['caption'] = $caption;
            }

            $response = Http::timeout(120)
                ->attach('document', $stream, $filename)
                ->post(
                    'https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendDocument',
                    $fields
                );

            if (is_resource($stream)) {
                fclose($stream);
            }

            if ($response->successful()) {
                return true;
            }

            Log::warning('Telegram sendDocument failed', [
                'chat_id' => $chatId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;
        } catch (\Throwable $e) {
            Log::error('Telegram sendDocument exception', [
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    public function sendMessage(string $chatId, string $text, ?array $replyMarkup = null, ?string $parseMode = 'Markdown'): bool
    {
        if (! $this->isEnabled()) {
            return false;
        }

        $payload = [
            'chat_id' => $chatId,
            'text' => $text,
            'disable_web_page_preview' => true,
        ];

        if ($parseMode !== null) {
            $payload['parse_mode'] = $parseMode;
        }

        // Telegram Bot API expects reply_markup as a JSON *string* in form-urlencoded bodies.
        if ($replyMarkup !== null) {
            $payload['reply_markup'] = json_encode($replyMarkup, JSON_UNESCAPED_UNICODE);
        }

        $endpoint = 'https://api.telegram.org/bot'.config('services.telegram.bot_token').'/sendMessage';

        try {
            // Use asForm() — Laravel Http defaults to JSON, which breaks reply_markup when double-encoded.
            $response = Http::asForm()->timeout(15)->post($endpoint, $payload);

            if ($response->successful()) {
                return true;
            }

            Log::warning('Telegram sendMessage failed', [
                'chat_id' => $chatId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            // Retry without parse mode — Markdown/HTML often breaks on addresses / phone numbers.
            if ($parseMode !== null) {
                unset($payload['parse_mode']);
                $retry = Http::asForm()->timeout(15)->post($endpoint, $payload);

                if ($retry->successful()) {
                    return true;
                }

                Log::warning('Telegram sendMessage retry (no parse_mode) failed', [
                    'chat_id' => $chatId,
                    'status' => $retry->status(),
                    'body' => $retry->body(),
                ]);
            }

            return false;
        } catch (\Throwable $e) {
            Log::error('Telegram sendMessage exception', [
                'chat_id' => $chatId,
                'error' => $e->getMessage(),
            ]);

            return false;
        }
    }

    /**
     * Send a test admin alert with action buttons (for verifying TELEGRAM_ADMIN_CHAT_ID).
     */
    public function sendAdminTestMessage(): array
    {
        $chatId = trim((string) config('services.telegram.admin_chat_id', ''));
        if ($chatId === '') {
            return ['ok' => false, 'message' => 'TELEGRAM_ADMIN_CHAT_ID is empty'];
        }

        if (! $this->isEnabled()) {
            return ['ok' => false, 'message' => 'TELEGRAM_BOT_TOKEN is not configured'];
        }

        $keyboard = [
            'inline_keyboard' => [
                [
                    ['text' => '🧾 Invoice (test)', 'callback_data' => 'invoice_0'],
                    ['text' => '✅ Admin OK', 'callback_data' => 'lang_menu'],
                ],
                [
                    ['text' => '⏳ Processing', 'callback_data' => 'adminst_0_processing'],
                    ['text' => '📦 Shipped', 'callback_data' => 'adminst_0_shipped'],
                ],
            ],
        ];

        $message = "🧪 <b>The Man Store admin test</b>\n\n"
            .'Chat ID: <code>'.htmlspecialchars($chatId, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')."</code>\n"
            ."If you see buttons below, admin Telegram is working.";

        $sent = $this->sendMessage($chatId, $message, $keyboard, 'HTML');

        return [
            'ok' => $sent,
            'message' => $sent
                ? 'Test message sent to '.$chatId
                : 'Failed to send test message to '.$chatId.' — check bot is in group and can post',
            'chat_id' => $chatId,
        ];
    }

    /**
     * Customer Telegram chats only (never shop staff / driver / admin group).
     *
     * @return Collection<int, int>
     */
    private function resolveCustomerChatIds(Order $order): Collection
    {
        $chatIds = collect();

        if ($order->user_id) {
            $chatIds = $chatIds->merge(
                TelegramUser::query()->where('user_id', $order->user_id)->pluck('chat_id')
            );
        }

        $chatIds = $chatIds->merge(
            TelegramOrderSubscription::query()->where('order_id', $order->id)->pluck('chat_id')
        );

        $driverChats = $this->resolveDriverChatIds($order);

        return $chatIds
            ->map(fn ($chatId) => (int) $chatId)
            ->filter(function (int $chatId) use ($driverChats) {
                if (! $this->isDeliverableTelegramChatId($chatId)) {
                    return false;
                }
                if ($this->isAdminChatId($chatId) || $this->isStaffOrDriverChat($chatId)) {
                    return false;
                }
                if ($driverChats->contains($chatId)) {
                    return false;
                }

                return true;
            })
            ->unique()
            ->values();
    }

    /**
     * @return Collection<int, int>
     */
    private function resolveOrderChatIds(Order $order): Collection
    {
        return $this->resolveCustomerChatIds($order);
    }

    /**
     * Driver / courier Telegram chats for a COD job — never the customer.
     *
     * @return Collection<int, int>
     */
    private function resolveDriverChatIds(Order $order): Collection
    {
        $ids = collect();
        $cached = Cache::get('tg-cod-driver-chat:'.$order->id);
        if ($cached) {
            $ids->push((int) $cached);
        }

        $order->loadMissing(['payments', 'shipment']);
        foreach ($order->payments as $payment) {
            $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
            $stored = (int) ($raw['driver_telegram_chat_id'] ?? 0);
            if ($stored > 0) {
                $ids->push($stored);
            }
        }

        $assignedDriverId = (int) ($order->shipment?->delivered_by_user_id ?? 0);
        if ($assignedDriverId > 0) {
            $ids = $ids->merge(
                TelegramUser::query()->where('user_id', $assignedDriverId)->pluck('chat_id')
            );
        }

        $customerChatIds = $order->user_id
            ? TelegramUser::query()->where('user_id', $order->user_id)->pluck('chat_id')->filter()->map(fn ($id) => (int) $id)->all()
            : [];

        $subs = TelegramOrderSubscription::query()
            ->where('order_id', $order->id)
            ->get(['chat_id', 'telegram_user_id']);

        foreach ($subs as $sub) {
            $chatId = (int) $sub->chat_id;
            if ($chatId <= 0 || $this->isAdminChatId($chatId) || in_array($chatId, $customerChatIds, true)) {
                continue;
            }

            $tgUser = $sub->telegram_user_id
                ? TelegramUser::query()->with('user')->find($sub->telegram_user_id)
                : TelegramUser::query()->with('user')->where('chat_id', $chatId)->first();

            $role = $tgUser?->user?->role;
            $isUnlinkedCourier = ! $tgUser?->user_id;
            if ($role === 'driver' || $isUnlinkedCourier) {
                $ids->push($chatId);
            }
        }

        return $ids
            ->filter(fn ($chatId) => $this->isDeliverableTelegramChatId((int) $chatId) && ! $this->isAdminChatId((int) $chatId) && ! in_array((int) $chatId, $customerChatIds, true))
            ->unique()
            ->values();
    }

    /**
     * Admin group plus every linked admin / superadmin Telegram chat.
     *
     * @return Collection<int, int>
     */
    private function resolveAdminChatIds(): Collection
    {
        $ids = collect();
        $configured = trim((string) config('services.telegram.admin_chat_id', ''));
        if ($configured !== '') {
            $ids->push((int) $configured);
        }

        $adminUserIds = User::query()->whereIn('role', ['admin', 'superadmin'])->pluck('id');
        if ($adminUserIds->isNotEmpty()) {
            $ids = $ids->merge(
                TelegramUser::query()->whereIn('user_id', $adminUserIds)->pluck('chat_id')
            );
        }

        return $ids
            ->map(fn ($chatId) => (int) $chatId)
            ->filter(fn ($chatId) => $this->isDeliverableTelegramChatId($chatId))
            ->unique()
            ->values();
    }

    private function formatCodSettlementAmount(Order $order): string
    {
        $order->loadMissing('payments');
        $payment = $order->payments->sortByDesc('id')->firstWhere('status', 'paid')
            ?? $order->payments->sortByDesc('id')->first();
        $raw = is_array($payment?->raw_response) ? $payment->raw_response : [];
        $received = $raw['actual_amount_received'] ?? $payment?->amount ?? $order->total;
        $currency = strtoupper((string) ($payment?->currency ?? $raw['currency'] ?? 'USD'));

        if ($currency === 'KHR') {
            return number_format((float) $received).' ៛';
        }

        return '$'.number_format((float) $received, 2);
    }

    /**
     * @param  \Closure(string $locale): array{0: string, 1: ?array}  $buildForLocale
     */
    private function notifyOrderRecipients(Order $order, \Closure $buildForLocale): void
    {
        foreach ($this->resolveCustomerChatIds($order) as $chatId) {
            $locale = $this->resolveLocaleForOrderChat($order, (int) $chatId);
            [$message, $replyMarkup] = $buildForLocale($locale);
            $this->sendMessage((string) $chatId, $message, $replyMarkup, 'HTML');
        }
    }

    /**
     * Escape dynamic values for HTML Telegram messages.
     *
     * @param  array<string, string|int|float>  $replace
     * @return array<string, string>
     */
    private function htmlReplace(array $replace): array
    {
        $out = [];
        foreach ($replace as $key => $value) {
            if ($key === 'cod_note') {
                // Already localized HTML snippet.
                $out[$key] = (string) $value;
            } else {
                $out[$key] = htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
            }
        }

        return $out;
    }

    private function createInAppNotification(Order $order, string $type, string $title, string $message): void
    {
        if (! $order->user_id) {
            return;
        }

        Notification::create([
            'user_id' => $order->user_id,
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'data' => [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
            ],
            'is_read' => false,
        ]);
    }

    private function resolveOrderPhone(Order $order): string
    {
        $address = is_array($order->shipping_address) ? $order->shipping_address : [];
        foreach (['receiver_phone', 'phone', 'mobile', 'receiverPhone'] as $key) {
            $phone = trim((string) ($address[$key] ?? ''));
            if ($phone !== '') {
                return $phone;
            }
        }

        $userPhone = trim((string) ($order->user?->phone ?? ''));

        return $userPhone !== '' ? $userPhone : '—';
    }

    private function formatAddress(Order $order): string
    {
        return ShippingAddress::format($order->shipping_address);
    }

    private function formatAdminNewOrderTelegramMessage(Order $order): string
    {
        $invoice = $this->invoices->buildOrderInvoiceData($order, InvoiceService::AUDIENCE_SHOP);
        $customer = $invoice['customer'] ?? [];
        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $label = $order->order_number ?: '#'.$order->id;
        $paymentLabel = $this->formatPaymentMethodLabel($order);
        $paidLabel = ($invoice['payment_status'] ?? '') === 'PAID' ? 'Paid' : 'Pending';
        $orderTime = $order->created_at?->timezone(config('app.timezone'))->format('Y-m-d H:i') ?? '';

        $lines = [
            '🔔 <b>New paid order</b>',
            '',
            'Order: <code>'.$e($label).'</code>',
            'Date: '.$e($orderTime),
            'Payment: <b>'.$e($paidLabel).'</b> · '.$e($paymentLabel),
            '',
            '<b>Customer</b>',
            $e((string) ($customer['name'] ?? 'Guest')),
        ];

        $phone = trim((string) ($customer['phone'] ?? ''));
        if ($phone !== '' && $phone !== '-') {
            $lines[] = '📞 '.$e($phone);
        }

        $fullAddress = trim((string) ($customer['full_address'] ?? ''));
        if ($fullAddress !== '' && $fullAddress !== '-') {
            $lines[] = '📍 '.$e($fullAddress);
        }

        $note = trim((string) (is_array($order->shipping_address) ? ($order->shipping_address['landmark'] ?? '') : ''));
        if ($note !== '' && ! str_contains($fullAddress, $note)) {
            $lines[] = 'Note: '.$e($note);
        }

        $lines[] = '';
        $lines[] = '<b>Items</b>';

        $items = $invoice['items'] ?? [];
        $maxItems = 8;
        foreach (array_slice($items, 0, $maxItems) as $item) {
            $name = $e((string) ($item['product_name'] ?? 'Item'));
            $sku = $e((string) ($item['sku'] ?? '-'));
            $qty = (int) ($item['quantity'] ?? 0);
            $lineTotal = number_format((float) ($item['grand_total'] ?? 0), 2);
            $lines[] = '• '.$name;
            $lines[] = '  <code>'.$sku.'</code> · qty '.$qty.' — $'.$lineTotal;
        }

        $remaining = count($items) - $maxItems;
        if ($remaining > 0) {
            $lines[] = '<i>+'.$remaining.' more item(s)</i>';
        }

        $lines[] = '';
        $lines[] = 'Subtotal: $'.number_format((float) ($invoice['subtotal'] ?? 0), 2);

        if ((float) ($invoice['discount'] ?? 0) > 0) {
            $lines[] = 'Discount: −$'.number_format((float) $invoice['discount'], 2);
        }

        $lines[] = 'Shipping: $'.number_format((float) ($invoice['shipping_fee'] ?? 0), 2);
        $lines[] = '<b>Total: $'.number_format((float) ($invoice['grand_total'] ?? 0), 2).'</b>';

        if ($order->payment_method === 'cod' && $order->payment_status !== 'paid') {
            $lines[] = '';
            $lines[] = '<i>COD — collect $'.number_format((float) $order->total, 2).' on delivery</i>';
        }

        $message = implode("\n", $lines);
        if (strlen($message) > 4000) {
            $message = substr($message, 0, 3990)."\n…";
        }

        return $message;
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    public function buildAdminOrderKeyboardPublic(Order $order): ?array
    {
        return $this->buildAdminOrderKeyboard($order);
    }

    private function formatAdminOrderCardHtml(Order $order, string $kind = 'paid'): string
    {
        $order->loadMissing(['user', 'items.product', 'shipment']);
        $invoice = $this->invoices->buildOrderInvoiceData($order, InvoiceService::AUDIENCE_SHOP);
        $customer = $invoice['customer'] ?? [];
        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

        $label = $order->order_number ?: '#'.$order->id;
        $paymentLabel = $this->formatPaymentMethodLabel($order);
        $paidLabel = ($invoice['payment_status'] ?? '') === 'PAID' ? 'Paid / បានបង់' : 'Pending / មិនទាន់បង់';
        $orderTime = $order->created_at?->timezone(config('app.timezone'))->format('Y-m-d H:i') ?? '';
        $shipment = $order->shipment;
        $shipStatus = $shipment
            ? ucfirst(str_replace('_', ' ', (string) $shipment->status))
            : '—';

        $title = match ($kind) {
            'new' => "🔔 <b>ការបញ្ជាទិញថ្មី</b>\n<i>New order — awaiting payment</i>",
            'cod' => "🔔 <b>ការបញ្ជាទិញ COD ថ្មី</b>\n<i>New COD order</i>",
            'failed' => "❌ <b>ការបង់ប្រាក់បរាជ័យ</b>\n<i>Payment failed</i>",
            'expired' => "⌛ <b>QR / ការបង់ផុតកំណត់</b>\n<i>Payment expired</i>",
            'cancelled' => "🚫 <b>ការបញ្ជាទិញត្រូវបានបោះបង់</b>\n<i>Order cancelled</i>",
            'completed' => "✅ <b>ដឹកដល់ / បញ្ចប់</b>\n<i>Order completed</i>",
            'cod_driver_paid' => "✅ <b>អ្នកដឹកបានបង់មកហាងជោគជ័យ — បញ្ចប់</b>\n<i>Driver paid the shop — order complete</i>",
            'cod_customer_paid' => "✅ <b>Customer បានបង់មកហាងជោគជ័យ — បញ្ចប់</b>\n<i>Customer paid the shop — order complete</i>",
            default => "🔔 <b>ការបញ្ជាទិញបានបង់</b>\n<i>Payment successful</i>",
        };

        $lines = [
            $title,
            '',
            '🧾 Order: <code>'.$e($label).'</code>',
            '📅 Date: '.$e($orderTime),
            '💳 Payment: <b>'.$e($paidLabel).'</b> · '.$e($paymentLabel),
            '📦 Shipment: <b>'.$e($shipStatus).'</b>',
            '',
            '<b>អតិថិជន / Customer</b>',
            '👤 '.$e((string) ($customer['name'] ?? $order->user?->name ?? 'Guest')),
        ];

        $address = is_array($order->shipping_address) ? $order->shipping_address : [];

        $accountName = trim((string) ($order->user?->name ?? ''));
        $receiver = trim((string) ($address['receiver_name'] ?? ''));
        if ($receiver !== '' && $receiver !== $accountName) {
            $lines[] = '📥 ទទួល / Receiver: '.$e($receiver);
        }

        $phone = trim((string) ($customer['phone'] ?? $this->resolveOrderPhone($order)));
        if ($phone !== '' && $phone !== '-' && $phone !== '—') {
            $lines[] = '📞 '.$e($phone);
        }

        $fullAddress = trim((string) ($customer['full_address'] ?? $this->formatAddress($order)));
        if ($fullAddress !== '' && $fullAddress !== '-' && $fullAddress !== '—') {
            $lines[] = '📍 '.$e($fullAddress);
        }

        if (! ShippingAddress::isDeliverable($address)) {
            $lines[] = '⚠️ <b>អាសយដ្ឋានមិនពេញលេញ</b> — សូមទូរស័ព្ទសួរអតិថិជនមុនដឹក';
            $lines[] = '<i>Incomplete address — call the customer before dispatch</i>';
        }

        $lat = $address['latitude'] ?? null;
        $lng = $address['longitude'] ?? null;
        if (filled($lat) && filled($lng)) {
            $lines[] = '🗺 <a href="https://maps.google.com/?q='.$e((string) $lat).','.$e((string) $lng).'">Google Maps</a>';
        }

        $lines[] = '';
        $lines[] = '<b>ទំនិញ / Items</b>';
        $items = $invoice['items'] ?? [];
        if ($items === [] && $order->items->isNotEmpty()) {
            foreach ($order->items as $item) {
                $qty = (int) ($item->qty ?? 0);
                $price = (float) ($item->price ?? 0);
                $lineTotal = (float) ($item->line_total ?? ($qty * $price));
                $items[] = [
                    'product_name' => $item->name ?: ($item->product->name ?? 'Item'),
                    'sku' => $item->sku ?: ($item->product->sku ?? '-'),
                    'quantity' => $qty,
                    'grand_total' => $lineTotal,
                ];
            }
        }
        if ($items === []) {
            $lines[] = '<i>— គ្មានទិន្នន័យទំនិញ</i>';
        }
        $maxItems = 8;
        foreach (array_slice($items, 0, $maxItems) as $item) {
            $name = $e((string) ($item['product_name'] ?? 'Item'));
            $sku = $e((string) ($item['sku'] ?? '-'));
            $qty = (int) ($item['quantity'] ?? 0);
            $lineTotal = number_format((float) ($item['grand_total'] ?? 0), 2);
            $lines[] = '• '.$name;
            $lines[] = '  <code>'.$sku.'</code> · ចំនួន '.$qty.' — $'.$lineTotal;
        }
        $remaining = count($items) - $maxItems;
        if ($remaining > 0) {
            $lines[] = '<i>+'.$remaining.' more</i>';
        }

        $lines[] = '';
        $lines[] = 'Subtotal: $'.number_format((float) ($invoice['subtotal'] ?? 0), 2);
        if ((float) ($invoice['discount'] ?? 0) > 0) {
            $lines[] = 'Discount: −$'.number_format((float) $invoice['discount'], 2);
        }
        $lines[] = 'Shipping: $'.number_format((float) ($invoice['shipping_fee'] ?? 0), 2);
        $lines[] = '<b>សរុប / Total: $'.number_format((float) ($invoice['grand_total'] ?? $order->total), 2).'</b>';

        if ($shipment?->tracking_code) {
            $lines[] = 'Tracking: <code>'.$e((string) $shipment->tracking_code).'</code>';
        }
        if ($shipment?->provider && strtolower((string) $shipment->provider) !== 'internal') {
            $lines[] = 'Courier: '.$e((string) $shipment->provider);
        }

        if ($order->payment_method === 'cod' && $order->payment_status !== 'paid') {
            $lines[] = '';
            $lines[] = '<i>COD — ប្រមូល $'.number_format((float) $order->total, 2).' ពេលដឹកដល់</i>';
        }

        if ($kind === 'failed' || $kind === 'expired') {
            $lines[] = '';
            $lines[] = $kind === 'expired'
                ? '<i>The customer can still pay from a new QR or the paper invoice QR.</i>'
                : '<i>Follow up with the customer if they still want this order.</i>';
        }

        if ($kind === 'cancelled') {
            $lines[] = '';
            $lines[] = '<i>This sale was cancelled.</i>';
        }

        if ($kind === 'cod_customer_paid') {
            $lines[] = '';
            $lines[] = '<b>Customer បង់មកហាង / Customer paid the shop</b>';
            $lines[] = '<i>Shop KHQR — order completed.</i>';
        }

        if ($kind === 'cod_driver_paid') {
            $order->loadMissing('payments');
            $payment = $order->payments->sortByDesc('id')->firstWhere('status', 'paid')
                ?? $order->payments->sortByDesc('id')->first();
            $raw = is_array($payment?->raw_response) ? $payment->raw_response : [];
            $settlementKm = trim((string) ($raw['settlement_label_km'] ?? ''));
            $settlementEn = trim((string) ($raw['settlement_label_en'] ?? ''));
            $qrLabel = trim((string) ($raw['qr_bank_label'] ?? $raw['qr_bank'] ?? ''));
            $courier = trim((string) ($raw['courier_name'] ?? ''));
            if ($courier === '' && $shipment?->provider && strtolower((string) $shipment->provider) !== 'internal') {
                $courier = (string) $shipment->provider;
            }

            $lines[] = '';
            $lines[] = '<b>ការបង់ជំនួស / Driver settlement</b>';
            if ($settlementKm !== '') {
                $lines[] = $e($settlementKm);
            }
            if ($settlementEn !== '' && $settlementEn !== $settlementKm) {
                $lines[] = '<i>'.$e($settlementEn).'</i>';
            }
            if ($qrLabel !== '') {
                $lines[] = 'QR: '.$e($qrLabel);
            }
            $lines[] = 'ទទួលពិត / Received: '.$e($this->formatCodSettlementAmount($order));
            if ($courier !== '') {
                $lines[] = 'អ្នកដឹក / Courier: '.$e($courier);
            }
        }

        $message = implode("\n", $lines);
        if (strlen($message) > 4000) {
            $message = substr($message, 0, 3990)."\n…";
        }

        return $message;
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}|null
     */
    private function buildAdminOrderKeyboard(Order $order): ?array
    {
        $order->loadMissing('shipment');
        if ($order->isSuccessfullyClosed()) {
            return $this->buildClosedOrderKeyboard($order);
        }

        $shipment = $order->shipment;
        $rows = [];

        // Short bilingual labels (2 per row) to avoid Telegram truncation.
        $actionRow = [
            ['text' => '🧾 វិក័យបត្រ', 'callback_data' => 'invoice_'.$order->id],
        ];
        if ($order->payment_status !== 'paid') {
            $actionRow[] = [
                'text' => $order->payment_method === 'cod' ? '💳 KHQR COD' : '💳 KHQR',
                'callback_data' => 'payqr_'.$order->id,
            ];
        }
        $rows[] = $actionRow;

        if ($order->payment_status !== 'paid' && $order->payment_method === 'cod') {
            $rows[] = [
                [
                    'text' => TelegramBotTexts::get('km', 'btn_i_paid'),
                    'callback_data' => 'paidok_'.$order->id,
                ],
                [
                    'text' => TelegramBotTexts::get('km', 'btn_confirm_shop_received'),
                    'callback_data' => 'shopok_'.$order->id,
                ],
            ];
        }

        if ($shipment && filled($shipment->external_tracking_url)) {
            $provider = $shipment->provider && strtolower((string) $shipment->provider) !== 'internal'
                ? (string) $shipment->provider
                : 'Courier';
            $rows[] = [[
                'text' => '🔗 Track '.$provider,
                'url' => $shipment->external_tracking_url,
            ]];
        }

        $current = strtolower((string) ($shipment?->status ?? $order->status ?? ''));

        $rows[] = [
            $this->telegramStatusButton('⏳ រៀបចំ', $order->id, 'processing', $current, 'adminst_'),
            $this->telegramStatusButton('📦 ដឹកចេញ', $order->id, 'shipped', $current, 'adminst_'),
        ];
        $rows[] = [
            $this->telegramStatusButton('🚚 កំពុងដឹក', $order->id, 'in_transit', $current, 'adminst_'),
            $this->telegramStatusButton('📍 មកដល់', $order->id, 'arrived', $current, 'adminst_'),
        ];
        $rows[] = [
            $this->telegramStatusButton('📦 បានទទួលអីវ៉ាន់', $order->id, 'delivered', $current, 'adminst_'),
        ];
        $rows[] = [
            $this->telegramStatusButton('⚠️ បរាជ័យ', $order->id, 'failed', $current, 'adminst_'),
            $this->telegramStatusButton('↩️ ត្រឡប់', $order->id, 'returned', $current, 'adminst_'),
        ];

        return ['inline_keyboard' => $rows];
    }

    /**
     * Invoice / tracking only — no status or payment actions.
     *
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    private function buildClosedOrderKeyboard(Order $order, string $locale = 'km'): array
    {
        $order->loadMissing('shipment');
        $rows = [[
            ['text' => TelegramBotTexts::get($locale, 'btn_invoice'), 'callback_data' => 'invoice_'.$order->id],
        ]];

        $shipment = $order->shipment;
        if ($shipment && filled($shipment->external_tracking_url)) {
            $provider = $shipment->provider && strtolower((string) $shipment->provider) !== 'internal'
                ? (string) $shipment->provider
                : TelegramBotTexts::get($locale, 'courier_fallback');
            $rows[] = [[
                'text' => TelegramBotTexts::get($locale, 'btn_track_on', ['provider' => $provider]),
                'url' => $shipment->external_tracking_url,
            ]];
        }

        return ['inline_keyboard' => $rows];
    }

    /**
     * @return array{text: string, callback_data: string}
     */
    private function telegramStatusButton(
        string $label,
        int $orderId,
        string $status,
        string $current,
        string $prefix
    ): array {
        $normalized = $status === 'complete' ? 'delivered' : $status;
        $active = $current === $normalized
            || ($normalized === 'delivered' && in_array($current, ['delivered', 'completed'], true));

        return [
            'text' => ($active ? '✅ ' : '').$label,
            'callback_data' => $active ? 'stused_'.$orderId : $prefix.$orderId.'_'.$status,
        ];
    }

    public function editMessageReplyMarkup(int $chatId, int $messageId, ?array $replyMarkup): void
    {
        if (! $this->isEnabled() || $chatId === 0 || $messageId <= 0) {
            return;
        }

        try {
            $payload = [
                'chat_id' => $chatId,
                'message_id' => $messageId,
                'reply_markup' => json_encode(
                    $replyMarkup ?? ['inline_keyboard' => []],
                    JSON_UNESCAPED_UNICODE
                ),
            ];

            Http::asForm()->timeout(10)->post(
                'https://api.telegram.org/bot'.config('services.telegram.bot_token').'/editMessageReplyMarkup',
                $payload
            );
        } catch (\Throwable $e) {
            Log::warning('Telegram editMessageReplyMarkup failed', [
                'chat_id' => $chatId,
                'message_id' => $messageId,
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function formatPaymentMethodLabel(Order $order): string
    {
        return match ($order->payment_method) {
            'cod' => 'COD',
            'bakong_khqr' => 'KHQR',
            default => ucfirst(str_replace('_', ' ', (string) ($order->payment_method ?: 'online'))),
        };
    }
}
