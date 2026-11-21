<?php

namespace App\Console\Commands;

use App\Services\RielpayApi;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class RielpayDiagnoseCommand extends Command
{
    protected $signature = 'rielpay:diagnose';

    protected $description = 'Check Rielpay API + KHQR deeplink configuration';

    public function handle(RielpayApi $rielpayApi): int
    {
        $baseUrl = rtrim((string) config('services.rielpay.api_url'), '/');
        $apiKey = (string) config('services.rielpay.api_key');
        $iconUrl = (string) config('services.rielpay.deeplink_icon_url');
        $callback = (string) config('services.rielpay.deeplink_callback');

        $this->info('Rielpay configuration');
        $this->line('  RIELPAY_API_URL → '.($baseUrl !== '' ? $baseUrl : '(missing)'));
        $this->line('  RIELPAY_API_KEY → '.($apiKey !== '' ? 'set ('.strlen($apiKey).' chars)' : 'MISSING'));
        $this->line('  RIELPAY_DEEPLINK_ICON_URL → '.($iconUrl !== '' ? $iconUrl : '(default: FRONTEND_URL/logo-circle.png)'));
        $this->line('  RIELPAY_DEEPLINK_CALLBACK → '.($callback !== '' ? $callback : 'themanstore://payment/callback'));

        if ($baseUrl === '') {
            $this->error('Set RIELPAY_API_URL in environment.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Rielpay health');
        try {
            $health = Http::timeout(15)->get($baseUrl.'/up');
            $this->line('  GET /up → HTTP '.$health->status().($health->successful() ? ' OK' : ''));
        } catch (\Throwable $e) {
            $this->error('  Unreachable: '.$e->getMessage());

            return self::FAILURE;
        }

        if ($apiKey === '') {
            $this->newLine();
            $this->error('RIELPAY_API_KEY is missing — KHQR create + bank deeplink will fail.');
            $this->comment('Copy the API key from your Rielpay merchant dashboard into Render Environment.');

            return self::FAILURE;
        }

        $this->newLine();
        $this->info('Deeplink icon URL');
        $resolvedIcon = $iconUrl !== ''
            ? $iconUrl
            : rtrim((string) config('app.frontend_url', config('app.url')), '/').'/logo-circle.png';
        $this->line('  '.$resolvedIcon);
        try {
            $icon = Http::timeout(10)->head($resolvedIcon);
            $this->line('  HTTP '.$icon->status().($icon->successful() ? ' OK' : ' (icon must be public HTTPS)'));
        } catch (\Throwable $e) {
            $this->warn('  Could not reach icon URL: '.$e->getMessage());
        }

        $this->newLine();
        $this->comment('Deeplink is tested when a customer taps Pay in the banking app (POST /api/payments/bakong/deeplink/{payment}).');
        $this->comment('If deeplink fails with 405, redeploy Rielpay with POST /api/v1/payments/deeplink enabled.');

        return self::SUCCESS;
    }
}
