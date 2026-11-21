<?php

namespace App\Http\Controllers\Api\V1\Admin\Payments;

use Illuminate\Routing\Controller;
use App\Models\Setting;
use Illuminate\Http\Request;

class PaymentSettingsController extends Controller
{
    // Only superadmin can access
    public function __construct()
    {
        $this->middleware(function ($request, $next) {
            if ($request->user()->role !== 'superadmin') {
                return response()->json(['message' => 'Only superadmin can manage payment settings'], 403);
            }
            return $next($request);
        });
    }

    /**
     * Get all payment settings
     */
    public function index()
    {
        $settings = Setting::where('group', 'payment')->get()->keyBy('key');

        return response()->json([
            'bakong' => [
                'receive_account' => $settings->get('bakong_receive_account')?->value ?? '',
                'merchant_name' => $settings->get('bakong_merchant_name')?->value ?? '',
                'merchant_city' => $settings->get('bakong_merchant_city')?->value ?? '',
            ],
            'enabled_methods' => [
                'bakong_khqr' => (bool) ($settings->get('payment_method_bakong_khqr')?->value ?? true),
                'cod' => (bool) ($settings->get('payment_method_cod')?->value ?? true),
            ],
            'exchange_rate' => (int) (Setting::where('key', 'usd_khr_exchange_rate')->value('value') ?? 4100),
        ]);
    }

    /**
     * Update payment settings
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'bakong.receive_account' => 'nullable|string',
            'bakong.merchant_name' => 'nullable|string',
            'bakong.merchant_city' => 'nullable|string',
            'enabled_methods.bakong_khqr' => 'nullable|boolean',
            'enabled_methods.cod' => 'nullable|boolean',
            'exchange_rate' => 'nullable|integer|min:1|max:99999',
        ]);

        // Save Bakong settings
        if (isset($validated['bakong'])) {
            foreach ($validated['bakong'] as $key => $value) {
                $this->saveSetting('bakong_' . $key, $value, 'payment');
            }
        }

        // Save enabled methods
        if (isset($validated['enabled_methods'])) {
            foreach ($validated['enabled_methods'] as $key => $value) {
                $this->saveSetting('payment_method_' . $key, $value, 'payment');
            }
        }

        if (array_key_exists('exchange_rate', $validated) && $validated['exchange_rate'] !== null) {
            Setting::updateOrCreate(
                ['key' => 'usd_khr_exchange_rate'],
                ['value' => (string) $validated['exchange_rate'], 'group' => 'commerce', 'type' => 'number']
            );
        }

        return response()->json([
            'message' => 'Payment settings updated successfully',
            'settings' => $this->index()->getData(),
        ]);
    }

    /**
     * Helper to save settings
     */
    private function saveSetting($key, $value, $group = 'general')
    {
        Setting::updateOrCreate(
            ['key' => $key, 'group' => $group],
            ['value' => $value]
        );
    }
}
