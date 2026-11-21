<?php

namespace App\Enums;

enum UserRole: string
{
    case SUPER_ADMIN = 'super_admin';
    case ADMIN = 'admin';
    case CASHIER = 'cashier';
    case TECHNICIAN = 'technician';
    case DRIVER = 'driver';
    case CUSTOMER = 'customer';

    public function label(): string
    {
        return match ($this) {
            self::SUPER_ADMIN => 'Super Admin',
            self::ADMIN => 'Store Administrator',
            self::CASHIER => 'Cashier / POS Operator',
            self::TECHNICIAN => 'Repair Technician',
            self::DRIVER => 'Delivery Driver',
            self::CUSTOMER => 'Store Customer',
        };
    }
}
