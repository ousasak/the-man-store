<?php

namespace App\Http\Resources\Sales;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'order_number'   => $this->order_number ?? 'ORD-' . str_pad($this->id, 6, '0', STR_PAD_LEFT),
            'customer_id'    => $this->user_id,
            'status'         => $this->status,
            'subtotal'       => (float) $this->subtotal,
            'discount_amount'=> (float) $this->discount_amount,
            'total_amount'   => (float) $this->total_amount,
            'payment_method' => $this->payment_method,
            'items'          => $this->whenLoaded('items'),
            'created_at'     => $this->created_at?->toIso8601String(),
        ];
    }
}
