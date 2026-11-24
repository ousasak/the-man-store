<?php

namespace App\Services;

use App\Actions\Sales\CreateSaleAction;
use App\DTOs\Sales\SaleData;
use App\Models\Order;

class PosService
{
    public function __construct(
        protected CreateSaleAction $createSaleAction
    ) {}

    public function processCheckout(SaleData $saleData): Order
    {
        return $this->createSaleAction->execute($saleData);
    }
}
