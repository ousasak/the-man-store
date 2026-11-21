<?php

namespace App\Listeners;

use App\Events\OrderPaidEvent;
use App\Services\InvoiceService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class GenerateInvoicePdfListener implements ShouldQueue
{
    use InteractsWithQueue;

    public function __construct(
        protected InvoiceService $invoiceService
    ) {}

    public function handle(OrderPaidEvent $event): void
    {
        try {
            $order = $event->order;
            $invoiceData = $this->invoiceService->buildOrderInvoiceData($order);

            $pdf = Pdf::loadView('invoices.bulk', [
                'invoices' => [$invoiceData],
                'audience' => InvoiceService::AUDIENCE_CUSTOMER,
            ]);

            $fileName = "invoices/receipt-order-{$order->id}.pdf";
            Storage::disk('local')->put($fileName, $pdf->output());

            Log::info("Asynchronous invoice PDF generated for order #{$order->id} at {$fileName}");
        } catch (\Throwable $e) {
            Log::error("Failed to generate asynchronous invoice PDF for order #{$event->order->id}: " . $e->getMessage());
        }
    }
}
