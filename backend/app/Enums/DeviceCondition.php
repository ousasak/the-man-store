<?php

namespace App\Enums;

enum DeviceCondition: string
{
    case BRAND_NEW = 'brand_new';
    case USED_99 = 'used_99';
    case USED_95 = 'used_95';
    case USED_90 = 'used_90';
    case DAMAGED = 'damaged';

    public function label(): string
    {
        return match ($this) {
            self::BRAND_NEW => 'Brand New (100% Sealed)',
            self::USED_99 => 'Like New (99%)',
            self::USED_95 => 'Good Condition (95%)',
            self::USED_90 => 'Fair Condition (90%)',
            self::DAMAGED => 'Needs Repair / Damaged',
        };
    }
}
