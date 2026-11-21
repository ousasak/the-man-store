<?php

namespace App\Http\Controllers\Api\V1\Driver;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\CodCollectionService;
use App\Services\DriverCodScanTokenService;
use App\Services\TelegramService;
use App\Support\TelegramBotTexts;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class DriverCodScanController extends Controller
{
    public function __construct(
        private readonly DriverCodScanTokenService $tokens,
        private readonly CodCollectionService $codCollection,
        private readonly TelegramService $telegram,
    ) {
    }

    public function show(string $token): JsonResponse
    {
        $session = $this->tokens->resolve($token);
        if (! $session) {
            return response()->json(['message' => 'Scan link expired. Open it again from Telegram.'], 404);
        }

        $order = Order::query()->find((int) $session['order_id']);
        if (! $order || $order->payment_method !== 'cod') {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        $kind = (string) ($session['kind'] ?? 'driver');

        return response()->json([
            'data' => [
                'order_id' => $order->id,
                'order_number' => $order->order_number ?: '#'.$order->id,
                'total' => round((float) $order->total, 2),
                'kind' => $kind,
                'hint' => 'ស្កេន QR ហាង (ABA / ACLEDA / Wing) — អ្នកដឹកជាអ្នកស្កេន ហាងមិនស្កេនទេ',
                'paid' => $order->payment_status === 'paid',
            ],
        ]);
    }

    public function capture(Request $request, string $token): JsonResponse
    {
        $validated = $request->validate([
            'qr_payload' => 'required|string|min:8|max:2000',
        ]);

        $session = $this->tokens->resolve($token);
        if (! $session) {
            return response()->json(['message' => 'Scan link expired. Open it again from Telegram.'], 404);
        }

        $order = Order::with(['shipment', 'payments'])->find((int) $session['order_id']);
        if (! $order || $order->payment_method !== 'cod') {
            return response()->json(['message' => 'Order not found.'], 404);
        }

        if ($order->payment_status === 'paid') {
            $detected = $this->codCollection->detectBankFromQr($validated['qr_payload']);

            return response()->json([
                'message' => 'Already paid.',
                'data' => [
                    'bank' => $detected,
                    'paid' => true,
                    'order' => $order,
                ],
            ]);
        }

        $method = CodCollectionService::DRIVER_QR;
        $chatId = (int) ($session['chat_id'] ?? 0);
        if ($chatId > 0) {
            $this->telegram->rememberDriverJobChat($order, $chatId);
        }

        try {
            $detected = $this->codCollection->detectBankFromQr($validated['qr_payload']);
            $this->codCollection->collectCash(
                $order,
                $method,
                isset($session['verified_by']) ? (int) $session['verified_by'] : null,
                null,
                [
                    'qr_payload' => $validated['qr_payload'],
                    'qr_bank' => $detected['id'],
                    'courier_name' => $session['courier'] ?? null,
                ],
            );
        } catch (\Throwable $e) {
            Log::warning('Driver COD scan capture failed', [
                'order_id' => $order->id,
                'error' => $e->getMessage(),
            ]);

            return response()->json(['message' => $e->getMessage() ?: 'Failed to record scan.'], 422);
        }

        $this->tokens->forget($token);
        if ($chatId > 0) {
            Cache::forget('tg-cod-qr:'.$chatId);
            $fresh = $order->fresh(['shipment', 'payments']);
            $this->telegram->sendMessage(
                (string) $chatId,
                TelegramBotTexts::get('km', 'driver_cod_recorded', [
                    'label' => $detected['label'] ?? 'QR',
                ]),
                $fresh ? $this->telegram->buildDriverOrderKeyboard($fresh) : null,
                null
            );
        }

        return response()->json([
            'message' => 'COD QR recorded.',
            'data' => [
                'bank' => $detected,
                'paid' => true,
                'order' => $order->fresh(['payments']),
            ],
        ]);
    }
}
