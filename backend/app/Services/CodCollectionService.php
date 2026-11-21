<?php

namespace App\Services;

use App\Jobs\WatchKhqrPayment;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class CodCollectionService
{
    public const CASH_SETTLEMENTS = [
        'cod_cash_usd',
        'cod_cash_khr',
    ];

    public const DRIVER_ADVANCE_PLAN = 'driver_advance';

    public const COLLECT_AT_DELIVERY_PLAN = 'collect_at_delivery';

    /** Shop prepaid shipping — customer scans shop KHQR (full total) from the driver Telegram bot. */
    public const CUSTOMER_PAYS_SHOP_PLAN = 'customer_pays_shop';

    public const PLANS = [
        self::DRIVER_ADVANCE_PLAN,
        self::COLLECT_AT_DELIVERY_PLAN,
        self::CUSTOMER_PAYS_SHOP_PLAN,
    ];

    public const QR_BANKS = [
        'aba' => 'ABA',
        'acleda' => 'ACLEDA',
        'wing' => 'Wing',
        'other' => 'Other QR',
    ];

    public const BAKONG_SUFFIX_TO_BANK = [
        'abaa' => 'aba',
        'aba' => 'aba',
        'aclb' => 'acleda',
        'acle' => 'acleda',
        'acleda' => 'acleda',
        'wing' => 'wing',
    ];

    public const BAKONG_SUFFIX_LABELS = [
        'abaa' => 'ABA',
        'aba' => 'ABA',
        'aclb' => 'ACLEDA',
        'acle' => 'ACLEDA',
        'acleda' => 'ACLEDA',
        'wing' => 'Wing',
        'cadi' => 'Canadia',
        'sath' => 'Sathapana',
        'vblc' => 'Vattanac',
        'ppcb' => 'Prince',
        'hlbk' => 'Hong Leong',
        'amkb' => 'AMK',
        'pchc' => 'PPCBank',
    ];

    public const DRIVER_QR = 'cod_driver_qr';

    public const DRIVER_CASH = 'cod_driver_cash';

    public const CUSTOMER_DRIVER_QR = 'cod_customer_driver_qr';

    public const DRIVER_SETTLEMENTS = [
        self::DRIVER_QR,
        self::DRIVER_CASH,
        self::CUSTOMER_DRIVER_QR,
    ];

    public function __construct(
        private readonly RielpayPaymentService $rielpayPayments,
    ) {
    }

    public function getExchangeRate(): int
    {
        $setting = Setting::where('key', 'usd_khr_exchange_rate')->first();
        $rate = (int) ($setting?->value ?? 4100);

        return max(1, $rate);
    }

    public function khrAmountForOrder(Order $order): int
    {
        return (int) round((float) $order->total * $this->getExchangeRate());
    }

    /**
     * @return array{
     *   customer_usd: float,
     *   goods_usd: float,
     *   shipping_usd: float,
     *   shop_qr_usd: float,
     *   customer_khr: int,
     *   shop_qr_khr: int
     * }
     */
    public function amountBreakdown(Order $order, ?string $plan = null): array
    {
        $customerUsd = round((float) $order->total, 2);
        $shippingUsd = max(0, round((float) ($order->shipping ?? 0), 2));
        $goodsUsd = max(0, round($customerUsd - $shippingUsd, 2));
        $plan = $plan ?: $this->currentPlan(
            $order->relationLoaded('payments')
                ? $order->payments->where('status', 'pending')->sortByDesc('id')->first()
                : $this->pendingCodPayment($order)
        );

        $shopQrUsd = $plan === self::COLLECT_AT_DELIVERY_PLAN && $shippingUsd > 0 && $goodsUsd > 0
            ? $goodsUsd
            : $customerUsd;

        $rate = $this->getExchangeRate();

        return [
            'customer_usd' => $customerUsd,
            'goods_usd' => $goodsUsd,
            'shipping_usd' => $shippingUsd,
            'shop_qr_usd' => $shopQrUsd,
            'customer_khr' => max(1, (int) round($customerUsd * $rate)),
            'shop_qr_khr' => max(1, (int) round($shopQrUsd * $rate)),
        ];
    }

    public function khrAmountForShopKhqr(Order $order, ?string $plan = null): int
    {
        return $this->amountBreakdown($order, $plan)['shop_qr_khr'];
    }

    public function planLabel(string $plan): string
    {
        return match ($plan) {
            self::COLLECT_AT_DELIVERY_PLAN => 'Customer បង់ QR អ្នកដឹក — អ្នកដឹកបង់ហាង (កាត់ថ្លៃដឹក) / Customer pays driver, driver remits goods only',
            self::CUSTOMER_PAYS_SHOP_PLAN => 'ហាងចេញថ្លៃដឹករួច — Customer ស្កេន QR ហាងពេញចំនួន / Shop prepaid shipping, customer pays shop in full',
            default => 'Driver បង់ឥឡូវ (ចេញលុយសិន) / Driver pays the shop now',
        };
    }

    /**
     * Shop-QR / driver-to-shop COD settlement — internal, not a customer payment.
     */
    public function isDriverToShopSettlement(Order $order): bool
    {
        if (strtolower((string) $order->payment_method) !== 'cod') {
            return false;
        }

        $payment = $order->relationLoaded('payments')
            ? $order->payments->sortByDesc('id')
            : Payment::query()->where('order_id', $order->id)->orderByDesc('id')->get();

        $payment = $payment->firstWhere('status', 'paid') ?? $payment->first();

        if (! $payment) {
            return false;
        }

        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        if (
            ($raw['cod_plan'] ?? null) === self::CUSTOMER_PAYS_SHOP_PLAN
            || ($raw['paid_by'] ?? null) === 'customer'
        ) {
            return false;
        }

        if ($payment->method === 'cod_khqr') {
            return true;
        }
        if (($raw['paid_by'] ?? null) === 'driver' || ($raw['scanned_by'] ?? null) === 'driver') {
            return true;
        }

        $settlement = (string) ($raw['settlement_method'] ?? $payment->method ?? '');

        return in_array($settlement, [self::DRIVER_QR, self::DRIVER_CASH, 'cod_khqr'], true);
    }

    public function isCustomerPaysShopSettlement(Order $order): bool
    {
        if (strtolower((string) $order->payment_method) !== 'cod') {
            return false;
        }

        $payment = $order->relationLoaded('payments')
            ? $order->payments->sortByDesc('id')
            : Payment::query()->where('order_id', $order->id)->orderByDesc('id')->get();

        $payment = $payment->firstWhere('status', 'paid') ?? $payment->first();
        if (! $payment) {
            return false;
        }

        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];

        return ($raw['cod_plan'] ?? null) === self::CUSTOMER_PAYS_SHOP_PLAN
            || ($raw['paid_by'] ?? null) === 'customer';
    }

    /**
     * Option 1 — driver paid the shop before delivery. Internal; customer must not be alerted.
     */
    public function isDriverAdvanceSettlement(Order $order): bool
    {
        if (! $this->isDriverToShopSettlement($order)) {
            return false;
        }

        $payment = $order->relationLoaded('payments')
            ? ($order->payments->sortByDesc('id')->firstWhere('status', 'paid') ?? $order->payments->sortByDesc('id')->first())
            : Payment::query()->where('order_id', $order->id)->orderByDesc('id')->first();

        $plan = $this->currentPlan($payment);
        $raw = is_array($payment?->raw_response) ? $payment->raw_response : [];
        $plan = $plan ?: (string) ($raw['cod_plan'] ?? '');

        if ($plan === self::COLLECT_AT_DELIVERY_PLAN || $plan === self::CUSTOMER_PAYS_SHOP_PLAN) {
            return false;
        }

        return $plan === self::DRIVER_ADVANCE_PLAN || $plan === '';
    }

    public function shouldCompleteCodOnShopPaid(Order $order, ?Payment $payment = null): bool
    {
        if (strtolower((string) $order->payment_method) !== 'cod') {
            return false;
        }

        $payment ??= $order->relationLoaded('payments')
            ? ($order->payments->sortByDesc('id')->firstWhere('status', 'paid') ?? $order->payments->sortByDesc('id')->first())
            : Payment::query()->where('order_id', $order->id)->orderByDesc('id')->first();

        $raw = is_array($payment?->raw_response) ? $payment->raw_response : [];
        $method = strtolower((string) ($payment?->method ?? ''));
        $settlement = strtolower((string) ($raw['settlement_method'] ?? $method));
        if ($method === self::CUSTOMER_DRIVER_QR || $settlement === self::CUSTOMER_DRIVER_QR) {
            return false;
        }

        return true;
    }

    public function isPendingCustomerToDriverRemittance(Order $order): bool
    {
        if (strtolower((string) $order->payment_method) !== 'cod') {
            return false;
        }

        $payment = $order->relationLoaded('payments')
            ? $order->payments->sortByDesc('id')->first()
            : Payment::query()->where('order_id', $order->id)->orderByDesc('id')->first();

        if (! $payment) {
            return false;
        }

        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        $method = strtolower((string) ($payment->method ?? ''));

        return $method === self::CUSTOMER_DRIVER_QR
            || ($raw['remittance_to_shop'] ?? null) === 'pending';
    }

    public function assertCollectibleCodOrder(Order $order): void
    {
        if ($order->payment_method !== 'cod') {
            throw ValidationException::withMessages([
                'order' => ['This order is not a cash-on-delivery order.'],
            ]);
        }

        if ($order->payment_status === 'paid') {
            throw ValidationException::withMessages([
                'order' => ['This order is already paid.'],
            ]);
        }
    }

    /**
     * @return array{payment: Payment, exchange_rate: int, khr_amount: int}
     */
    public function quote(Order $order): array
    {
        $this->assertCollectibleCodOrder($order);

        $payment = $this->pendingCodPayment($order);
        $exchangeRate = $this->getExchangeRate();
        $amounts = $this->amountBreakdown($order, $this->currentPlan($payment));

        $shopKhqr = $this->activeShopKhqr($order);

        return [
            'payment' => $payment,
            'exchange_rate' => $exchangeRate,
            'khr_amount' => $amounts['customer_khr'],
            'usd_amount' => $amounts['customer_usd'],
            'goods_usd' => $amounts['goods_usd'],
            'shipping_usd' => $amounts['shipping_usd'],
            'shop_qr_usd' => $amounts['shop_qr_usd'],
            'shop_qr_khr' => $amounts['shop_qr_khr'],
            'cod_plan' => $this->currentPlan($payment),
            'qr_banks' => self::QR_BANKS,
            'shop_khqr' => $shopKhqr ? $this->sanitizeKhqrPayment($shopKhqr) : null,
        ];
    }

    public function currentPlan(?Payment $payment): ?string
    {
        $raw = is_array($payment?->raw_response) ? $payment->raw_response : [];
        $plan = (string) ($raw['cod_plan'] ?? '');

        return in_array($plan, self::PLANS, true) ? $plan : null;
    }

    public function setPlan(Order $order, string $plan): Payment
    {
        if (! in_array($plan, self::PLANS, true)) {
            throw ValidationException::withMessages([
                'plan' => ['Invalid COD driver plan.'],
            ]);
        }

        $this->assertCollectibleCodOrder($order);

        $payment = $this->pendingCodPayment($order);
        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        $payment->update([
            'raw_response' => array_filter(array_merge($raw, [
                'cod_plan' => $plan,
                'cod_plan_label' => $this->planLabel($plan),
            ]), static fn ($value) => $value !== null && $value !== ''),
        ]);

        return $payment->fresh();
    }

    /**
     * @param  array{actual_amount_received?: float|int|null, notes?: string|null, courier_name?: string|null, qr_bank?: string|null, currency?: string|null}  $meta
     */
    public function collectCash(
        Order $order,
        string $settlementMethod,
        ?int $verifiedBy,
        ?string $referenceCode = null,
        array $meta = [],
    ): Payment {
        $allowed = array_merge(self::CASH_SETTLEMENTS, self::DRIVER_SETTLEMENTS);
        if (! in_array($settlementMethod, $allowed, true)) {
            throw ValidationException::withMessages([
                'settlement_method' => ['Invalid COD settlement method.'],
            ]);
        }

        $this->assertCollectibleCodOrder($order);

        $detected = $this->detectBankFromQr((string) ($meta['qr_payload'] ?? ''));
        $qrBank = strtolower(trim((string) ($meta['qr_bank'] ?? '')));
        if (! isset(self::QR_BANKS[$qrBank])) {
            $qrBank = $detected['id'];
        }
        if (in_array($settlementMethod, [self::DRIVER_QR, self::CUSTOMER_DRIVER_QR], true) && ! isset(self::QR_BANKS[$qrBank])) {
            $qrBank = 'other';
        }
        $meta['qr_bank_label'] = $detected['label'] ?: (self::QR_BANKS[$qrBank] ?? 'QR');
        $meta['qr_account'] = $detected['account'];

        return DB::transaction(function () use ($order, $settlementMethod, $verifiedBy, $referenceCode, $meta, $qrBank) {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $payment = $this->pendingCodPayment($lockedOrder);

            if ($lockedOrder->payment_status === 'paid') {
                return $payment->fresh();
            }

            $existingPlan = $this->currentPlan($payment);
            $resolved = $this->resolveSettlement($lockedOrder, $settlementMethod, $meta, $qrBank, $existingPlan);

            $payment->update([
                'provider' => 'cod',
                'method' => $settlementMethod,
                'amount' => $resolved['amount'],
                'currency' => $resolved['currency'],
                'status' => 'paid',
                'paid_at' => now(),
                'verified_by' => $verifiedBy,
                'verified_at' => now(),
                'reference_code' => $referenceCode ?: strtoupper(str_replace('cod_', '', $settlementMethod)).'-'.now()->timestamp,
                'raw_response' => $this->collectionMeta(
                    channel: $resolved['channel'],
                    channelLabel: $resolved['channel_label'],
                    settlementMethod: $settlementMethod,
                    currency: $resolved['currency'],
                    extra: $resolved['extra'],
                ),
            ]);

            $orderUpdate = ['payment_status' => 'paid'];
            if ($settlementMethod !== self::CUSTOMER_DRIVER_QR) {
                $orderUpdate['status'] = 'completed';
            }
            $lockedOrder->update($orderUpdate);

            $lockedOrder->load('items.product');
            PaidOrderInventory::applyForOrder($lockedOrder);

            return $payment->fresh();
        });
    }

    /**
     * @param  array{notes?: string|null, courier_name?: string|null}  $meta
     * @return array{payment: array<string, mixed>, exchange_rate: int, khr_amount: int}
     */
    public function createCodKhqr(Order $order, array $meta = []): array
    {
        $this->assertCollectibleCodOrder($order);

        $exchangeRate = $this->getExchangeRate();
        $payment = $this->pendingCodPayment($order);
        $plan = $this->currentPlan($payment) ?: self::DRIVER_ADVANCE_PLAN;
        $khrAmount = $this->khrAmountForShopKhqr($order, $plan);
        $collectionMeta = $this->shopKhqrMeta($plan, $khrAmount, $meta);

        $existing = Payment::where('order_id', $order->id)
            ->where('method', 'cod_khqr')
            ->khqrProvider()
            ->where('status', 'pending')
            ->where(function ($query) {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('id')
            ->first();

        if ($existing && $existing->qr_string && $this->encodedKhqrAmount($existing) === $khrAmount) {
            WatchKhqrPayment::dispatch((int) $existing->id);
            $this->rielpayPayments->scheduleAutoConfirm($existing, $order);

            return [
                'payment' => $this->sanitizeKhqrPayment($existing),
                'exchange_rate' => $exchangeRate,
                'khr_amount' => $khrAmount,
            ];
        }

        if ($existing && $existing->qr_string) {
            $existing->update(['status' => 'expired']);
        }

        Payment::where('order_id', $order->id)
            ->khqrProvider()
            ->where('status', 'pending')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);

        $payment->update([
            'provider' => 'rielpay',
            'method' => 'cod_khqr',
            'amount' => $khrAmount,
            'currency' => 'KHR',
            'status' => 'pending',
            'raw_response' => $collectionMeta,
        ]);

        try {
            $result = $this->rielpayPayments->generate($order, $payment->fresh());

            $payment->update([
                'bill_number' => $result['bill_number'],
                'md5' => $result['md5'],
                'khqr_payload' => $result['payload'],
                'qr_string' => $result['qr_string'],
                'expires_at' => $result['expires_at'],
                'amount' => $result['khr_amount'] ?? $khrAmount,
                'currency' => 'KHR',
                'raw_response' => array_merge($collectionMeta, $result['payload'] ?? []),
            ]);

            $fresh = $payment->fresh();
            WatchKhqrPayment::dispatch((int) $fresh->id);
            $this->rielpayPayments->scheduleAutoConfirm($fresh, $order);

            return [
                'payment' => $this->sanitizeKhqrPayment($fresh),
                'exchange_rate' => $exchangeRate,
                'khr_amount' => $khrAmount,
            ];
        } catch (\Throwable $e) {
            $payment->update(['status' => 'failed']);

            throw new RuntimeException($e->getMessage() ?: 'Failed to generate COD KHQR.', 0, $e);
        }
    }

    public function refreshCodKhqr(Order $order): Payment
    {
        if ($order->payment_method !== 'cod') {
            throw ValidationException::withMessages([
                'order' => ['This order is not a cash-on-delivery order.'],
            ]);
        }

        $payment = Payment::where('order_id', $order->id)
            ->where('method', 'cod_khqr')
            ->khqrProvider()
            ->latest('id')
            ->first();

        if (! $payment) {
            throw ValidationException::withMessages([
                'payment' => ['No COD KHQR payment found for this order.'],
            ]);
        }

        if (in_array($payment->status, ['paid', 'failed', 'cancelled'], true)) {
            return $payment;
        }

        if ($order->payment_status === 'paid') {
            return $payment->fresh();
        }

        return $this->rielpayPayments->refreshStatus($payment, $order);
    }

    /**
     * Shop received the driver KHQR transfer, but Bakong/Rielpay never flipped to paid.
     *
     * @param  array{courier_name?: string|null, notes?: string|null}  $meta
     */
    public function confirmShopKhqrReceived(Order $order, array $meta = []): Payment
    {
        if (strtolower((string) $order->payment_method) !== 'cod') {
            throw ValidationException::withMessages([
                'order' => ['This order is not a cash-on-delivery order.'],
            ]);
        }

        $payment = Payment::query()
            ->where('order_id', $order->id)
            ->khqrProvider()
            ->whereIn('method', ['cod_khqr', Payment::METHOD_INVOICE_KHQR])
            ->latest('id')
            ->first();

        if (! $payment) {
            throw ValidationException::withMessages([
                'payment' => ['No shop KHQR payment found for this order.'],
            ]);
        }

        if ($payment->status === 'paid' && $order->payment_status === 'paid') {
            return $payment;
        }

        $extra = array_filter([
            'confirmed_by_shop' => true,
            'confirmed_at' => now()->toIso8601String(),
            'courier_name' => $meta['courier_name'] ?? null,
            'notes' => $meta['notes'] ?? null,
        ], fn ($value) => $value !== null && $value !== '');

        $this->rielpayPayments->markPaid($payment, $order, $extra);

        return $payment->fresh() ?? $payment;
    }

    /**
     * When the driver pays the shop KHQR, record the originating bank (ABA, ACLEDA…).
     *
     * @param  array<string, mixed>  $gatewayResponse
     */
    public function annotatePaidShopKhqr(Payment $payment, array $gatewayResponse): Payment
    {
        $detected = $this->detectBankFromGatewayResponse($gatewayResponse);
        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        $plan = $this->currentPlan($payment) ?: self::DRIVER_ADVANCE_PLAN;
        $bankLabel = $detected['label'] ?: 'QR';
        $isRemit = $plan === self::COLLECT_AT_DELIVERY_PLAN;
        $customerPaysShop = $plan === self::CUSTOMER_PAYS_SHOP_PLAN;

        if ($customerPaysShop) {
            $payment->update([
                'raw_response' => $this->collectionMeta(
                    channel: 'customer_pays_shop_qr',
                    channelLabel: 'Customer ស្កេន QR ហាង / Customer scanned shop QR',
                    settlementMethod: 'cod_khqr',
                    currency: (string) ($payment->currency ?: 'KHR'),
                    extra: array_merge($raw, [
                        'cod_plan' => $plan,
                        'qr_bank' => $detected['id'],
                        'qr_bank_label' => $bankLabel,
                        'qr_account' => $detected['account'],
                        'paid_by' => 'customer',
                        'scanned_by' => 'customer',
                        'shop_presented_qr' => true,
                        'hide_from_customer' => false,
                        'expected_amount' => $raw['expected_amount'] ?? $payment->amount,
                        'actual_amount_received' => $payment->amount,
                        'settlement_label_km' => 'Customer បង់ QR ហាង ('.$bankLabel.')',
                        'settlement_label_en' => 'Customer paid the shop QR ('.$bankLabel.')',
                        'gateway_bank' => $detected,
                    ]),
                ),
            ]);

            return $payment->fresh();
        }

        $payment->update([
            'raw_response' => $this->collectionMeta(
                channel: $isRemit ? 'customer_to_driver_then_shop_qr' : 'driver_advance_qr',
                channelLabel: $isRemit
                    ? 'អ្នកដឹកបង់មកហាង — ស្កេន QR ហាង (កាត់ថ្លៃដឹក) / Driver remits via shop QR (goods only)'
                    : 'Driver បង់ឥឡូវ — QR / Driver pays shop now via QR',
                settlementMethod: self::DRIVER_QR,
                currency: (string) ($payment->currency ?: 'KHR'),
                extra: array_merge($raw, [
                    'cod_plan' => $plan,
                    'qr_bank' => $detected['id'],
                    'qr_bank_label' => $bankLabel,
                    'qr_account' => $detected['account'],
                    'paid_by' => 'driver',
                    'scanned_by' => 'driver',
                    'shop_presented_qr' => true,
                    'hide_from_customer' => true,
                    'shipping_kept_by_driver' => $isRemit,
                    'expected_amount' => $raw['expected_amount'] ?? $payment->amount,
                    'actual_amount_received' => $payment->amount,
                    'settlement_label_km' => $isRemit
                        ? 'បានបង់ដោយអ្នកដឹកជា QR ('.$bankLabel.' · កាត់ថ្លៃដឹក)'
                        : 'បានបង់ដោយអ្នកដឹកជា QR ('.$bankLabel.')',
                    'settlement_label_en' => $isRemit
                        ? 'Paid by driver via QR ('.$bankLabel.', shipping deducted)'
                        : 'Paid by driver via QR ('.$bankLabel.')',
                    'gateway_bank' => $detected,
                ]),
            ),
        ]);

        return $payment->fresh();
    }

    /**
     * @param  array<string, mixed>  $response
     * @return array{id: string, label: string, account: ?string}
     */
    public function detectBankFromGatewayResponse(array $response): array
    {
        $fromQr = $this->detectBankFromQr($this->flattenGatewayText($response));
        if ($fromQr['id'] !== 'other' || $fromQr['account']) {
            return $fromQr;
        }

        foreach (['fromAccountId', 'from_account_id', 'from_account', 'fromBakongId', 'senderBank', 'sender_bank', 'fromBank', 'bank_name', 'bankName'] as $key) {
            $value = data_get($response, $key);
            if (! is_string($value) && ! is_numeric($value)) {
                $value = data_get($response, 'data.'.$key) ?? data_get($response, 'data.data.'.$key);
            }
            if (is_string($value) || is_numeric($value)) {
                $detected = $this->detectBankFromQr((string) $value);
                if ($detected['id'] !== 'other' || $detected['account']) {
                    return $detected;
                }
            }
        }

        return ['id' => 'other', 'label' => self::QR_BANKS['other'], 'account' => null];
    }

    /**
     * @return array{id: string, label: string, account: ?string}
     */
    public function detectBankFromQr(string $payload): array
    {
        $text = trim($payload);
        if ($text === '') {
            return ['id' => 'other', 'label' => self::QR_BANKS['other'], 'account' => null];
        }

        $haystack = $text."\n".implode("\n", $this->emvValues($text));
        if (preg_match('/([a-z0-9._-]{2,40})@([a-z]{3,12})/i', $haystack, $match)) {
            $account = $match[0];
            $suffix = strtolower($match[2]);
            $id = self::BAKONG_SUFFIX_TO_BANK[$suffix] ?? 'other';
            $label = $id !== 'other'
                ? (self::QR_BANKS[$id] ?? 'QR')
                : (self::BAKONG_SUFFIX_LABELS[$suffix] ?? self::QR_BANKS['other']);

            return ['id' => $id, 'label' => $label, 'account' => $account];
        }

        $lower = strtolower($text);
        if (str_contains($lower, 'ababank') || str_contains($lower, 'pay.aba') || preg_match('/\baba(\s|$|bank|pay)/i', $text)) {
            return ['id' => 'aba', 'label' => 'ABA', 'account' => null];
        }
        if (str_contains($lower, 'acleda')) {
            return ['id' => 'acleda', 'label' => 'ACLEDA', 'account' => null];
        }
        if (preg_match('/\bwing\b/', $lower) || str_contains($lower, 'wingbank')) {
            return ['id' => 'wing', 'label' => 'Wing', 'account' => null];
        }

        return ['id' => 'other', 'label' => self::QR_BANKS['other'], 'account' => null];
    }

    /**
     * @param  array{notes?: string|null, courier_name?: string|null}  $meta
     * @return array<string, mixed>
     */
    private function shopKhqrMeta(string $plan, int $khrAmount, array $meta): array
    {
        $isRemit = $plan === self::COLLECT_AT_DELIVERY_PLAN;
        $customerPaysShop = $plan === self::CUSTOMER_PAYS_SHOP_PLAN;

        if ($customerPaysShop) {
            return $this->collectionMeta(
                channel: 'customer_pays_shop_qr',
                channelLabel: 'Customer ស្កេន QR ហាង / Customer scans shop QR',
                settlementMethod: 'cod_khqr',
                currency: 'KHR',
                extra: [
                    'cod_plan' => $plan,
                    'cod_plan_label' => $this->planLabel($plan),
                    'expected_amount' => $khrAmount,
                    'courier_name' => $meta['courier_name'] ?? null,
                    'notes' => $meta['notes'] ?? null,
                    'paid_by' => 'customer',
                    'scanned_by' => 'customer',
                    'shop_presented_qr' => true,
                    'hide_from_customer' => false,
                    'settlement_label_km' => 'Customer បង់ QR ហាងពេញចំនួន',
                    'settlement_label_en' => 'Customer paid the shop QR in full',
                ],
            );
        }

        return $this->collectionMeta(
            channel: $isRemit ? 'customer_to_driver_then_shop_qr' : 'driver_advance_qr',
            channelLabel: $isRemit
                ? 'QR ហាង — អ្នកដឹកស្កេនបង់មកហាង (កាត់ថ្លៃដឹក) / Driver remits via shop QR (goods only)'
                : 'QR ហាង — អ្នកដឹកស្កេន / Shop QR for the driver to scan',
            settlementMethod: 'cod_khqr',
            currency: 'KHR',
            extra: [
                'cod_plan' => $plan,
                'cod_plan_label' => $this->planLabel($plan),
                'expected_amount' => $khrAmount,
                'courier_name' => $meta['courier_name'] ?? null,
                'notes' => $meta['notes'] ?? null,
                'paid_by' => 'driver',
                'scanned_by' => 'driver',
                'shop_presented_qr' => true,
                'hide_from_customer' => true,
                'shipping_kept_by_driver' => $isRemit,
                'settlement_label_km' => $isRemit
                    ? 'បានបង់ដោយអ្នកដឹកជា QR (កាត់ថ្លៃដឹក)'
                    : 'បានបង់ដោយអ្នកដឹកជា QR',
                'settlement_label_en' => $isRemit
                    ? 'Paid by driver via QR (shipping deducted)'
                    : 'Paid by driver via QR',
            ],
        );
    }

    private function activeShopKhqr(Order $order): ?Payment
    {
        return Payment::where('order_id', $order->id)
            ->where('method', 'cod_khqr')
            ->khqrProvider()
            ->where('status', 'pending')
            ->whereNotNull('qr_string')
            ->where(function ($query) {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('id')
            ->first();
    }

    /**
     * @param  array<string, mixed>  $response
     */
    private function flattenGatewayText(array $response): string
    {
        $parts = [];
        $stack = [$response];
        $guard = 0;
        while ($stack && $guard < 200) {
            $guard++;
            $node = array_pop($stack);
            if (! is_array($node)) {
                continue;
            }
            foreach ($node as $key => $value) {
                if (is_string($key) && $key !== '') {
                    $parts[] = $key;
                }
                if (is_string($value) || is_numeric($value)) {
                    $parts[] = (string) $value;
                } elseif (is_array($value)) {
                    $stack[] = $value;
                }
            }
        }

        return implode("\n", $parts);
    }

    /**
     * @param  array{actual_amount_received?: float|int|null, notes?: string|null, courier_name?: string|null, qr_bank?: string|null, currency?: string|null}  $meta
     * @return array{amount: float|int, currency: string, channel: string, channel_label: string, extra: array<string, mixed>}
     */
    private function resolveSettlement(
        Order $order,
        string $settlementMethod,
        array $meta,
        string $qrBank,
        ?string $existingPlan,
    ): array {
        $bankLabel = (string) ($meta['qr_bank_label'] ?? self::QR_BANKS[$qrBank] ?? 'QR');
        $notes = $meta['notes'] ?? null;
        $courierName = $meta['courier_name'] ?? null;
        $qrAccount = $meta['qr_account'] ?? null;
        $qrPayload = $meta['qr_payload'] ?? null;

        if ($settlementMethod === self::DRIVER_QR) {
            $amount = round((float) $order->total, 2);

            return [
                'amount' => $amount,
                'currency' => 'USD',
                'channel' => 'driver_advance_qr',
                'channel_label' => 'Driver បង់ឥឡូវ — QR / Driver pays shop now via QR',
                'extra' => [
                    'cod_plan' => self::DRIVER_ADVANCE_PLAN,
                    'qr_bank' => $qrBank,
                    'qr_bank_label' => $bankLabel,
                    'qr_account' => $qrAccount,
                    'qr_payload' => is_string($qrPayload) ? mb_substr($qrPayload, 0, 500) : null,
                    'expected_amount' => $amount,
                    'actual_amount_received' => $amount,
                    'courier_name' => $courierName,
                    'notes' => $notes,
                    'paid_by' => 'driver',
                    'settlement_label_km' => 'បានបង់ដោយអ្នកដឹកជា QR ('.$bankLabel.')',
                    'settlement_label_en' => 'Paid by driver via QR ('.$bankLabel.')',
                ],
            ];
        }

        if ($settlementMethod === self::CUSTOMER_DRIVER_QR) {
            $amount = round((float) $order->total, 2);

            return [
                'amount' => $amount,
                'currency' => 'USD',
                'channel' => 'customer_to_driver_qr',
                'channel_label' => 'Customer បង់ QR អ្នកដឹក / Customer paid the driver QR',
                'extra' => [
                    'cod_plan' => self::COLLECT_AT_DELIVERY_PLAN,
                    'qr_bank' => $qrBank,
                    'qr_bank_label' => $bankLabel,
                    'qr_account' => $qrAccount,
                    'qr_payload' => is_string($qrPayload) ? mb_substr($qrPayload, 0, 500) : null,
                    'expected_amount' => $amount,
                    'actual_amount_received' => $amount,
                    'courier_name' => $courierName,
                    'notes' => $notes,
                    'paid_by' => 'customer_to_driver',
                    'remittance_to_shop' => 'pending',
                    'settlement_label_km' => 'Customer បង់ QR អ្នកដឹក ('.$bankLabel.') — អ្នកដឹកនឹងបង់មកហាងផ្ទាល់',
                    'settlement_label_en' => 'Customer paid the driver QR ('.$bankLabel.') — driver remits to the shop',
                ],
            ];
        }

        $currency = $settlementMethod === 'cod_cash_khr' || strtoupper((string) ($meta['currency'] ?? '')) === 'KHR'
            ? 'KHR'
            : 'USD';
        if ($settlementMethod === self::DRIVER_CASH && isset($meta['currency'])) {
            $currency = strtoupper((string) $meta['currency']) === 'KHR' ? 'KHR' : 'USD';
        }

        $expectedAmount = $currency === 'KHR'
            ? $this->khrAmountForOrder($order)
            : round((float) $order->total, 2);
        $actualAmount = isset($meta['actual_amount_received'])
            ? ($currency === 'KHR'
                ? (int) round((float) $meta['actual_amount_received'])
                : round((float) $meta['actual_amount_received'], 2))
            : $expectedAmount;

        if ($settlementMethod === self::DRIVER_CASH) {
            return [
                'amount' => $actualAmount,
                'currency' => $currency,
                'channel' => 'driver_advance_cash',
                'channel_label' => 'Driver អោយជាលុយសុទ្ធ / Driver paid cash to the shop',
                'extra' => [
                    'cod_plan' => self::DRIVER_ADVANCE_PLAN,
                    'expected_amount' => $expectedAmount,
                    'actual_amount_received' => $actualAmount,
                    'courier_name' => $courierName,
                    'notes' => $notes,
                    'paid_by' => 'driver',
                    'settlement_label_km' => 'Driver អោយជាលុយសុទ្ធ ('.$currency.')',
                    'settlement_label_en' => 'Driver paid cash to the shop ('.$currency.')',
                ],
            ];
        }

        return [
            'amount' => $actualAmount,
            'currency' => $currency,
            'channel' => 'outdoor_cash',
            'channel_label' => 'លុយក្រៅ / Outdoor cash',
            'extra' => [
                'cod_plan' => $existingPlan,
                'expected_amount' => $expectedAmount,
                'actual_amount_received' => $actualAmount,
                'courier_name' => $courierName,
                'notes' => $notes,
            ],
        ];
    }

    private function pendingCodPayment(Order $order): Payment
    {
        $payment = Payment::where('order_id', $order->id)
            ->whereIn('status', ['pending'])
            ->latest('id')
            ->first();

        if ($payment) {
            return $payment;
        }

        return Payment::create([
            'order_id' => $order->id,
            'provider' => 'cod',
            'method' => 'cod',
            'amount' => $order->total,
            'currency' => 'USD',
            'status' => 'pending',
        ]);
    }

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    private function collectionMeta(
        string $channel,
        string $channelLabel,
        string $settlementMethod,
        string $currency,
        array $extra = [],
    ): array {
        $meta = array_merge([
            'collection_channel' => $channel,
            'collection_channel_label' => $channelLabel,
            'currency' => $currency,
            'settlement_method' => $settlementMethod,
        ], $extra);

        return array_filter(
            $meta,
            static fn ($value) => $value !== null && $value !== '',
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function sanitizeKhqrPayment(Payment $payment): array
    {
        return [
            'id' => $payment->id,
            'order_id' => $payment->order_id,
            'method' => $payment->method,
            'amount' => $this->encodedKhqrAmount($payment) ?: $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'bill_number' => $payment->bill_number,
            'md5' => $payment->md5,
            'qr_string' => $payment->qr_string,
            'expires_at' => optional($payment->expires_at)->toIso8601String(),
            'paid_at' => optional($payment->paid_at)->toIso8601String(),
        ];
    }

    private function encodedKhqrAmount(Payment $payment): ?int
    {
        $payload = is_array($payment->khqr_payload) ? $payment->khqr_payload : [];
        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
        $amount = $payload['amount'] ?? $raw['amount'] ?? null;
        if ($amount === null || $amount === '') {
            return null;
        }

        $n = (int) round((float) $amount);

        return $n > 0 ? $n : null;
    }

    /**
     * Flatten nested EMV TLV values from a KHQR payload.
     *
     * @return list<string>
     */
    private function emvValues(string $payload): array
    {
        $out = [];
        $i = 0;
        $len = strlen($payload);
        while ($i + 4 <= $len) {
            $id = substr($payload, $i, 2);
            $fieldLen = (int) substr($payload, $i + 2, 2);
            if ($id === '' || $fieldLen < 0 || $i + 4 + $fieldLen > $len) {
                break;
            }
            $value = substr($payload, $i + 4, $fieldLen);
            $out[] = $value;
            if (preg_match('/^\d{2,}/', $value) === 1 && strlen($value) >= 6) {
                array_push($out, ...$this->emvValues($value));
            }
            $i += 4 + $fieldLen;
        }

        return $out;
    }
}
