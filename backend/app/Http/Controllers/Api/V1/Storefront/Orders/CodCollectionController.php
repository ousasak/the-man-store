<?php

namespace App\Http\Controllers\Api\V1\Storefront\Orders;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\CodCollectionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CodCollectionController extends Controller
{
    public function __construct(
        private readonly CodCollectionService $codCollection,
    ) {
    }

    public function quote(Order $order): JsonResponse
    {
        $quote = $this->codCollection->quote($order);

        return response()->json([
            'message' => 'COD quote retrieved.',
            'data' => [
                'order_id' => $order->id,
                'payment_status' => $order->payment_status,
                'payment_method' => $order->payment_method,
                'usd_amount' => $quote['usd_amount'],
                'khr_amount' => $quote['khr_amount'],
                'goods_usd' => $quote['goods_usd'] ?? null,
                'shipping_usd' => $quote['shipping_usd'] ?? null,
                'shop_qr_usd' => $quote['shop_qr_usd'] ?? null,
                'shop_qr_khr' => $quote['shop_qr_khr'] ?? null,
                'exchange_rate' => $quote['exchange_rate'],
                'cod_plan' => $quote['cod_plan'],
                'qr_banks' => $quote['qr_banks'],
                'shop_khqr' => $quote['shop_khqr'] ?? null,
            ],
        ]);
    }

    public function setPlan(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'plan' => 'required|in:driver_advance,collect_at_delivery,customer_pays_shop',
        ]);

        $payment = $this->codCollection->setPlan($order, $validated['plan']);

        return response()->json([
            'message' => 'COD driver plan saved.',
            'data' => [
                'cod_plan' => $this->codCollection->currentPlan($payment),
                'payment' => $payment,
                'order' => $order->fresh(['user', 'items.product', 'payments', 'shipment']),
            ],
        ]);
    }

    public function collectCash(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'settlement_method' => 'required|in:cod_cash_usd,cod_cash_khr,cod_driver_qr,cod_driver_cash,cod_customer_driver_qr',
            'reference_code' => 'nullable|string|max:100',
            'actual_amount_received' => 'nullable|numeric|min:0',
            'courier_name' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:500',
            'qr_bank' => 'nullable|in:aba,acleda,wing,other',
            'qr_payload' => 'nullable|string|max:2000',
            'currency' => 'nullable|in:USD,KHR',
        ]);

        $payment = $this->codCollection->collectCash(
            $order,
            $validated['settlement_method'],
            (int) $request->user()->id,
            $validated['reference_code'] ?? null,
            [
                'actual_amount_received' => $validated['actual_amount_received'] ?? null,
                'courier_name' => $validated['courier_name'] ?? null,
                'notes' => $validated['notes'] ?? null,
                'qr_bank' => $validated['qr_bank'] ?? null,
                'qr_payload' => $validated['qr_payload'] ?? null,
                'currency' => $validated['currency'] ?? null,
            ],
        );

        return response()->json([
            'message' => 'COD payment recorded.',
            'data' => [
                'payment' => $payment,
                'order' => $order->fresh(['user', 'items.product', 'payments']),
            ],
        ]);
    }

    public function createKhqr(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'courier_name' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:500',
        ]);

        try {
            $result = $this->codCollection->createCodKhqr($order, [
                'courier_name' => $validated['courier_name'] ?? null,
                'notes' => $validated['notes'] ?? null,
            ]);

            return response()->json([
                'message' => 'COD KHQR generated.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            Log::error('COD KHQR create failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage() ?: 'Failed to generate COD KHQR.',
            ], 500);
        }
    }

    public function khqrStatus(Order $order): JsonResponse
    {
        try {
            $payment = $this->codCollection->refreshCodKhqr($order);

            return response()->json([
                'payment' => [
                    'id' => $payment->id,
                    'status' => $payment->status,
                    'method' => $payment->method,
                    'paid_at' => optional($payment->paid_at)->toIso8601String(),
                    'qr_bank' => is_array($payment->raw_response)
                        ? ($payment->raw_response['qr_bank_label'] ?? $payment->raw_response['qr_bank'] ?? null)
                        : null,
                    'settlement_label_km' => is_array($payment->raw_response)
                        ? ($payment->raw_response['settlement_label_km'] ?? null)
                        : null,
                ],
                'order' => $order->fresh(['payments']),
            ]);
        } catch (\Throwable $e) {
            Log::error('COD KHQR status failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage() ?: 'Failed to check COD KHQR status.',
            ], 500);
        }
    }

    public function confirmKhqr(Request $request, Order $order): JsonResponse
    {
        $validated = $request->validate([
            'courier_name' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:500',
        ]);

        try {
            $payment = $this->codCollection->refreshCodKhqr($order);
            $freshOrder = $order->fresh(['payments']);
            if ($payment->status !== 'paid' && $freshOrder?->payment_status !== 'paid') {
                $payment = $this->codCollection->confirmShopKhqrReceived($order, [
                    'courier_name' => $validated['courier_name'] ?? null,
                    'notes' => $validated['notes'] ?? null,
                ]);
            }

            return response()->json([
                'message' => 'COD KHQR marked as received.',
                'payment' => [
                    'id' => $payment->id,
                    'status' => $payment->status,
                    'method' => $payment->method,
                    'paid_at' => optional($payment->paid_at)->toIso8601String(),
                    'qr_bank' => is_array($payment->raw_response)
                        ? ($payment->raw_response['qr_bank_label'] ?? $payment->raw_response['qr_bank'] ?? null)
                        : null,
                    'settlement_label_km' => is_array($payment->raw_response)
                        ? ($payment->raw_response['settlement_label_km'] ?? null)
                        : null,
                ],
                'order' => $order->fresh(['user', 'items.product', 'payments', 'shipment']),
            ]);
        } catch (\Throwable $e) {
            Log::error('COD KHQR confirm failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'message' => $e->getMessage() ?: 'Failed to confirm COD KHQR.',
            ], 422);
        }
    }
}
