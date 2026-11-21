<?php

namespace App\Services;

use App\Jobs\WatchKhqrPayment;
use App\Models\Order;
use App\Models\Payment;
use App\Support\KhqrEmv;
use Endroid\QrCode\Color\Color;
use Endroid\QrCode\Encoding\Encoding;
use Endroid\QrCode\QrCode;
use Endroid\QrCode\Writer\PngWriter;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Shop paper-invoice KHQR for drivers who do not use the Telegram bot.
 *
 * The printed EMV QR is converted to a static Bakong KHQR (no expiry). It
 * stays valid until the customer pays; once paid the sale is completed and
 * the same QR is no longer shown or accepted as an open bill.
 */
class InvoiceKhqrService
{
    public function __construct(
        private readonly RielpayPaymentService $rielpayPayments,
        private readonly CodCollectionService $codCollection,
    ) {
    }

    /**
     * @param  array<string, mixed>  $invoice
     * @return array<string, mixed>
     */
    public function attach(Order $order, array $invoice, bool $withImage = false): array
    {
        $isPaid = strtoupper((string) ($invoice['payment_status'] ?? '')) === 'PAID'
            || $order->payment_status === 'paid';

        if ($isPaid) {
            $invoice['payment_qr'] = [
                'status' => 'paid',
                'lifetime' => true,
            ];

            return $invoice;
        }

        try {
            $payment = $this->ensure($order);
        } catch (\Throwable $e) {
            Log::warning('Invoice KHQR could not be generated', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);
            $invoice['payment_qr'] = null;
            $invoice['payment_qr_error'] = $e->getMessage() ?: 'Could not generate payment QR.';

            return $invoice;
        }

        if (! $payment || ! filled($payment->qr_string)) {
            $invoice['payment_qr'] = null;

            return $invoice;
        }

        $khr = $this->displayedKhr($order, $payment);
        $usd = round((float) $order->total, 2);

        $invoice['payment_qr'] = [
            'status' => $payment->status === 'paid' ? 'paid' : 'pending',
            'lifetime' => true,
            'qr_string' => $payment->qr_string,
            'qr_image' => $withImage ? $this->pngDataUri((string) $payment->qr_string) : null,
            'amount' => $khr,
            'currency' => 'KHR',
            'usd_amount' => $usd,
            'bill_number' => $payment->bill_number,
            'amount_label' => number_format($khr).' ៛',
            'usd_label' => '$'.number_format($usd, 2),
        ];

        return $invoice;
    }

    public function ensure(Order $order): ?Payment
    {
        if ($order->payment_status === 'paid') {
            return Payment::query()
                ->where('order_id', $order->id)
                ->where('status', 'paid')
                ->latest('id')
                ->first();
        }

        $total = round((float) $order->total, 2);
        if ($total <= 0) {
            return null;
        }

        $khrAmount = $this->codCollection->khrAmountForOrder($order);

        $payment = DB::transaction(function () use ($order, $khrAmount) {
            $existing = Payment::query()
                ->where('order_id', $order->id)
                ->khqrProvider()
                ->where('method', Payment::METHOD_INVOICE_KHQR)
                ->whereNotNull('qr_string')
                ->whereIn('status', ['pending', 'expired'])
                ->lockForUpdate()
                ->latest('id')
                ->first();

            if ($existing) {
                return $this->keepPrintedQr($existing);
            }

            $meta = $this->invoiceMeta($order, $khrAmount);

            $payment = Payment::create([
                'order_id' => $order->id,
                'provider' => 'rielpay',
                'method' => Payment::METHOD_INVOICE_KHQR,
                'amount' => $khrAmount,
                'currency' => 'KHR',
                'status' => 'pending',
                'expires_at' => null,
                'raw_response' => $meta,
            ]);

            try {
                $result = $this->rielpayPayments->generate($order, $payment->fresh(), ['lifetime' => true]);
            } catch (\Throwable $e) {
                $payment->update(['status' => 'failed']);

                throw new RuntimeException($e->getMessage() ?: 'Failed to generate invoice KHQR.', 0, $e);
            }

            $payment->update([
                'bill_number' => $result['bill_number'],
                'md5' => $result['md5'],
                'khqr_payload' => $result['payload'],
                'qr_string' => $result['qr_string'],
                'expires_at' => null,
                'amount' => $result['khr_amount'] ?? $khrAmount,
                'currency' => 'KHR',
                'status' => 'pending',
                'raw_response' => array_merge($meta, $result['payload'] ?? [], [
                    'invoice_khqr' => true,
                    'lifetime' => true,
                    'rielpay_md5' => $result['gateway_md5'] ?? null,
                ]),
            ]);

            $fresh = $payment->fresh();
            $this->cancelDriverRemittanceQrs($order, (int) $fresh->id);

            return $fresh;
        });

        if ($payment && $payment->status === 'pending' && filled($payment->md5)) {
            WatchKhqrPayment::dispatch((int) $payment->id);
            $this->rielpayPayments->scheduleAutoConfirm($payment, $order);

            try {
                return $this->rielpayPayments->refreshStatus($payment, $order);
            } catch (\Throwable) {
                return $payment;
            }
        }

        return $payment;
    }

    private function keepPrintedQr(Payment $payment): Payment
    {
        $qr = (string) $payment->qr_string;
        $static = KhqrEmv::toStatic($qr);
        $md5 = md5($static);
        $needsFix = $static !== $qr
            || $payment->expires_at !== null
            || $payment->status !== 'pending'
            || strtolower((string) $payment->method) !== Payment::METHOD_INVOICE_KHQR
            || strtolower((string) $payment->md5) !== $md5;

        if (! $needsFix) {
            return $payment;
        }

        $raw = is_array($payment->raw_response) ? $payment->raw_response : [];

        $payment->update([
            'qr_string' => $static,
            'md5' => $md5,
            'expires_at' => null,
            'status' => 'pending',
            'method' => Payment::METHOD_INVOICE_KHQR,
            'raw_response' => array_merge($raw, [
                'invoice_khqr' => true,
                'lifetime' => true,
            ]),
        ]);

        return $payment->fresh() ?? $payment;
    }

    /**
     * Paper invoice is the customer-pay-shop path. Close driver remittance QRs
     * so two different live bills cannot be scanned for the same order.
     */
    private function cancelDriverRemittanceQrs(Order $order, int $keepPaymentId): void
    {
        Payment::query()
            ->where('order_id', $order->id)
            ->where('id', '!=', $keepPaymentId)
            ->khqrProvider()
            ->where('status', 'pending')
            ->where('method', 'cod_khqr')
            ->get()
            ->each(function (Payment $payment) {
                $raw = is_array($payment->raw_response) ? $payment->raw_response : [];
                $hidden = (bool) ($raw['hide_from_customer'] ?? false);
                $plan = (string) ($raw['cod_plan'] ?? '');
                if ($hidden || $plan === CodCollectionService::COLLECT_AT_DELIVERY_PLAN
                    || $plan === CodCollectionService::DRIVER_ADVANCE_PLAN) {
                    $payment->update(['status' => 'cancelled']);
                }
            });
    }

    /**
     * @return array<string, mixed>
     */
    private function invoiceMeta(Order $order, int $khrAmount): array
    {
        $isCod = strtolower((string) $order->payment_method) === 'cod';

        return array_filter([
            'invoice_khqr' => true,
            'lifetime' => true,
            'collection_channel' => 'paper_invoice',
            'collection_channel_label' => 'វិក័យបត្រក្រដាស — ស្កេន QR ហាង / Paper invoice KHQR',
            'settlement_method' => Payment::METHOD_INVOICE_KHQR,
            'currency' => 'KHR',
            'expected_amount' => $khrAmount,
            'paid_by' => 'customer',
            'scanned_by' => 'customer',
            'hide_from_customer' => false,
            'cod_plan' => $isCod ? CodCollectionService::CUSTOMER_PAYS_SHOP_PLAN : null,
            'settlement_label_km' => 'Customer បង់ QR លើវិក័យបត្រក្រដាស',
            'settlement_label_en' => 'Customer paid the paper invoice KHQR',
        ], static fn ($value) => $value !== null && $value !== '');
    }

    private function displayedKhr(Order $order, Payment $payment): int
    {
        $amount = (int) round((float) $payment->amount);
        if (strtoupper((string) $payment->currency) === 'KHR' && $amount >= 1) {
            return $amount;
        }

        return $this->codCollection->khrAmountForOrder($order);
    }

    public function pngDataUri(string $payload): ?string
    {
        $payload = trim($payload);
        if ($payload === '') {
            return null;
        }

        $writer = new PngWriter();
        $qrCode = QrCode::create($payload)
            ->setEncoding(new Encoding('UTF-8'))
            ->setSize(280)
            ->setMargin(8)
            ->setForegroundColor(new Color(0, 0, 0))
            ->setBackgroundColor(new Color(255, 255, 255));

        $result = $writer->write($qrCode);

        return 'data:'.$result->getMimeType().';base64,'.base64_encode($result->getString());
    }
}
