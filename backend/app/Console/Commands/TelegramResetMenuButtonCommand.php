<?php

namespace App\Console\Commands;

use App\Models\TelegramUser;
use App\Services\TelegramInboxService;
use App\Services\TelegramService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class TelegramResetMenuButtonCommand extends Command
{
    protected $signature = 'telegram:reset-menu-button {--push : Send guest catalog to known private chats}';

    protected $description = 'Set Shop Now Mini App, bot commands, and optionally push the guest catalog';

    public function handle(TelegramService $telegram, TelegramInboxService $inbox): int
    {
        $token = trim((string) config('services.telegram.bot_token'));
        if ($token === '') {
            $this->error('TELEGRAM_BOT_TOKEN is not configured.');

            return self::FAILURE;
        }

        $this->dump($token, 'getChatMenuButton');
        $this->dump($token, 'getWebhookInfo');

        $shopUrl = rtrim((string) config('app.frontend_url', 'https://themanstore.com'), '/');
        $shopNow = Http::timeout(15)->post("https://api.telegram.org/bot{$token}/setChatMenuButton", [
            'menu_button' => $telegram->shopNowMenuButton(),
        ]);
        $this->line('setChatMenuButton web_app: '.$shopNow->body());

        $commands = $this->botPost($token, 'setMyCommands', [
            'commands' => json_encode([
                ['command' => 'start', 'description' => 'Open guest shop menu'],
                ['command' => 'shop', 'description' => 'Browse products (guest OK)'],
                ['command' => 'cart', 'description' => 'View cart (guest OK)'],
                ['command' => 'search', 'description' => 'Search products'],
                ['command' => 'login', 'description' => 'Login or register with your phone'],
                ['command' => 'register', 'description' => 'Create a customer account with your phone'],
                ['command' => 'help', 'description' => 'Help'],
            ]),
        ]);
        $this->line('setMyCommands: '.$commands->body());

        $this->botPost($token, 'setMyShortDescription', [
            'short_description' => 'Tap Shop Now or send /start to browse as a guest. Login or register with your phone.',
        ]);

        $restored = 0;
        $chatIds = TelegramUser::query()
            ->where('chat_id', '>', 0)
            ->orderByDesc('id')
            ->limit(80)
            ->pluck('chat_id')
            ->unique()
            ->filter();

        foreach ($chatIds as $chatId) {
            if ($telegram->setChatMenuButton((int) $chatId, $telegram->shopNowMenuButton())) {
                $restored++;
            }
        }
        $this->info("Shop Now restored for {$restored} chat(s).");

        if ($this->option('push')) {
            $this->pushGuestCatalog($telegram, $inbox, $shopUrl);
        }

        $this->dump($token, 'getChatMenuButton');

        return self::SUCCESS;
    }

    private function pushGuestCatalog(TelegramService $telegram, TelegramInboxService $inbox, string $shopUrl): void
    {
        $keyboard = [
            'keyboard' => [
                [['text' => '🛍 Collection'], ['text' => '🛒 Cart']],
                [['text' => '🔐 Login / Register'], ['text' => '❓ Help']],
            ],
            'resize_keyboard' => true,
        ];

        $chatIds = TelegramUser::query()
            ->where('chat_id', '>', 0)
            ->orderByDesc('id')
            ->limit(20)
            ->pluck('chat_id')
            ->unique()
            ->filter();

        $sent = 0;
        foreach ($chatIds as $chatId) {
            $welcome = $telegram->sendMessage(
                (string) $chatId,
                $inbox->welcomeHtml('guest'),
                $keyboard,
                'HTML'
            );
            $catalog = $telegram->sendMessage(
                (string) $chatId,
                $inbox->productsHtml(),
                $inbox->productsKeyboard($inbox->productsCatalog()['products'], 'guest'),
                'HTML'
            );
            if ($welcome || $catalog) {
                $sent++;
            }
        }

        $this->info("Guest catalog pushed to {$sent} private chat(s).");
    }

    private function dump(string $token, string $method): void
    {
        $response = Http::timeout(15)->get("https://api.telegram.org/bot{$token}/{$method}");
        $this->line("==== {$method} ====");
        $this->line($response->body());
    }

    private function botPost(string $token, string $method, array $payload)
    {
        return Http::asForm()->timeout(15)->post("https://api.telegram.org/bot{$token}/{$method}", $payload);
    }
}
