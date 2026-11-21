<?php

namespace App\Http\Controllers\Api\V1\Storefront\Pages;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Support\ContactPageContent;

class ContactPageController extends Controller
{
    public function show()
    {
        $setting = Setting::query()
            ->where('group', 'homepage')
            ->where('key', 'contact_page')
            ->first();

        $contactPage = $setting ? (array) $setting->value : ContactPageContent::defaults();

        return response()->json([
            'contact_page' => ContactPageContent::normalize(is_array($contactPage) ? $contactPage : []),
        ]);
    }
}
