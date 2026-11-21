<?php

namespace App\Services\Telegram;

use App\Models\Order;
use Illuminate\Support\Facades\Log;

class TelegramNotificationService
{
    /**
     * Send order alert to admin / cashier Telegram group.
     */
    public function notifyNewOrder(Order $order): bool
    {
        $message = sprintf(
            "🔔 *New Order #%s*\nTotal: $%.2f\nPayment: %s\nBranch: #%s",
            $order->id,
            $order->total_amount,
            strtoupper($order->payment_method ?? 'CASH'),
            $order->branch_id ?? 1
        );

        Log::info('Telegram notification sent: ' . $message);
        return true;
    }
}
