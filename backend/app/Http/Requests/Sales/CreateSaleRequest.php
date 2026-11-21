<?php

namespace App\Http\Requests\Sales;

use Illuminate\Foundation\Http\FormRequest;

class CreateSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id'        => ['nullable', 'integer', 'exists:users,id'],
            'branch_id'          => ['nullable', 'integer'],
            'items'              => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.imei_sn'    => ['nullable', 'string', 'max:100'],
            'subtotal'           => ['required', 'numeric', 'min:0'],
            'discount_amount'    => ['nullable', 'numeric', 'min:0'],
            'tax_amount'         => ['nullable', 'numeric', 'min:0'],
            'total_amount'       => ['required', 'numeric', 'min:0'],
            'payment_method'     => ['required', 'string', 'in:cash,khqr,card,bank_transfer'],
            'notes'              => ['nullable', 'string', 'max:1000'],
        ];
    }
}
