<?php

namespace App\Actions\Inventory;

use App\Models\InventoryLot;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class TransferStockAction
{
    /**
     * Transfer stock between branches or locations.
     */
    public function execute(int $inventoryLotId, int $targetBranchId, int $quantity = 1): InventoryLot
    {
        return DB::transaction(function () use ($inventoryLotId, $targetBranchId, $quantity) {
            $sourceLot = InventoryLot::lockForUpdate()->findOrFail($inventoryLotId);

            if ($sourceLot->remaining_qty < $quantity) {
                throw new InvalidArgumentException("Insufficient quantity to transfer.");
            }

            // Deduct from source
            $sourceLot->decrement('remaining_qty', $quantity);

            // Replicate or allocate to destination branch
            $targetLot = $sourceLot->replicate();
            $targetLot->branch_id = $targetBranchId;
            $targetLot->quantity = $quantity;
            $targetLot->remaining_qty = $quantity;
            $targetLot->lot_number = $sourceLot->lot_number . '-TRF-' . $targetBranchId;
            $targetLot->save();

            return $targetLot;
        });
    }
}
