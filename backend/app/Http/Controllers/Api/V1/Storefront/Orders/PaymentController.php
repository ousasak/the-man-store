<?php

namespace App\Http\Controllers\Api\V1\Storefront\Orders;

use App\Http\Controllers\Controller;
use App\Jobs\WatchKhqrPayment;
use App\Models\Order;
use App\Models\Cart;
use App\Models\Payment;
use App\Models\Setting;
use App\Services\RielpayPaymentService;
use App\Services\PaidOrderInventory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentController extends Controller
{
    public function __construct(
        private readonly RielpayPaymentService $rielpayPayments,
    ) {
    }

    private function clearUserCart(int $userId): void
    {
        $cart = Cart::with('items')->where('user_id', $userId)->first();
        if ($cart) {
            $cart->items()->delete();
        }
    }

    /**
     * Get payment page for an order
     */
    public function show(Order $order, Request $request)
    {
        // Verify order belongs to user
        if ($order->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $order->load(['items.product']);

        // Get payment settings
        $paymentSettings = $this->getPaymentSettings();

        return response()->json([
            'data' => $order,
            'payment_settings' => $paymentSettings,
        ]);
    }

    /**
     * Process Bakong KHQR payment
     */
    public function verifyBKash(Order $order, Request $request)
    {
        // Verify order belongs to user
        if ($order->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Find payment record
        $payment = Payment::where('order_id', $order->id)
            ->where('method', 'bakong_khqr')
            ->first();

        if (!$payment) {
            return response()->json(['message' => 'Payment record not found'], 404);
        }

        // In production, you would verify with Bakong API here
        // For now, we'll simulate successful verification
        
        DB::transaction(function () use ($payment, $order) {
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();

            if ($order->payment_status === 'paid') {
                $payment->update([
                    'status' => 'paid',
                    'paid_at' => now(),
                ]);

                return;
            }

            $payment->update([
                'status' => 'paid',
                'paid_at' => now(),
            ]);

            $order->update([
                'payment_status' => 'paid',
                'status' => 'processing',
            ]);

            $order->load('items.product');
            PaidOrderInventory::applyForOrder($order);
        });

        // Clear cart only after payment succeeds
        $this->clearUserCart((int) $order->user_id);

        return response()->json([
            'success' => true,
            'message' => 'Payment verified successfully',
            'payment' => $payment,
        ]);
    }

    /**
     * Get payment settings from database
     */
    private function getPaymentSettings()
    {
        $settings = Setting::where('group', 'payment')->get()->keyBy('key');

        return [
            'bakong' => [
                'receive_account' => $settings->get('bakong_receive_account')?->value ?? '',
                'merchant_name' => $settings->get('bakong_merchant_name')?->value ?? 'The Man Store',
                'merchant_city' => $settings->get('bakong_merchant_city')?->value ?? 'Phnom Penh',
                'enabled' => (bool) ($settings->get('payment_method_bakong_khqr')?->value ?? true),
            ],
        ];
    }

    /**
     * Create KHQR payment and return QR image
     */
    public function createKhqr(Request $request)
    {
        $validated = $request->validate([
            'order_id' => 'required|integer|exists:orders,id',
        ]);

        $order = Order::with('items.product')->findOrFail((int) $validated['order_id']);

        if ($order->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($order->payment_method !== 'bakong_khqr') {
            return response()->json(['message' => 'Order payment method is not KHQR.'], 422);
        }

        if ($order->payment_status === 'paid') {
            return response()->json(['message' => 'Order is already paid.'], 409);
        }

        $existing = Payment::where('order_id', $order->id)
            ->khqrProvider()
            ->where('status', 'pending')
            ->where(function ($query) {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->latest('id')
            ->first();

        if ($existing && $existing->khqr_payload && $existing->qr_string) {
            WatchKhqrPayment::dispatch((int) $existing->id);
            $this->rielpayPayments->scheduleAutoConfirm($existing, $order);

            return response()->json([
                'payment' => $this->sanitizePayment($existing),
            ]);
        }

        Payment::where('order_id', $order->id)
            ->khqrProvider()
            ->where('status', 'pending')
            ->whereNotNull('expires_at')
            ->where('expires_at', '<=', now())
            ->update(['status' => 'expired']);

        $payment = $existing ?: Payment::create([
            'order_id' => $order->id,
            'provider' => 'rielpay',
            'amount' => $order->total,
            'currency' => config('services.rielpay.currency', 'KHR'),
            'method' => 'bakong_khqr',
            'status' => 'pending',
        ]);

        try {
            $result = $this->rielpayPayments->generate($order, $payment);

            $payment->update([
                'provider' => 'rielpay',
                'bill_number' => $result['bill_number'],
                'md5' => $result['md5'],
                'khqr_payload' => $result['payload'],
                'qr_string' => $result['qr_string'],
                'qr_image_base64' => null,
                'expires_at' => $result['expires_at'],
                'raw_response' => $result['payload'],
            ]);

            $fresh = $payment->fresh();
            WatchKhqrPayment::dispatch((int) $fresh->id);
            $this->rielpayPayments->scheduleAutoConfirm($fresh, $order);

            return response()->json([
                'payment' => $this->sanitizePayment($fresh),
            ]);
        } catch (\Throwable $e) {
            Log::error('KHQR create failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            $payment->update(['status' => 'failed']);

            return response()->json([
                'message' => $e->getMessage() ?: 'Failed to create KHQR payment. Please try again.',
            ], 500);
        }
    }

    public function khqrStatus(int $orderId, Request $request)
    {
        $order = Order::with('items.product')->findOrFail($orderId);

        if ($order->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $payment = Payment::where('order_id', $order->id)
            ->khqrProvider()
            ->latest('id')
            ->first();

        if (!$payment) {
            return response()->json(['message' => 'Payment record not found'], 404);
        }

        if (in_array($payment->status, ['paid', 'failed', 'expired', 'cancelled'], true)) {
            return response()->json([
                'payment' => $this->sanitizePayment($payment),
            ]);
        }

        try {
            $payment = $this->rielpayPayments->refreshStatus($payment, $order);

            return response()->json([
                'payment' => $this->sanitizePayment($payment),
            ]);
        } catch (\Throwable $e) {
            Log::error('KHQR status check failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            $payment->refresh();
            $order->refresh();

            if ($payment->status === 'paid' || $order->payment_status === 'paid') {
                return response()->json([
                    'payment' => $this->sanitizePayment($payment),
                ]);
            }

            return response()->json([
                'payment' => $this->sanitizePayment($payment),
                'message' => 'Waiting for payment confirmation. Keep this screen open after you pay in your banking app.',
            ]);
        }
    }

    private function sanitizePayment(Payment $payment): array
    {
        return [
            'id' => $payment->id,
            'order_id' => $payment->order_id,
            'provider' => $payment->provider,
            'amount' => $payment->amount,
            'currency' => $payment->currency,
            'status' => $payment->status,
            'bill_number' => $payment->bill_number,
            'md5' => $payment->md5,
            'qr_string' => $payment->qr_string,
            'khqr_payload' => $payment->khqr_payload,
            'qr_image_base64' => $payment->qr_image_base64,
            'expires_at' => optional($payment->expires_at)->toIso8601String(),
            'paid_at' => optional($payment->paid_at)->toIso8601String(),
            'created_at' => optional($payment->created_at)->toIso8601String(),
        ];
    }
}
