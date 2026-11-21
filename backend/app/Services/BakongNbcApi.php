<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Direct NBC Bakong transaction lookup (Cambodia egress or BAKONG_PROXY_URL).
 */
class BakongNbcApi
{
    public function isConfigured(): bool
    {
        return trim((string) config('services.bakong.proxy_url')) !== ''
            || trim((string) config('services.bakong.token')) !== '';
    }

    /**
     * @return array<string, mixed>
     */
    public function checkByMd5(string $md5): array
    {
        $md5 = strtolower(trim($md5));
        if ($md5 === '' || ! preg_match('/^[a-f0-9]{32}$/', $md5)) {
            throw new RuntimeException('A valid KHQR md5 is required to check Bakong.');
        }

        $json = $this->postCheck($md5);
        $this->assertNotGeoBlocked($json);

        return $json;
    }

    public function looksPaid(array $response): bool
    {
        $code = $response['responseCode'] ?? data_get($response, 'data.responseCode');
        if ($code !== null && (int) $code === 0 && $this->hasTransactionData($response)) {
            return true;
        }

        $errorCode = $response['errorCode'] ?? null;
        if ($errorCode !== null && (int) $errorCode === 0 && $this->hasTransactionData($response)) {
            return true;
        }

        return false;
    }

    public function isUnauthorized(array $response): bool
    {
        $errorCode = $response['errorCode'] ?? $response['responseCode'] ?? null;
        $message = strtolower((string) ($response['responseMessage'] ?? $response['message'] ?? ''));

        return (int) $errorCode === 6
            || str_contains($message, 'not yet requested for token')
            || str_contains($message, 'code invalid');
    }

    /**
     * @return array<string, mixed>
     */
    private function postCheck(string $md5): array
    {
        $proxy = rtrim(trim((string) config('services.bakong.proxy_url')), '/');
        $secret = trim((string) config('services.bakong.proxy_secret'));

        if ($proxy !== '') {
            return $this->httpPost($proxy, ['md5' => $md5], $secret !== '' ? [
                'X-Bakong-Proxy-Secret' => $secret,
            ] : []);
        }

        $token = trim((string) config('services.bakong.token'));
        if ($token === '') {
            throw new RuntimeException('Bakong NBC is not configured (BAKONG_PROXY_URL or BAKONG_TOKEN).');
        }

        $base = rtrim((string) config('services.bakong.base_url', 'https://api-bakong.nbc.gov.kh'), '/');

        return $this->httpPost($base.'/v1/check_transaction_by_md5', ['md5' => $md5], [
            'Authorization' => 'Bearer '.$token,
        ]);
    }

    /**
     * @param  array<string, string>  $extraHeaders
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function httpPost(string $url, array $payload, array $extraHeaders = []): array
    {
        try {
            $response = Http::timeout(20)
                ->acceptJson()
                ->withHeaders(array_merge([
                    'Content-Type' => 'application/json',
                ], $extraHeaders))
                ->post($url, $payload);
        } catch (ConnectionException $e) {
            throw new RuntimeException('Bakong NBC connection failed: '.$e->getMessage(), 0, $e);
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new RuntimeException(
                'Bakong NBC returned a non-JSON response (HTTP '.$response->status().').'
            );
        }

        if ($response->failed() && ! isset($json['responseCode']) && ! isset($json['errorCode'])) {
            $message = is_string($json['message'] ?? null) ? (string) $json['message'] : 'Bakong NBC request failed.';
            throw new RuntimeException($message);
        }

        return $json;
    }

    /**
     * @param  array<string, mixed>  $json
     */
    private function assertNotGeoBlocked(array $json): void
    {
        $errorCode = $json['errorCode'] ?? $json['responseCode'] ?? null;
        $message = strtolower((string) ($json['responseMessage'] ?? $json['message'] ?? ''));

        if ((int) $errorCode === 15 || str_contains($message, 'not allowed to access')) {
            throw new RuntimeException(
                'Bakong NBC blocked this check (errorCode 15). Use BAKONG_PROXY_URL from a Cambodia host.'
            );
        }
    }

    /**
     * @param  array<string, mixed>  $response
     */
    private function hasTransactionData(array $response): bool
    {
        $data = is_array($response['data'] ?? null) ? $response['data'] : $response;

        return filled($data['hash'] ?? null)
            || filled($data['fromAccountId'] ?? null)
            || filled($data['toAccountId'] ?? null)
            || filled($data['acknowledgedDateMs'] ?? null);
    }
}
