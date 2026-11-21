<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidImeiRule implements ValidationRule
{
    /**
     * Validate 15-digit IMEI number with Luhn algorithm check.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $imei = preg_replace('/[^\d]/', '', (string) $value);

        if (strlen($imei) !== 15) {
            $fail("The {$attribute} must be exactly 15 digits.");
            return;
        }

        // Luhn checksum validation
        $sum = 0;
        for ($i = 0; $i < 15; $i++) {
            $digit = (int) $imei[$i];
            if ($i % 2 === 1) {
                $digit *= 2;
                if ($digit > 9) {
                    $digit -= 9;
                }
            }
            $sum += $digit;
        }

        if ($sum % 10 !== 0) {
            $fail("The {$attribute} is not a valid IMEI number.");
        }
    }
}
