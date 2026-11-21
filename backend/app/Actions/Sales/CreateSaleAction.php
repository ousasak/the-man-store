<?php

namespace App\Actions\Sales;

use App\DTOs\Sales\SaleData;
use App\Models\Order;
use App\Models\OrderItem;
use App\Enums\OrderStatus;
use Illuminate\Support\Facades\DB;

class CreateSaleAction
{
    /**
     * Execute sale creation within a database transaction.
     */
    public function execute(SaleData $saleData): Order
    {
        return DB::transaction(function () use ($saleData) {
            $order = Order::create([
                'user_id'         => $saleData->customerId,
                'status'          => OrderStatus::PROCESSING->value,
                'subtotal'        => $saleData->subtotal,
                'discount_amount' => $saleData->discountAmount,
                'total_amount'    => $saleData->totalAmount,
                'payment_method'  => $saleData->paymentMethod,
                'notes'           => $saleData->notes,
                'branch_id'       => $saleData->branchId,
                'created_by'      => $saleData->cashierId,
            ]);

            foreach ($saleData->items as $item) {
                OrderItem::create([
                    'order_id'   => $order->id,
                    'product_id' => $item['product_id'],
                    'quantity'   => $item['quantity'],
                    'unit_price' => $item['unit_price'],
                    'total_price'=> $item['unit_price'] * $item['quantity'],
                    'imei_sn'    => $item['imei_sn'] ?? null,
                ]);
            }

            return $order->load('items');
        });
    }
}
