<?php

namespace App\Actions\Inventory;

use App\Models\InventoryLot;
use Illuminate\Support\Facades\DB;

class RegisterDeviceAction
{
    /**
     * Register a serialized device / device IMEI or Lot in inventory.
     */
    public function execute(array $deviceData): InventoryLot
    {
        return DB::transaction(function () use ($deviceData) {
            return InventoryLot::create([
                'product_id'       => $deviceData['product_id'],
                'lot_number'       => $deviceData['lot_number'] ?? 'LOT-' . strtoupper(uniqid()),
                'imei'             => $deviceData['imei'] ?? null,
                'serial_number'    => $deviceData['serial_number'] ?? null,
                'supplier_id'      => $deviceData['supplier_id'] ?? null,
                'cost_price'       => $deviceData['cost_price'] ?? 0,
                'selling_price'    => $deviceData['selling_price'] ?? 0,
                'quantity'         => $deviceData['quantity'] ?? 1,
                'remaining_qty'    => $deviceData['quantity'] ?? 1,
                'status'           => $deviceData['status'] ?? 'in_stock',
                'branch_id'        => $deviceData['branch_id'] ?? 1,
                'received_at'      => now(),
            ]);
        });
    }
}
