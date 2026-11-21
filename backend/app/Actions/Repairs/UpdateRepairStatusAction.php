<?php

namespace App\Actions\Repairs;

use App\Models\ReplacementCase;
use App\Enums\RepairStatus;
use Illuminate\Support\Facades\DB;

class UpdateRepairStatusAction
{
    public function execute(int $ticketId, RepairStatus $newStatus, ?string $notes = null): ReplacementCase
    {
        return DB::transaction(function () use ($ticketId, $newStatus, $notes) {
            $ticket = ReplacementCase::findOrFail($ticketId);
            $ticket->update([
                'status' => $newStatus->value,
                'notes'  => $notes ?? $ticket->notes,
            ]);

            return $ticket;
        });
    }
}
