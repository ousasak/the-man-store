<?php

namespace App\Http\Requests\Inventory;

use App\Rules\ValidImeiRule;
use Illuminate\Foundation\Http\FormRequest;

class RegisterImeiDeviceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_id'    => ['required', 'integer', 'exists:products,id'],
            'imei'          => ['required', 'string', 'unique:inventory_lots,imei', new ValidImeiRule],
            'serial_number' => ['nullable', 'string', 'max:100'],
            'condition'     => ['nullable', 'string', 'in:brand_new,used_99,used_95,used_90,damaged'],
            'cost_price'    => ['required', 'numeric', 'min:0'],
            'selling_price' => ['required', 'numeric', 'min:0'],
            'branch_id'     => ['nullable', 'integer'],
            'supplier_id'   => ['nullable', 'integer', 'exists:suppliers,id'],
            'notes'         => ['nullable', 'string', 'max:500'],
        ];
    }
}
