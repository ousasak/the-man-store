<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class ValidKhqrPayloadRule implements ValidationRule
{
    /**
     * Validate Bakong KHQR EMV payload format.
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $payload = (string) $value;

        // Basic EMV QR check: Must begin with Payload Format Indicator '000201'
        if (!str_starts_with($payload, '000201')) {
            $fail("The {$attribute} is not a valid Bakong KHQR format.");
        }
    }
}
