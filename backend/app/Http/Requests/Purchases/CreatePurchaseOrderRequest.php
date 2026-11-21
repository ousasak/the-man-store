<?php

namespace App\Http\Requests\Purchases;

use Illuminate\Foundation\Http\FormRequest;

class CreatePurchaseOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'supplier_id'        => ['required', 'integer', 'exists:suppliers,id'],
            'branch_id'          => ['nullable', 'integer'],
            'items'              => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:1'],
            'items.*.unit_cost'  => ['required', 'numeric', 'min:0'],
            'notes'              => ['nullable', 'string', 'max:1000'],
        ];
    }
}
