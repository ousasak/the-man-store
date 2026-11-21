<?php

namespace App\Jobs;

use App\Models\Order;
use App\Models\Payment;
use App\Services\RielpayPaymentService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class AutoConfirmKhqrPayment implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 1;

    public int $timeout = 60;

    public function __construct(public int $paymentId, public int $orderId)
    {
    }

    public function handle(RielpayPaymentService $rielpay): void
    {
        $payment = Payment::query()->find($this->paymentId);
        $order = Order::query()->find($this->orderId);
        if (! $payment || ! $order) {
            return;
        }

        if ($payment->status === 'paid' || $order->payment_status === 'paid') {
            return;
        }

        $rielpay->markPaid($payment, $order, [
            'auto_confirmed' => true,
            'confirmed_at' => now()->toIso8601String(),
        ]);
    }
}
