<?php

namespace App\Services;

use App\Enums\RepairStatus;

class RepairService
{
    public function calculateEstimatedCost(array $parts, float $laborRate): float
    {
        $partsTotal = array_sum(array_column($parts, 'price'));
        return $partsTotal + $laborRate;
    }

    public function canTransitionStatus(RepairStatus $current, RepairStatus $next): bool
    {
        // Business logic state transitions for repair tickets
        return match ($current) {
            RepairStatus::RECEIVED => in_array($next, [RepairStatus::DIAGNOSING, RepairStatus::CANCELLED]),
            RepairStatus::DIAGNOSING => in_array($next, [RepairStatus::WAITING_PARTS, RepairStatus::IN_PROGRESS, RepairStatus::CANCELLED]),
            RepairStatus::WAITING_PARTS => in_array($next, [RepairStatus::IN_PROGRESS, RepairStatus::CANCELLED]),
            RepairStatus::IN_PROGRESS => in_array($next, [RepairStatus::COMPLETED, RepairStatus::WAITING_PARTS]),
            RepairStatus::COMPLETED => in_array($next, [RepairStatus::DELIVERED]),
            default => false,
        };
    }
}
