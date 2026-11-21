<?php

namespace App\Actions\Repairs;

use App\Models\ReplacementCase;
use App\Enums\RepairStatus;
use Illuminate\Support\Facades\DB;

class AssignTechnicianAction
{
    public function execute(int $ticketId, int $technicianId): ReplacementCase
    {
        return DB::transaction(function () use ($ticketId, $technicianId) {
            $ticket = ReplacementCase::findOrFail($ticketId);
            $ticket->update([
                'technician_id' => $technicianId,
                'status'        => RepairStatus::DIAGNOSING->value,
            ]);

            return $ticket;
        });
    }
}
