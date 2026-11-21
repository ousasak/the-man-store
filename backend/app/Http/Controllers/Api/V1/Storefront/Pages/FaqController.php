<?php

namespace App\Http\Controllers\Api\V1\Storefront\Pages;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\FaqContent;

class FaqController extends Controller
{
    public function show()
    {
        $setting = Setting::query()
            ->where('group', 'homepage')
            ->where('key', 'faq')
            ->first();

        $faq = $setting ? (array) $setting->value : FaqContent::defaults();

        return response()->json([
            'faq' => FaqContent::normalize(is_array($faq) ? $faq : []),
        ]);
    }
}
