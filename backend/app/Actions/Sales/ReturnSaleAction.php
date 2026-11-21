<?php

namespace App\Actions\Sales;

use App\Models\Order;
use App\Enums\OrderStatus;
use Illuminate\Support\Facades\DB;

class ReturnSaleAction
{
    /**
     * Process return / refund for a sale order.
     */
    public function execute(Order $order, array $returnData): Order
    {
        return DB::transaction(function () use ($order, $returnData) {
            $reason = $returnData['reason'] ?? 'Customer return';

            $order->update([
                'status'       => OrderStatus::REFUNDED->value,
                'cancel_reason'=> $reason,
                'refunded_at'  => now(),
            ]);

            return $order;
        });
    }
}
