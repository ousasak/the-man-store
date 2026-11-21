<?php

namespace App\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

final class RielpayDiagnostics
{
    /** @var list<string> */
    private const PAYMENT_COLUMNS = [
        'provider',
        'amount',
        'currency',
        'bill_number',
        'md5',
        'qr_string',
        'khqr_payload',
        'expires_at',
        'raw_response',
    ];

    /**
     * @return array<string, mixed>
     */
    public static function summary(): array
    {
        $apiUrl = rtrim((string) config('services.rielpay.api_url'), '/');
        $apiKey = trim((string) config('services.rielpay.api_key'));
        $hasKey = $apiKey !== '';
        $issues = self::issues($apiUrl, $hasKey);
        $schema = self::schemaCheck();
        $probe = self::probe($apiUrl, $apiKey);
        $auth = self::authCheck($apiUrl, $apiKey);
        $create = ($auth['valid'] ?? false) ? self::createCheck($apiUrl, $apiKey) : ['ok' => false, 'skipped' => true];

        if ($hasKey && ! ($auth['valid'] ?? false)) {
            $issues[] = $auth['error'] ?? 'RIELPAY_API_KEY is set but rejected by Rielpay (401).';
        }

        foreach ($schema['missing'] ?? [] as $column) {
            $issues[] = "payments.{$column} column is missing — run php artisan migrate on Render.";
        }

        if (! ($create['ok'] ?? false) && ! ($create['skipped'] ?? false)) {
            $issues[] = $create['error'] ?? 'Rielpay test payment create failed.';
        }

        return [
            'api_url' => $apiUrl,
            'currency' => config('services.rielpay.currency', 'KHR'),
            'api_key_configured' => $hasKey,
            'api_key_valid' => $auth['valid'] ?? null,
            'configured' => $issues === []
                && ($probe['ok'] ?? false)
                && ($auth['valid'] ?? false)
                && ($schema['ok'] ?? false)
                && ($create['ok'] ?? false),
            'issues' => $issues,
            'probe' => $probe,
            'auth' => $auth,
            'schema' => $schema,
            'create' => $create,
        ];
    }

    /**
     * @return list<string>
     */
    public static function issues(?string $apiUrl = null, ?bool $hasKey = null): array
    {
        $apiUrl = $apiUrl ?? rtrim((string) config('services.rielpay.api_url'), '/');
        $hasKey = $hasKey ?? trim((string) config('services.rielpay.api_key')) !== '';
        $issues = [];

        if ($apiUrl === '') {
            $issues[] = 'RIELPAY_API_URL is missing on the server.';
        }

        if (! $hasKey) {
            $issues[] = 'RIELPAY_API_KEY is missing on the server.';
        }

        return $issues;
    }

    /**
     * @return array{ok: bool, status?: int, body?: string, error?: string}
     */
    public static function probe(?string $apiUrl = null, ?string $apiKey = null): array
    {
        $apiUrl = $apiUrl ?? rtrim((string) config('services.rielpay.api_url'), '/');
        if ($apiUrl === '') {
            return ['ok' => false, 'error' => 'RIELPAY_API_URL is not configured.'];
        }

        try {
            $response = Http::timeout(10)->get($apiUrl.'/up');
            $body = trim((string) $response->body());

            if ($response->successful() && str_contains(strtolower($body), 'application up')) {
                return [
                    'ok' => true,
                    'status' => $response->status(),
                    'body' => 'Application up',
                ];
            }

            return [
                'ok' => false,
                'status' => $response->status(),
                'body' => $body !== '' ? mb_substr($body, 0, 120) : null,
                'error' => self::explainProbeFailure($response->status(), $body, $apiUrl),
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => 'Could not reach Rielpay gateway: '.$e->getMessage(),
            ];
        }
    }

    /**
     * @return array{valid: bool, status?: int, error?: string}
     */
    public static function authCheck(?string $apiUrl = null, ?string $apiKey = null): array
    {
        $apiUrl = $apiUrl ?? rtrim((string) config('services.rielpay.api_url'), '/');
        $apiKey = $apiKey ?? trim((string) config('services.rielpay.api_key'));

        if ($apiUrl === '') {
            return ['valid' => false, 'error' => 'RIELPAY_API_URL is not configured.'];
        }

        if ($apiKey === '') {
            return ['valid' => false, 'error' => 'RIELPAY_API_KEY is missing on the server.'];
        }

        try {
            $response = Http::timeout(10)
                ->acceptJson()
                ->withHeaders([
                    'Authorization' => 'Bearer '.$apiKey,
                    'X-API-Key' => $apiKey,
                ])
                ->post($apiUrl.'/api/v1/payments/check', ['md5' => '']);

            if ($response->status() === 401) {
                $message = is_string(data_get($response->json(), 'message'))
                    ? (string) data_get($response->json(), 'message')
                    : 'Invalid or revoked API key.';

                return [
                    'valid' => false,
                    'status' => 401,
                    'error' => $message,
                ];
            }

            if (in_array($response->status(), [422, 404], true)) {
                return [
                    'valid' => true,
                    'status' => $response->status(),
                ];
            }

            return [
                'valid' => false,
                'status' => $response->status(),
                'error' => 'Unexpected Rielpay auth response (HTTP '.$response->status().').',
            ];
        } catch (\Throwable $e) {
            return [
                'valid' => false,
                'error' => 'Could not verify Rielpay API key: '.$e->getMessage(),
            ];
        }
    }

    /**
     * @return array{ok: bool, missing?: list<string>, error?: string}
     */
    public static function schemaCheck(): array
    {
        if (! Schema::hasTable('payments')) {
            return ['ok' => false, 'missing' => self::PAYMENT_COLUMNS, 'error' => 'payments table is missing.'];
        }

        $missing = [];
        foreach (self::PAYMENT_COLUMNS as $column) {
            if (! Schema::hasColumn('payments', $column)) {
                $missing[] = $column;
            }
        }

        if ($missing !== []) {
            return ['ok' => false, 'missing' => $missing];
        }

        return ['ok' => true, 'missing' => []];
    }

    /**
     * @return array{ok: bool, status?: int, bill_number?: string, error?: string, skipped?: bool}
     */
    public static function createCheck(?string $apiUrl = null, ?string $apiKey = null): array
    {
        $apiUrl = $apiUrl ?? rtrim((string) config('services.rielpay.api_url'), '/');
        $apiKey = $apiKey ?? trim((string) config('services.rielpay.api_key'));

        if ($apiUrl === '' || $apiKey === '') {
            return ['ok' => false, 'error' => 'RIELPAY_API_URL or RIELPAY_API_KEY is missing.'];
        }

        try {
            $response = Http::timeout(20)
                ->acceptJson()
                ->withHeaders([
                    'Authorization' => 'Bearer '.$apiKey,
                    'X-API-Key' => $apiKey,
                    'Content-Type' => 'application/json',
                ])
                ->post($apiUrl.'/api/v1/payments/create', [
                    'amount' => 4100,
                    'currency' => 'KHR',
                    'bill_number' => 'FS-PROBE-'.now()->format('YmdHis'),
                ]);

            if ($response->status() === 201 && filled(data_get($response->json(), 'qr_string'))) {
                return [
                    'ok' => true,
                    'status' => 201,
                    'bill_number' => (string) data_get($response->json(), 'bill_number'),
                ];
            }

            $message = is_string(data_get($response->json(), 'message'))
                ? (string) data_get($response->json(), 'message')
                : trim($response->body());

            return [
                'ok' => false,
                'status' => $response->status(),
                'error' => $message !== '' ? $message : 'Rielpay create returned HTTP '.$response->status().'.',
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => 'Rielpay create check failed: '.$e->getMessage(),
            ];
        }
    }

    private static function explainProbeFailure(int $status, string $body, string $apiUrl): string
    {
        if ($status === 530 || str_contains($body, '1033')) {
            return 'Rielpay gateway is offline (Cloudflare 530). Point RIELPAY_API_URL at the healthy norng-rielpay host (e.g. https://api-norng-rielpay.fitandsleek.online) or fix the tunnel route for '.$apiUrl.'.';
        }

        if ($status === 401 || $status === 403) {
            return 'Rielpay gateway responded but is not healthy. Check the Rielpay server deployment.';
        }

        return 'Rielpay gateway health check failed (HTTP '.$status.').';
    }
}
