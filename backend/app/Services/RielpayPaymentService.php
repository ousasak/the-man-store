<?php

namespace App\Services;

use App\Jobs\AutoConfirmKhqrPayment;
use App\Models\Cart;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Setting;
use App\Services\PaidOrderInventory;
use App\Support\KhqrEmv;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class RielpayPaymentService
{
    public function __construct(
        private readonly RielpayApi $rielpay,
        private readonly BakongNbcApi $bakongNbc,
    ) {
    }

    /**
     * @param  array{lifetime?: bool}  $options
     * @return array{bill_number: string, md5: string, qr_string: string, expires_at: Carbon|null, payload: array<string, mixed>, gateway_md5?: string}
     */
    public function generate(Order $order, Payment $payment, array $options = []): array
    {
        $lifetime = (bool) ($options['lifetime'] ?? $payment->isLifetimeInvoiceKhqr());
        $currency = strtoupper($payment->currency ?: (string) config('services.rielpay.currency', 'KHR'));
        $amount = $this->resolveAmount($order, $payment, $currency);

        if ($amount <= 0) {
            throw new RuntimeException(
                'Payment amount must be greater than zero. Order total: $'
                . number_format((float) ($payment->amount ?: $order->total ?: 0), 2)
                . ' USD.'
            );
        }

        $billNumber = $payment->bill_number ?: $this->makeBillNumber($order, $payment);
        $billNumber = $this->ensureUniqueBillNumber($billNumber, $payment->id);
        $billNumber = Str::limit($billNumber, 35, '');

        $usdAmount = $this->resolveUsdAmount($order, $payment, $currency, $amount);

        $payload = [
            'amount' => $amount,
            'currency' => $currency,
            'bill_number' => $billNumber,
            'metadata' => [
                'order_id' => $order->id,
                'order_number' => $order->order_number,
                'payment_id' => $payment->id,
                'usd_amount' => $usdAmount,
                'lifetime' => $lifetime,
            ],
        ];

        $response = $this->createPaymentWithBillRetry($payload, $order, $payment);

        $qrString = (string) ($response['qr_string'] ?? '');
        $md5 = (string) ($response['md5'] ?? '');
        $responseBill = (string) ($response['bill_number'] ?? $billNumber);

        if ($qrString === '' || $md5 === '') {
            throw new RuntimeException('Rielpay did not return QR data.');
        }

        $gatewayMd5 = $md5;
        $expiresAt = $lifetime ? null : $this->parseExpiresAt($response['expires_at'] ?? null);

        if ($lifetime) {
            $qrString = KhqrEmv::toStatic($qrString);
            $md5 = md5($qrString);
            $response['qr_string'] = $qrString;
            $response['md5'] = $md5;
            $response['gateway_md5'] = $gatewayMd5;
            $response['lifetime'] = true;
            $response['invoice_khqr'] = true;
        }

        $this->scheduleAutoConfirm($payment, $order);

        return [
            'bill_number' => $responseBill,
            'md5' => $md5,
            'qr_string' => $qrString,
            'expires_at' => $expiresAt,
            'payload' => $response,
            'khr_amount' => $currency === 'KHR' ? (int) $amount : null,
            'usd_amount' => $usdAmount,
            'gateway_md5' => $gatewayMd5,
        ];
    }

    /**
     * After Generate KHQR, mark the payment paid in 10 seconds even if not scanned yet.
     */
    public function scheduleAutoConfirm(Payment|int $payment, Order|int $order): void
    {
        $paymentId = $payment instanceof Payment ? (int) $payment->id : (int) $payment;
        $orderId = $order instanceof Order ? (int) $order->id : (int) $order;
        if ($paymentId <= 0 || $orderId <= 0) {
            return;
        }

        AutoConfirmKhqrPayment::dispatch($paymentId, $orderId)->delay(now()->addSeconds(10));
    }

    public function getExchangeRate(): int
    {
        $rate = (int) (Setting::where('key', 'usd_khr_exchange_rate')->value('value') ?? 4100);

        return max(1, $rate);
    }

    public function khrAmountForOrder(Order $order): int
    {
        return (int) round((float) $order->total * $this->getExchangeRate());
    }

    public function refreshStatus(Payment $payment, Order $order): Payment
    {
        if (in_array($payment->status, ['paid', 'failed', 'cancelled'], true)) {
            return $payment;
        }

        $gatewayReached = false;

        if (filled($payment->md5) || filled($payment->bill_number)) {
            try {
                $response = $this->fetchGatewayStatus($payment);
                $gatewayReached = true;
                $status = $this->gatewayStatus($response);

                if ($status === 'paid') {
                    $this->markPaid($payment, $order, $response);

                    return $payment->fresh();
                }

                if (in_array($status, ['expired', 'failed', 'cancelled'], true)) {
                    $this->markUnsuccessful($payment, $order, $response, $status);

                    return $payment->fresh();
                }

                $payment->update([
                    'raw_response' => array_merge($payment->raw_response ?? [], [
                        'rielpay_check' => $response,
                    ]),
                ]);
            } catch (\Throwable $e) {
                Log::warning('Rielpay status check failed', [
                    'payment_id' => $payment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if ($this->confirmPaidViaNbc($payment, $order)) {
            return $payment->fresh();
        }

        $fresh = $payment->fresh() ?? $payment;
        $nbc = is_array($fresh->raw_response['bakong_nbc'] ?? null) ? $fresh->raw_response['bakong_nbc'] : [];
        $nbcCannotConfirm = $nbc !== [] && $this->bakongNbc->isUnauthorized($nbc);

        if ($fresh->isLifetimeInvoiceKhqr()) {
            if (in_array($fresh->status, ['expired', 'failed'], true)) {
                $fresh->update([
                    'status' => 'pending',
                    'expires_at' => null,
                ]);
            }

            return $payment->fresh();
        }

        // Do not expire locally if Bakong could not confirm — the driver may have paid.
        if (
            $gatewayReached
            && ! $nbcCannotConfirm
            && $fresh->status === 'pending'
            && $fresh->expires_at
            && now()->greaterThan($fresh->expires_at)
        ) {
            $fresh->update(['status' => 'expired']);
            app(TelegramService::class)->notifyPaymentFailed($order, $fresh, 'expired');
        }

        return $payment->fresh();
    }

    public function refreshOrderKhqr(Order $order): ?Payment
    {
        $payment = Payment::query()
            ->khqrProvider()
            ->where('order_id', $order->id)
            ->whereNotNull('md5')
            ->whereNotIn('status', ['failed', 'cancelled'])
            ->orderByRaw('CASE WHEN method = ? THEN 0 ELSE 1 END', [Payment::METHOD_INVOICE_KHQR])
            ->latest('id')
            ->first();

        if (! $payment) {
            return null;
        }

        if ($payment->status === 'paid' || $order->payment_status === 'paid') {
            return $payment;
        }

        return $this->refreshStatus($payment, $order);
    }

    /**
     * Ask Rielpay about recent unpaid KHQR scans. Safe to call often (cache-locked).
     */
    public function pollPendingKhqr(int $limit = 30): int
    {
        $lock = Cache::lock('khqr:poll-pending', 25);
        if (! $lock->get()) {
            return 0;
        }

        try {
            $payments = Payment::query()
                ->khqrProvider()
                ->whereNotNull('md5')
                ->where(function ($query) {
                    $query->where('status', 'pending')
                        ->orWhere(function ($inner) {
                            $inner->where('status', 'expired')
                                ->where(function ($keep) {
                                    $keep->where('updated_at', '>=', now()->subHours(6))
                                        ->orWhere('method', Payment::METHOD_INVOICE_KHQR)
                                        ->orWhereNull('expires_at');
                                });
                        });
                })
                ->with('order')
                ->orderByRaw('CASE WHEN method = ? THEN 0 WHEN expires_at IS NULL THEN 1 ELSE 2 END', [Payment::METHOD_INVOICE_KHQR])
                ->orderByDesc('id')
                ->limit($limit)
                ->get();

            $paid = 0;
            foreach ($payments as $payment) {
                $order = $payment->order;
                if (! $order) {
                    continue;
                }

                if ($order->payment_status === 'paid' || $payment->status === 'paid') {
                    app(TelegramService::class)->notifyOrderPaid($order->fresh(['user', 'items', 'shipment']));
                    $paid++;

                    continue;
                }

                try {
                    $fresh = $this->refreshStatus($payment, $order);
                    if ($fresh->status === 'paid' || $fresh->order?->fresh()?->payment_status === 'paid') {
                        $paid++;
                    }
                } catch (\Throwable $e) {
                    Log::warning('KHQR pending poll failed', [
                        'payment_id' => $payment->id,
                        'error' => $e->getMessage(),
                    ]);
                }
            }

            return $paid;
        } finally {
            optional($lock)->release();
        }
    }

    public function syncUserKhqr(?int $userId): void
    {
        if (! $userId || $userId <= 0) {
            return;
        }

        $payments = Payment::query()
            ->khqrProvider()
            ->whereNotNull('md5')
            ->whereIn('status', ['pending', 'expired'])
            ->whereHas('order', fn ($query) => $query->where('user_id', $userId))
            ->with('order')
            ->latest('id')
            ->limit(5)
            ->get();

        foreach ($payments as $payment) {
            if (! $payment->order) {
                continue;
            }

            try {
                $this->refreshStatus($payment, $payment->order);
            } catch (\Throwable $e) {
                Log::warning('KHQR user sync failed', [
                    'payment_id' => $payment->id,
                    'user_id' => $userId,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $recentPaid = Order::query()
            ->where('user_id', $userId)
            ->where('payment_status', 'paid')
            ->where('payment_method', 'bakong_khqr')
            ->where('updated_at', '>=', now()->subHours(12))
            ->with(['user', 'items', 'shipment'])
            ->latest('id')
            ->limit(3)
            ->get();

        foreach ($recentPaid as $order) {
            app(TelegramService::class)->notifyOrderPaid($order);
        }
    }

    /**
     * Poll Bakong after Telegram already got 200 OK (no queue worker required).
     */
    public function watchUntilPaid(int $paymentId, int $attempts = 60, int $sleepSeconds = 5): void
    {
        for ($i = 0; $i < $attempts; $i++) {
            if ($i > 0) {
                sleep($sleepSeconds);
            }

            $payment = Payment::query()->with('order')->find($paymentId);
            if (! $payment || ! $payment->order) {
                return;
            }

            if ($payment->status === 'paid' || $payment->order->payment_status === 'paid') {
                app(TelegramService::class)->notifyOrderPaid($payment->order->fresh(['user', 'items', 'shipment']));

                return;
            }

            if (in_array($payment->status, ['failed', 'cancelled'], true)) {
                return;
            }

            try {
                $payment = $this->refreshStatus($payment, $payment->order);
            } catch (\Throwable $e) {
                Log::warning('KHQR watchUntilPaid failed', [
                    'payment_id' => $paymentId,
                    'error' => $e->getMessage(),
                ]);
            }

            if ($payment->status === 'paid' || $payment->order?->fresh()?->payment_status === 'paid') {
                app(TelegramService::class)->notifyOrderPaid(
                    $payment->order()->with(['user', 'items', 'shipment'])->first() ?? $payment->order
                );

                return;
            }
        }
    }

    /**
     * @param  array<string, mixed>  $response
     */
    public function gatewayStatus(array $response): string
    {
        if ($this->responseLooksPaid($response)) {
            return 'paid';
        }

        $nested = data_get($response, 'data.status')
            ?? data_get($response, 'payment.status')
            ?? data_get($response, 'data.payment_status')
            ?? data_get($response, 'payment_status');

        $top = $response['status'] ?? null;
        $topStatus = is_string($top) || is_int($top) ? strtolower(trim((string) $top)) : '';

        // API wrappers often use status=success/ok for the HTTP result, not the payment.
        if (in_array($topStatus, ['ok', 'success', 'successful'], true) && filled($nested)) {
            $raw = $nested;
        } else {
            $raw = $nested ?? $top ?? 'pending';
        }

        $status = strtolower(trim((string) $raw));

        if (in_array($status, ['paid', 'success', 'successful', 'completed', 'complete', 'settled', 'done', '1'], true)) {
            return 'paid';
        }

        if (in_array($status, ['expired', 'expire', 'timeout'], true)) {
            return 'expired';
        }

        if (! in_array($status, ['pending', 'unpaid', 'waiting', 'processing', 'created', 'ok', ''], true)) {
            Log::info('Rielpay unrecognized payment status', [
                'status' => $status,
                'keys' => array_keys($response),
            ]);
        }

        return in_array($status, ['ok', ''], true) ? 'pending' : $status;
    }

    /**
     * @param  array<string, mixed>  $response
     */
    public function markPaid(Payment $payment, Order $order, array $response): void
    {
        DB::transaction(function () use ($payment, $order, $response) {
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $lockedPayment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();

            if ($lockedPayment->status === 'paid') {
                return;
            }

            $paidAt = $this->parsePaidAt($response['paid_at'] ?? null);

            $lockedPayment->update([
                'status' => 'paid',
                'paid_at' => $paidAt ?? now(),
                'raw_response' => array_merge($lockedPayment->raw_response ?? [], $response, [
                    'invoice_khqr_closed' => $lockedPayment->isLifetimeInvoiceKhqr(),
                ]),
            ]);

            if ($lockedPayment->method === 'cod_khqr') {
                app(CodCollectionService::class)->annotatePaidShopKhqr($lockedPayment->fresh(), $response);
            }

            if ($lockedOrder->payment_status !== 'paid') {
                $orderUpdate = ['payment_status' => 'paid'];
                if ($lockedOrder->payment_method !== 'cod') {
                    $orderUpdate['status'] = 'processing';
                } else {
                    $orderUpdate['status'] = 'completed';
                }
                $lockedOrder->update($orderUpdate);

                $this->clearUserCart((int) $lockedOrder->user_id);

                $lockedOrder->load('items.product');
                PaidOrderInventory::applyForOrder($lockedOrder);
            }
        });

        DB::afterCommit(function () use ($order) {
            $fresh = Order::query()->with(['user', 'items', 'shipment', 'payments'])->find($order->id);
            if ($fresh && $fresh->payment_status === 'paid') {
                app(TelegramService::class)->notifyOrderPaid($fresh);
            }
        });
    }

    /**
     * Mark the payment as a terminal unsuccessful result and alert staff once.
     *
     * @param  array<string, mixed>  $response
     */
    private function markUnsuccessful(Payment $payment, Order $order, array $response, string $status): void
    {
        $status = in_array($status, ['expired', 'cancelled'], true) ? $status : 'failed';

        DB::transaction(function () use ($payment, $response, $status) {
            $lockedPayment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();

            if (in_array($lockedPayment->status, ['paid', 'failed', 'cancelled'], true)) {
                return;
            }

            $lockedPayment->update([
                'status' => $status,
                'raw_response' => array_merge($lockedPayment->raw_response ?? [], [
                    'rielpay_check' => $response,
                    'terminal_status' => $status,
                ]),
            ]);
        });

        DB::afterCommit(function () use ($order, $payment, $status) {
            $freshOrder = Order::query()->with(['user', 'items', 'shipment', 'payments'])->find($order->id) ?? $order;
            $freshPayment = Payment::query()->find($payment->id) ?? $payment;
            app(TelegramService::class)->notifyPaymentFailed($freshOrder, $freshPayment, $status);
        });
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchGatewayStatus(Payment $payment): array
    {
        $errors = [];

        if (filled($payment->md5)) {
            try {
                return $this->rielpay->checkPayment((string) $payment->md5);
            } catch (\Throwable $e) {
                $errors[] = $e->getMessage();
                if ($this->isUnreachableError($e) && ! filled($payment->bill_number) && ! $this->rielpayPaymentId($payment)) {
                    throw $e;
                }
                Log::warning('Rielpay check failed, falling back to GET', [
                    'payment_id' => $payment->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $gatewayMd5 = (string) (data_get($payment->raw_response, 'gateway_md5')
            ?? data_get($payment->raw_response, 'rielpay_md5')
            ?? '');
        if ($gatewayMd5 !== '' && strtolower($gatewayMd5) !== strtolower((string) $payment->md5)) {
            try {
                return $this->rielpay->checkPayment($gatewayMd5);
            } catch (\Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        if (filled($payment->bill_number)) {
            try {
                return $this->rielpay->getPayment((string) $payment->bill_number);
            } catch (\Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        $rielpayId = $this->rielpayPaymentId($payment);
        if ($rielpayId) {
            return $this->rielpay->getPayment((string) $rielpayId);
        }

        throw new RuntimeException($errors[0] ?? 'Payment has no md5 or bill number to check.');
    }

    private function rielpayPaymentId(Payment $payment): ?int
    {
        $id = data_get($payment->raw_response, 'id')
            ?? data_get($payment->raw_response, 'rielpay_check.id')
            ?? data_get($payment->khqr_payload, 'id');

        return is_numeric($id) ? (int) $id : null;
    }

    private function confirmPaidViaNbc(Payment $payment, Order $order): bool
    {
        if (! filled($payment->md5) || ! $this->bakongNbc->isConfigured()) {
            return false;
        }

        try {
            $nbc = $this->bakongNbc->checkByMd5((string) $payment->md5);
        } catch (\Throwable $e) {
            Log::warning('NBC Bakong status check failed', [
                'payment_id' => $payment->id,
                'error' => $e->getMessage(),
            ]);

            return false;
        }

        $payment->update([
            'raw_response' => array_merge($payment->raw_response ?? [], [
                'bakong_nbc' => $nbc,
            ]),
        ]);

        if (! $this->bakongNbc->looksPaid($nbc) && $this->gatewayStatus($nbc) !== 'paid') {
            return false;
        }

        $this->markPaid($payment->fresh() ?? $payment, $order, ['bakong_nbc' => $nbc]);

        return true;
    }

    private function isUnreachableError(\Throwable $e): bool
    {
        $message = strtolower($e->getMessage());

        return str_contains($message, 'unreachable')
            || str_contains($message, 'temporarily unavailable')
            || str_contains($message, 'connection failed')
            || str_contains($message, 'http 502')
            || str_contains($message, 'http 503')
            || str_contains($message, 'http 530');
    }

    /**
     * @param  array<string, mixed>  $response
     */
    private function responseLooksPaid(array $response): bool
    {
        foreach (['paid', 'is_paid'] as $flag) {
            $value = $response[$flag] ?? data_get($response, 'data.'.$flag);
            if ($value === true || $value === 1 || $value === '1' || $value === 'true') {
                return true;
            }
        }

        if (filled($response['paid_at'] ?? data_get($response, 'data.paid_at'))) {
            return true;
        }

        $code = $response['responseCode'] ?? data_get($response, 'data.responseCode');
        $data = is_array($response['data'] ?? null) ? $response['data'] : [];
        if ($code !== null && (int) $code === 0 && (
            filled($data['hash'] ?? null)
            || filled($data['fromAccountId'] ?? null)
            || filled($data['acknowledgedDateMs'] ?? null)
        )) {
            return true;
        }

        foreach (['bakong_nbc', 'bakong', 'nbc', 'rielpay_check'] as $nestedKey) {
            $nested = $response[$nestedKey] ?? null;
            if (is_array($nested) && $nested !== $response && $this->responseLooksPaid($nested)) {
                return true;
            }
        }

        return false;
    }

    private function parseExpiresAt(mixed $value): Carbon
    {
        if (filled($value)) {
            try {
                return Carbon::parse($value);
            } catch (\Throwable) {
                // fall through
            }
        }

        return now()->addSeconds((int) config('services.rielpay.expires_in', 300));
    }

    private function parsePaidAt(mixed $value): ?Carbon
    {
        if (! filled($value)) {
            return null;
        }

        try {
            return Carbon::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function makeBillNumber(Order $order, ?Payment $payment = null, bool $fresh = false): string
    {
        $base = $order->order_number
            ?: 'FS-' . now()->format('Ymd') . '-' . Str::upper(Str::random(6));

        if ($payment?->id) {
            $base .= '-P' . $payment->id;
        }

        if ($fresh) {
            $base .= '-' . Str::upper(Str::random(4));
        }

        return Str::limit($base, 31, '');
    }

    private function ensureUniqueBillNumber(string $base, ?int $paymentId = null): string
    {
        $candidate = $base;

        while (
            Payment::where('bill_number', $candidate)
                ->when($paymentId, fn ($q) => $q->where('id', '!=', $paymentId))
                ->exists()
        ) {
            $candidate = Str::limit($base . '-' . Str::upper(Str::random(3)), 35, '');
        }

        return Str::limit($candidate, 35, '');
    }

    private function clearUserCart(int $userId): void
    {
        $cart = Cart::with('items')->where('user_id', $userId)->first();
        if ($cart) {
            $cart->items()->delete();
        }
    }

    /**
     * KHQR is billed in KHR.
     * COD shop QR may be goods-only (២ក remittance) — honor payment.amount
     * when it is already riel. Online checkout still uses the order USD total.
     */
    private function resolveAmount(Order $order, Payment $payment, string $currency): float|int
    {
        $usdTotal = round((float) $order->total, 2);
        $paymentAmount = (float) ($payment->amount ?: 0);
        $paymentCurrency = strtoupper((string) ($payment->currency ?: ''));
        $isCodKhqr = strtolower((string) $payment->method) === 'cod_khqr';
        $isInvoiceKhqr = strtolower((string) $payment->method) === Payment::METHOD_INVOICE_KHQR;

        if ($currency === 'KHR') {
            if (($isCodKhqr || $isInvoiceKhqr) && $paymentCurrency === 'KHR' && $paymentAmount >= 1) {
                return (int) round($paymentAmount);
            }

            if ($usdTotal > 0) {
                return max(0, (int) round($usdTotal * $this->getExchangeRate()));
            }

            if ($paymentCurrency === 'KHR' && $paymentAmount >= 1) {
                return (int) round($paymentAmount);
            }

            return max(0, (int) round($paymentAmount * $this->getExchangeRate()));
        }

        return round($usdTotal > 0 ? $usdTotal : $paymentAmount, 2);
    }

    private function resolveUsdAmount(Order $order, Payment $payment, string $currency, float|int $resolvedAmount): float
    {
        $paymentAmount = (float) ($payment->amount ?: 0);
        $paymentCurrency = strtoupper((string) ($payment->currency ?: ''));

        $method = strtolower((string) $payment->method);
        if (in_array($method, ['cod_khqr', Payment::METHOD_INVOICE_KHQR], true) && $currency === 'KHR') {
            return round((float) $resolvedAmount / max(1, $this->getExchangeRate()), 2);
        }

        if ($paymentCurrency === 'KHR' && $paymentAmount >= 1) {
            return round($paymentAmount / max(1, $this->getExchangeRate()), 2);
        }

        return round((float) ($paymentAmount ?: $order->total ?: 0), 2);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function createPaymentWithBillRetry(array $payload, Order $order, Payment $payment): array
    {
        try {
            return $this->rielpay->createPayment($payload);
        } catch (RuntimeException $e) {
            if (! $this->isDuplicateBillError($e)) {
                throw $e;
            }

            $billNumber = $this->makeBillNumber($order, $payment, true);
            $billNumber = $this->ensureUniqueBillNumber($billNumber, $payment->id);
            $billNumber = Str::limit($billNumber, 35, '');
            $payload['bill_number'] = $billNumber;

            return $this->rielpay->createPayment($payload);
        }
    }

    private function isDuplicateBillError(RuntimeException $e): bool
    {
        $message = strtolower($e->getMessage());

        return str_contains($message, 'bill')
            && (
                str_contains($message, 'taken')
                || str_contains($message, 'duplicate')
                || str_contains($message, 'already')
                || str_contains($message, 'exists')
            );
    }
}
