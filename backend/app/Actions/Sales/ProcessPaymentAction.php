<?php

namespace App\Actions\Sales;

use App\Models\Order;
use App\Models\Payment;
use App\Enums\PaymentStatus;
use App\Enums\OrderStatus;
use App\Events\OrderPaidEvent;
use Illuminate\Support\Facades\DB;

class ProcessPaymentAction
{
    /**
     * Process payment for an existing sale order.
     */
    public function execute(Order $order, array $paymentDetails): Payment
    {
        $payment = DB::transaction(function () use ($order, $paymentDetails) {
            $amount = (float) ($paymentDetails['amount'] ?? $order->total_amount);
            $method = $paymentDetails['method'] ?? 'cash';

            $payment = Payment::create([
                'order_id'       => $order->id,
                'user_id'        => $order->user_id,
                'payment_method' => $method,
                'amount'         => $amount,
                'status'         => PaymentStatus::PAID->value,
                'transaction_id' => $paymentDetails['transaction_id'] ?? 'TXN-' . strtoupper(uniqid()),
                'payload'        => $paymentDetails['payload'] ?? null,
            ]);

            $order->update([
                'status'         => OrderStatus::COMPLETED->value,
                'payment_status' => PaymentStatus::PAID->value,
            ]);

            return $payment;
        });

        // Dispatch asynchronous tasks: Telegram notification & Invoice PDF generation
        OrderPaidEvent::dispatch($order);

        return $payment;
    }
}
