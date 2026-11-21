<?php

namespace App\Jobs;

use App\Models\Payment;
use App\Services\RielpayPaymentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class WatchKhqrPayment implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 45;

    public function __construct(public int $paymentId, public int $attempt = 1)
    {
    }

    public function handle(RielpayPaymentService $rielpay): void
    {
        $payment = Payment::query()->with('order')->find($this->paymentId);
        if (! $payment || ! $payment->order) {
            return;
        }

        if (in_array($payment->status, ['paid', 'failed', 'cancelled'], true)
            || $payment->order->payment_status === 'paid') {
            if ($payment->status === 'paid' || $payment->order->payment_status === 'paid') {
                app(\App\Services\TelegramService::class)->notifyOrderPaid(
                    $payment->order->fresh(['user', 'items', 'shipment'])
                );
            }

            return;
        }

        try {
            $payment = $rielpay->refreshStatus($payment, $payment->order);
        } catch (\Throwable $e) {
            Log::warning('KHQR watch poll failed', [
                'payment_id' => $this->paymentId,
                'error' => $e->getMessage(),
            ]);
        }

        if (in_array($payment->status, ['paid', 'failed', 'cancelled'], true)) {
            if ($payment->status === 'paid' || $payment->order?->fresh()?->payment_status === 'paid') {
                app(\App\Services\TelegramService::class)->notifyOrderPaid(
                    $payment->order->fresh(['user', 'items', 'shipment'])
                );
            }

            return;
        }

        if ($this->attempt >= 90) {
            return;
        }

        self::dispatch($this->paymentId, $this->attempt + 1)->delay(now()->addSeconds(5));
    }
}
