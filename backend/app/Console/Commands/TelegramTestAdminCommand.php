<?php

namespace App\Console\Commands;

use App\Services\TelegramService;
use Illuminate\Console\Command;

class TelegramTestAdminCommand extends Command
{
    protected $signature = 'telegram:test-admin';

    protected $description = 'Send a test message with buttons to TELEGRAM_ADMIN_CHAT_ID';

    public function handle(TelegramService $telegram): int
    {
        $result = $telegram->sendAdminTestMessage();

        if ($result['ok']) {
            $this->info($result['message']);

            return self::SUCCESS;
        }

        $this->error($result['message']);

        return self::FAILURE;
    }
}
