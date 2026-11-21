<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TelegramOidcService
{
    /**
     * @return array<string, mixed>|null
     */
    public function verifyIdToken(string $idToken): ?array
    {
        $idToken = trim($idToken);
        if ($idToken === '' || substr_count($idToken, '.') !== 2) {
            return null;
        }

        $jwks = $this->jwks();
        if ($jwks === null) {
            return null;
        }

        try {
            $keys = JWK::parseKeySet($jwks);
            JWT::$leeway = 60;
            $decoded = JWT::decode($idToken, $keys);
        } catch (\Throwable $e) {
            Log::warning('Telegram OIDC id_token verify failed', ['error' => $e->getMessage()]);

            return null;
        }

        $claims = json_decode(json_encode($decoded, JSON_THROW_ON_ERROR), true);
        if (! is_array($claims)) {
            return null;
        }

        $iss = (string) ($claims['iss'] ?? '');
        if ($iss !== 'https://oauth.telegram.org') {
            return null;
        }

        $expectedAud = (string) (app(TelegramService::class)->loginClientId() ?? '');
        $aud = $claims['aud'] ?? null;
        $audList = is_array($aud) ? array_map('strval', $aud) : [(string) $aud];
        if ($expectedAud !== '' && ! in_array($expectedAud, $audList, true)) {
            return null;
        }

        $telegramId = (int) ($claims['id'] ?? 0);
        if ($telegramId <= 0) {
            return null;
        }

        return $claims;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function jwks(): ?array
    {
        try {
            return Cache::remember('telegram_oidc_jwks', now()->addHours(6), function () {
                $json = Http::timeout(15)->get('https://oauth.telegram.org/.well-known/jwks.json')->json();

                return is_array($json) ? $json : null;
            });
        } catch (\Throwable $e) {
            Log::warning('Telegram OIDC JWKS fetch failed', ['error' => $e->getMessage()]);

            return null;
        }
    }
}
