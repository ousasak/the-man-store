<?php

namespace App\Http\Resources\Repairs;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class RepairTicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'ticket_number' => $this->ticket_number ?? 'REP-' . $this->id,
            'customer_name' => $this->customer_name,
            'device_model'  => $this->device_model,
            'imei_sn'       => $this->imei_sn,
            'status'        => $this->status,
            'technician'    => $this->technician_name,
            'estimated_cost'=> (float) $this->estimated_cost,
            'created_at'    => $this->created_at?->toIso8601String(),
        ];
    }
}
