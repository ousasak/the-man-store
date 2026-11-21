<?php

namespace App\Observers;

use App\Models\Shipment;
use App\Services\TelegramService;
use Illuminate\Support\Facades\DB;

class ShipmentObserver
{
    public function __construct(private TelegramService $telegramService)
    {
    }

    public function updated(Shipment $shipment): void
    {
        if (! $shipment->wasChanged('status')) {
            return;
        }

        $shipmentId = (int) $shipment->id;

        if ($shipment->status === 'delivered') {
            $shipment->loadMissing('order');
            if ($shipment->order && $shipment->order->status !== 'completed') {
                $shipment->order->update(['status' => 'completed']);
            }
        }

        // Send customer Telegram after the DB lock/transaction commits so the alert is not dropped.
        DB::afterCommit(function () use ($shipmentId) {
            $fresh = Shipment::query()->with(['order.user', 'order.items.product'])->find($shipmentId);
            if ($fresh) {
                $this->telegramService->notifyShipmentStatusChanged($fresh);
            }
        });
    }
}
