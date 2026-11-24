<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\Order;
use App\Enums\PaymentStatus;
use App\Events\OrderPaidEvent;

class BakongKhqrPaymentService
{
    /**
     * Generate Bakong KHQR payload for an order.
     */
    public function generateKhqrPayload(Order $order): array
    {
        $currency = 'USD';
        $amount = (float) $order->total_amount;
        $md5 = md5($order->id . $amount . config('app.key'));

        return [
            'order_id'    => $order->id,
            'qr_string'   => '00020101021229370016bakong@nbc.org.kh52045999530384054' . sprintf('%0.2f', $amount) . '5802KH5912FIT_AND_SLEEK6010PHNOM_PENH6304' . substr($md5, 0, 4),
            'md5'         => $md5,
            'amount'      => $amount,
            'currency'    => $currency,
        ];
    }

    /**
     * Mark an order as paid after successful KHQR webhook / verification.
     */
    public function confirmPayment(Order $order, string $txnHash): Payment
    {
        $payment = Payment::create([
            'order_id'       => $order->id,
            'user_id'        => $order->user_id,
            'payment_method' => 'khqr',
            'amount'         => $order->total_amount,
            'status'         => PaymentStatus::PAID->value,
            'transaction_id' => $txnHash,
        ]);

        OrderPaidEvent::dispatch($order);

        return $payment;
    }
}
