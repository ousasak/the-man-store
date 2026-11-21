<?php

namespace App\Actions\Purchases;

use App\Models\PurchaseOrder;
use App\Models\InventoryLot;
use Illuminate\Support\Facades\DB;

class ReceivePurchaseOrderAction
{
    public function execute(PurchaseOrder $po, array $receivedItems): PurchaseOrder
    {
        return DB::transaction(function () use ($po, $receivedItems) {
            foreach ($receivedItems as $item) {
                InventoryLot::create([
                    'product_id'    => $item['product_id'],
                    'supplier_id'   => $po->supplier_id,
                    'branch_id'     => $po->branch_id,
                    'lot_number'    => 'LOT-PO-' . $po->id . '-' . $item['product_id'],
                    'cost_price'    => $item['unit_cost'],
                    'quantity'      => $item['quantity'],
                    'remaining_qty' => $item['quantity'],
                    'status'        => 'in_stock',
                    'received_at'   => now(),
                ]);
            }

            $po->update([
                'status'      => 'received',
                'received_at' => now(),
            ]);

            return $po;
        });
    }
}
