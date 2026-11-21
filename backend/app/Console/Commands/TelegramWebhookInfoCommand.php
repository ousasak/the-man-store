<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class TelegramWebhookInfoCommand extends Command
{
    protected $signature = 'telegram:webhook-info';

    protected $description = 'Show Telegram getWebhookInfo (URL, pending updates, last error)';

    public function handle(): int
    {
        $token = config('services.telegram.bot_token');
        if (! filled($token)) {
            $this->error('TELEGRAM_BOT_TOKEN is not configured.');

            return self::FAILURE;
        }

        $response = Http::get("https://api.telegram.org/bot{$token}/getWebhookInfo");
        if (! $response->successful()) {
            $this->error($response->body());

            return self::FAILURE;
        }

        $result = $response->json('result') ?? [];
        $this->info('Webhook URL: '.($result['url'] ?: '(not set — bot cannot reply to /start)'));
        $this->line('Pending update count: '.($result['pending_update_count'] ?? '?'));
        if (! empty($result['last_error_message'])) {
            $this->warn('Last error: '.$result['last_error_message']);
            $this->line('Last error date: '.date('c', (int) ($result['last_error_date'] ?? 0)));
        }
        if (! empty($result['last_synchronization_error_date'])) {
            $this->warn('Last sync error date: '.date('c', (int) $result['last_synchronization_error_date']));
        }

        $expectedBase = rtrim(trim((string) (config('services.telegram.webhook_url') ?: config('app.url'))), '/');
        $expectedPath = $expectedBase.'/api/telegram/webhook';
        $this->newLine();
        $this->line('Expected webhook base (after telegram:set-webhook):');
        $this->line('  '.$expectedPath);
        $this->line('  (secret in X-Telegram-Bot-Api-Secret-Token header, or legacy …/webhook/{secret} URL)');

        return self::SUCCESS;
    }
}
