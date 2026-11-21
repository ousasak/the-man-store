<?php

namespace App\Services;

use App\Models\Order;

class OrderReceiptTokenService
{
    public function mint(Order $order, int $ttlDays = 30): string
    {
        $exp = now()->addDays(max(1, $ttlDays))->timestamp;
        $payload = $order->id.'|'.$exp;
        $sig = hash_hmac('sha256', $payload, (string) config('app.key'));

        return $this->base64UrlEncode($payload.'|'.$sig);
    }

    public function resolve(string $token): ?Order
    {
        $raw = $this->base64UrlDecode($token);
        if ($raw === null) {
            return null;
        }

        $parts = explode('|', $raw);
        if (count($parts) !== 3) {
            return null;
        }

        [$orderId, $exp, $sig] = $parts;
        $payload = $orderId.'|'.$exp;
        $expected = hash_hmac('sha256', $payload, (string) config('app.key'));

        if (! hash_equals($expected, $sig)) {
            return null;
        }

        if (! ctype_digit((string) $exp) || (int) $exp < now()->timestamp) {
            return null;
        }

        return Order::query()->find((int) $orderId);
    }

    public function buildReceiptUrl(Order $order): string
    {
        $frontend = rtrim((string) config('app.frontend_url', 'http://localhost:5173'), '/');
        $token = $this->mint($order);

        return $frontend.'/receipt/'.$token;
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): ?string
    {
        $padded = strtr($value, '-_', '+/');
        $padLen = (4 - strlen($padded) % 4) % 4;
        $padded .= str_repeat('=', $padLen);
        $decoded = base64_decode($padded, true);

        return $decoded === false ? null : $decoded;
    }
}
