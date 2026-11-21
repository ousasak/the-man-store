<?php

namespace App\Http\Requests\Repairs;

use Illuminate\Foundation\Http\FormRequest;

class CreateRepairTicketRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id'   => ['required', 'integer'],
            'device_model'  => ['required', 'string', 'max:255'],
            'imei_sn'       => ['nullable', 'string', 'max:100'],
            'issue_summary' => ['required', 'string', 'max:500'],
            'deposit_amount'=> ['nullable', 'numeric', 'min:0'],
            'technician_id' => ['nullable', 'integer'],
        ];
    }
}
