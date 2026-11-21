<?php

namespace App\DTOs\Inventory;

use App\Enums\DeviceCondition;

readonly class ImeiDeviceData
{
    public function __construct(
        public int $productId,
        public string $imei,
        public ?string $serialNumber = null,
        public DeviceCondition $condition = DeviceCondition::BRAND_NEW,
        public float $costPrice = 0.0,
        public float $sellingPrice = 0.0,
        public int $branchId = 1,
        public ?int $supplierId = null,
        public ?string $notes = null
    ) {}

    public static function fromArray(array $data): self
    {
        $condition = isset($data['condition'])
            ? (DeviceCondition::tryFrom($data['condition']) ?? DeviceCondition::BRAND_NEW)
            : DeviceCondition::BRAND_NEW;

        return new self(
            productId: (int) $data['product_id'],
            imei: (string) $data['imei'],
            serialNumber: $data['serial_number'] ?? null,
            condition: $condition,
            costPrice: (float) ($data['cost_price'] ?? 0),
            sellingPrice: (float) ($data['selling_price'] ?? 0),
            branchId: (int) ($data['branch_id'] ?? 1),
            supplierId: isset($data['supplier_id']) ? (int) $data['supplier_id'] : null,
            notes: $data['notes'] ?? null
        );
    }
}
