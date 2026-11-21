<?php

namespace App\Actions\Inventory;

use App\DTOs\Inventory\ImeiDeviceData;
use App\Models\InventoryLot;
use Illuminate\Support\Facades\DB;

class RegisterImeiDeviceAction
{
    /**
     * Register an IMEI-serialized phone / device into inventory.
     */
    public function execute(ImeiDeviceData $deviceData): InventoryLot
    {
        return DB::transaction(function () use ($deviceData) {
            return InventoryLot::create([
                'product_id'    => $deviceData->productId,
                'lot_number'    => 'IMEI-' . $deviceData->imei,
                'imei'          => $deviceData->imei,
                'serial_number' => $deviceData->serialNumber,
                'condition'     => $deviceData->condition->value,
                'cost_price'    => $deviceData->costPrice,
                'selling_price' => $deviceData->sellingPrice,
                'quantity'      => 1,
                'remaining_qty' => 1,
                'status'        => 'in_stock',
                'branch_id'     => $deviceData->branchId,
                'supplier_id'   => $deviceData->supplierId,
                'notes'         => $deviceData->notes,
                'received_at'   => now(),
            ]);
        });
    }
}
