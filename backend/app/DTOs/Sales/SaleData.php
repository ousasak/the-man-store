<?php

namespace App\DTOs\Sales;

readonly class SaleData
{
    public function __construct(
        public ?int $customerId,
        public int $cashierId,
        public int $branchId,
        public array $items,
        public float $subtotal,
        public float $discountAmount = 0.0,
        public float $taxAmount = 0.0,
        public float $totalAmount = 0.0,
        public string $paymentMethod = 'cash',
        public ?string $notes = null
    ) {}

    public static function fromArray(array $data): self
    {
        return new self(
            customerId: $data['customer_id'] ?? null,
            cashierId: (int) ($data['cashier_id'] ?? auth()->id() ?? 1),
            branchId: (int) ($data['branch_id'] ?? 1),
            items: $data['items'] ?? [],
            subtotal: (float) ($data['subtotal'] ?? 0),
            discountAmount: (float) ($data['discount_amount'] ?? 0),
            taxAmount: (float) ($data['tax_amount'] ?? 0),
            totalAmount: (float) ($data['total_amount'] ?? 0),
            paymentMethod: $data['payment_method'] ?? 'cash',
            notes: $data['notes'] ?? null
        );
    }
}
