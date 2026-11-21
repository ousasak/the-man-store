<?php

namespace App\Http\Controllers\Api\V1\Cashier\POS;

use App\Http\Controllers\Api\BaseApiController;
use App\Actions\Sales\CreateSaleAction;
use App\DTOs\Sales\SaleData;
use App\Events\OrderPaidEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PosController extends BaseApiController
{
    public function sessionStatus(): JsonResponse
    {
        return $this->sendResponse([
            'is_open'     => true,
            'register_id' => 1,
            'opened_at'   => now()->toIso8601String(),
        ], 'POS register session active.');
    }

    public function checkout(Request $request, CreateSaleAction $createSaleAction): JsonResponse
    {
        $validated = $request->validate([
            'customer_id'    => 'nullable|integer',
            'items'          => 'required|array|min:1',
            'items.*.product_id' => 'required|integer',
            'items.*.quantity'   => 'required|numeric|min:1',
            'items.*.unit_price' => 'required|numeric|min:0',
            'payment_method' => 'required|string',
            'subtotal'       => 'required|numeric',
            'total_amount'   => 'required|numeric',
        ]);

        $saleData = SaleData::fromArray($validated);
        $order = $createSaleAction->execute($saleData);

        // Fire asynchronous background tasks (Telegram & PDF generation)
        OrderPaidEvent::dispatch($order);

        return $this->sendCreated($order, 'POS transaction completed successfully.');
    }
}
