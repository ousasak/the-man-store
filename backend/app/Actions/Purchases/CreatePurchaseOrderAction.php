<?php

namespace App\Actions\Purchases;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use Illuminate\Support\Facades\DB;

class CreatePurchaseOrderAction
{
    public function execute(array $poData): PurchaseOrder
    {
        return DB::transaction(function () use ($poData) {
            $po = PurchaseOrder::create([
                'po_number'    => $poData['po_number'] ?? 'PO-' . date('Ymd') . '-' . strtoupper(substr(uniqid(), -4)),
                'supplier_id'  => $poData['supplier_id'],
                'branch_id'    => $poData['branch_id'] ?? 1,
                'status'       => 'pending',
                'total_amount' => $poData['total_amount'] ?? 0,
                'notes'        => $poData['notes'] ?? null,
                'created_by'   => auth()->id(),
            ]);

            if (!empty($poData['items'])) {
                foreach ($poData['items'] as $item) {
                    PurchaseOrderItem::create([
                        'purchase_order_id' => $po->id,
                        'product_id'        => $item['product_id'],
                        'quantity'          => $item['quantity'],
                        'unit_cost'         => $item['unit_cost'],
                        'total_cost'        => $item['quantity'] * $item['unit_cost'],
                    ]);
                }
            }

            return $po->load('items');
        });
    }
}
