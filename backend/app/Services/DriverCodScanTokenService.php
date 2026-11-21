<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

class DriverCodScanTokenService
{
    public const CACHE_PREFIX = 'cod-scan:';

    public const TTL_MINUTES = 15;

    /**
     * @param  array{order_id:int, kind:string, chat_id:int, verified_by:?int, courier:?string}  $payload
     */
    public function mint(array $payload): string
    {
        $token = bin2hex(random_bytes(16));
        Cache::put(self::CACHE_PREFIX.$token, $payload, now()->addMinutes(self::TTL_MINUTES));

        return $token;
    }

    /**
     * @return array{order_id:int, kind:string, chat_id:int, verified_by:?int, courier:?string}|null
     */
    public function resolve(string $token): ?array
    {
        $token = preg_replace('/[^a-f0-9]/i', '', $token) ?? '';
        if (strlen($token) !== 32) {
            return null;
        }

        $payload = Cache::get(self::CACHE_PREFIX.$token);

        return is_array($payload) && ! empty($payload['order_id']) ? $payload : null;
    }

    public function forget(string $token): void
    {
        Cache::forget(self::CACHE_PREFIX.$token);
    }

    public function pageUrl(string $token): string
    {
        $frontend = rtrim((string) config('app.frontend_url', 'http://localhost:5173'), '/');

        return $frontend.'/driver/cod-scan/'.$token;
    }
}
