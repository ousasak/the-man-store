<?php

namespace App\Services\Pricing;

use App\Models\Discount;

class DiscountCalculationService
{
    public function calculateFinalTotal(float $subtotal, ?Discount $discount, float $taxRate = 0.0): array
    {
        $discountAmount = 0.0;

        if ($discount && $discount->isValidNow()) {
            if ($discount->type === 'percentage') {
                $discountAmount = ($subtotal * $discount->value) / 100;
            } else {
                $discountAmount = min($subtotal, (float) $discount->value);
            }
        }

        $taxableAmount = max(0.0, $subtotal - $discountAmount);
        $taxAmount = ($taxableAmount * $taxRate) / 100;
        $total = $taxableAmount + $taxAmount;

        return [
            'subtotal'        => round($subtotal, 2),
            'discount_amount' => round($discountAmount, 2),
            'tax_amount'      => round($taxAmount, 2),
            'total_amount'    => round($total, 2),
        ];
    }
}
