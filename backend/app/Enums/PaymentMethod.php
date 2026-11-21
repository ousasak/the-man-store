<?php

namespace App\Enums;

enum PaymentMethod: string
{
    case CASH = 'cash';
    case KHQR = 'khqr';
    case CARD = 'card';
    case COD = 'cod';
    case BANK_TRANSFER = 'bank_transfer';

    public function label(): string
    {
        return match ($this) {
            self::CASH => 'Cash (USD/KHR)',
            self::KHQR => 'Bakong KHQR',
            self::CARD => 'Credit / Debit Card',
            self::COD => 'Cash On Delivery',
            self::BANK_TRANSFER => 'Direct Bank Transfer',
        };
    }
}
