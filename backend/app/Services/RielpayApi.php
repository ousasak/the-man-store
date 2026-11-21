<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class RielpayApi
{
    public const CIRCUIT_CACHE_KEY = 'rielpay:circuit-open';

    public static function isCircuitOpen(): bool
    {
        return Cache::has(self::CIRCUIT_CACHE_KEY);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function createPayment(array $payload): array
    {
        return $this->request('post', '/api/v1/payments/create', $payload);
    }

    /**
     * @return array<string, mixed>
     */
    public function checkPayment(string $md5): array
    {
        return $this->request('post', '/api/v1/payments/check', [
            'md5' => strtolower(trim($md5)),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function getPayment(string $billNumber): array
    {
        return $this->request('get', '/api/v1/payments/' . rawurlencode($billNumber));
    }

    /**
     * NBC Bakong deeplink via Rielpay (Cambodia egress + BAKONG_TOKEN on Rielpay host).
     *
     * @param  array{app_name?: string, app_icon_url?: string, app_deep_link_callback?: string}|null  $sourceInfo
     */
    public function generateDeeplink(string $qr, ?array $sourceInfo = null): string
    {
        $qr = trim($qr);
        if ($qr === '') {
            throw new RuntimeException('QR string is required for deeplink generation.');
        }

        $iconUrl = (string) config('services.rielpay.deeplink_icon_url');
        if ($iconUrl === '') {
            $iconUrl = rtrim((string) config('app.frontend_url', config('app.url')), '/') . '/logo-circle.png';
        }

        $sourceInfo ??= [
            'app_name' => (string) config('services.rielpay.deeplink_app_name', 'The Man Store'),
            'app_icon_url' => $iconUrl,
            'app_deep_link_callback' => (string) config(
                'services.rielpay.deeplink_callback',
                'themanstore://payment/callback'
            ),
        ];

        $response = $this->request('post', '/api/v1/payments/deeplink', [
            'qr' => $qr,
            'source_info' => $sourceInfo,
        ]);

        $shortLink = is_string(data_get($response, 'short_link'))
            ? (string) data_get($response, 'short_link')
            : '';

        if ($shortLink === '') {
            throw new RuntimeException('Rielpay did not return a deeplink short_link.');
        }

        return $shortLink;
    }

    /**
     * @param  array<string, mixed>|null  $payload
     * @return array<string, mixed>
     */
    private function request(string $method, string $path, ?array $payload = null): array
    {
        $baseUrl = rtrim((string) config('services.rielpay.api_url'), '/');
        $apiKey = (string) config('services.rielpay.api_key');

        if ($baseUrl === '') {
            throw new RuntimeException('Rielpay API URL is not configured (RIELPAY_API_URL).');
        }

        if ($apiKey === '') {
            throw new RuntimeException('Rielpay API key is not configured (RIELPAY_API_KEY).');
        }

        if (self::isCircuitOpen()) {
            throw new RuntimeException('Payment service is temporarily unavailable. Please try again in a moment.');
        }

        $headers = [
            'Accept' => 'application/json',
            'Authorization' => 'Bearer ' . $apiKey,
            'X-API-Key' => $apiKey,
        ];

        if ($payload !== null) {
            $headers['Content-Type'] = 'application/json';
        }

        try {
            $pending = Http::timeout(25)->withHeaders($headers);

            $response = match (strtolower($method)) {
                'get' => $pending->get($baseUrl . $path),
                'post' => $pending->post($baseUrl . $path, $payload ?? []),
                default => throw new RuntimeException('Unsupported HTTP method: ' . $method),
            };
        } catch (ConnectionException $e) {
            $this->tripCircuit(0);
            throw new RuntimeException('Rielpay connection failed: ' . $e->getMessage(), 0, $e);
        }

        if ($response->failed()) {
            $this->tripCircuit($response->status());
            $this->throwForFailedResponse($response->status(), $response->json(), $response->body());
        }

        $json = $response->json();
        if (! is_array($json)) {
            throw new RuntimeException('Rielpay returned an invalid response.');
        }

        return $json;
    }

  /**
     * @param  array<string, mixed>|null  $json
     */
    private function throwForFailedResponse(int $status, ?array $json, string $body): void
    {
        $message = is_string(data_get($json, 'message'))
            ? (string) data_get($json, 'message')
            : trim($body);

        Log::warning('Rielpay API error', [
            'status' => $status,
            'message' => $message,
            'errors' => data_get($json, 'errors'),
        ]);

        // A non-JSON body means we never reached Rielpay itself — it is the CDN or
        // reverse proxy answering because the origin is down.
        if ($json === null) {
            throw new RuntimeException(
                'Rielpay server is unreachable (HTTP '.$status.'). '
                .'Check that the Rielpay host and its Cloudflare tunnel are running.'
                .($message !== '' ? ' Gateway said: '.$message : '')
            );
        }

        $userMessage = match ($status) {
            401 => 'Payment service authentication failed. Please contact support.',
            403 => 'Payment service is not active. Please contact support.',
            404 => $message !== '' ? $message : 'Payment service endpoint not found.',
            405 => 'Payment deeplink is not available on Rielpay yet. Rebuild and deploy the Rielpay backend.',
            422 => $message !== '' ? $message : 'Invalid payment request.',
            500, 502, 503 => $message !== '' ? $message : 'Payment service error. Please try again.',
            default => $message !== '' ? $message : 'Payment service is temporarily unavailable. Please try again.',
        };

        throw new RuntimeException($userMessage);
    }

    private function tripCircuit(int $status): void
    {
        if ($status === 0 || in_array($status, [502, 503, 504, 521, 522, 523, 524, 530], true)) {
            Cache::put(self::CIRCUIT_CACHE_KEY, $status, now()->addSeconds(45));
        }
    }
}
