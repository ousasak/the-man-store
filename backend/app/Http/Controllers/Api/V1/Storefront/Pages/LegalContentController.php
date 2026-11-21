<?php

namespace App\Http\Controllers\Api\V1\Storefront\Pages;

use App\Http\Controllers\Controller;
use App\Models\Setting;

class LegalContentController extends Controller
{
    public function index()
    {
        $keys = ['privacy_content', 'terms_content'];

        $settings = Setting::query()
            ->whereIn('key', $keys)
            ->pluck('value', 'key');

        return response()->json([
            'privacy_content' => $settings->get('privacy_content'),
            'terms_content' => $settings->get('terms_content'),
        ]);
    }
}
