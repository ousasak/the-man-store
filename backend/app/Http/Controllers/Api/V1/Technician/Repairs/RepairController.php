<?php

namespace App\Http\Controllers\Api\V1\Technician\Repairs;

use App\Http\Controllers\Api\BaseApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RepairController extends BaseApiController
{
    public function assignedTickets(Request $request): JsonResponse
    {
        return $this->sendResponse([], 'Assigned repair tickets.');
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => 'required|string',
            'notes'  => 'nullable|string',
        ]);

        return $this->sendResponse([
            'repair_id' => $id,
            'status'    => $validated['status'],
        ], 'Repair ticket updated successfully.');
    }
}
