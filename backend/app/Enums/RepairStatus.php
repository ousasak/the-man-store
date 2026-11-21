<?php

namespace App\Enums;

enum RepairStatus: string
{
    case RECEIVED = 'received';
    case DIAGNOSING = 'diagnosing';
    case WAITING_PARTS = 'waiting_parts';
    case IN_PROGRESS = 'in_progress';
    case COMPLETED = 'completed';
    case DELIVERED = 'delivered';
    case CANCELLED = 'cancelled';
}
