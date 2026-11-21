<?php

namespace App\Listeners;

use App\Events\OrderPaidEvent;
use App\Services\Telegram\TelegramNotificationService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class SendTelegramOrderAlertListener implements ShouldQueue
{
    use InteractsWithQueue;

    public function __construct(
        protected TelegramNotificationService $telegramNotificationService
    ) {}

    public function handle(OrderPaidEvent $event): void
    {
        try {
            $this->telegramNotificationService->notifyNewOrder($event->order);
        } catch (\Throwable $e) {
            Log::error("Failed to send Telegram alert for order #{$event->order->id}: " . $e->getMessage());
        }
    }
}
