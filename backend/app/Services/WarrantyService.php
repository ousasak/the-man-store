<?php

namespace App\Services;

use Carbon\Carbon;

class WarrantyService
{
    public function isWarrantyValid(?Carbon $purchaseDate, int $warrantyMonths): bool
    {
        if (!$purchaseDate) {
            return false;
        }

        return $purchaseDate->copy()->addMonths($warrantyMonths)->isFuture();
    }
}
