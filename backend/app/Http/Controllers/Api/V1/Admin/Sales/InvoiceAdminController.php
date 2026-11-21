<?php

namespace App\Http\Controllers\Api\V1\Admin\Sales;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Services\InvoiceKhqrService;
use App\Services\InvoiceService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use App\Support\BrandLogo;

class InvoiceAdminController extends Controller
{
    public function show(Order $order, InvoiceService $invoiceService, InvoiceKhqrService $invoiceKhqr)
    {
        $invoice = $this->shopInvoice($order, $invoiceService, $invoiceKhqr);

        return response()->json([
            'message' => 'Invoice retrieved successfully',
            'data' => $invoice,
        ]);
    }

    public function downloadPdf(Order $order, InvoiceService $invoiceService, InvoiceKhqrService $invoiceKhqr)
    {
        $invoice = $this->shopInvoice($order, $invoiceService, $invoiceKhqr, true);
        $invoice['logo_url'] = BrandLogo::invoiceLogoUrl();

        $pdf = Pdf::loadView('invoices.bulk', [
            'invoices' => [$invoice],
            'isBulk' => false,
        ])
            ->setOptions([
                'isRemoteEnabled' => true,
                'isHtml5ParserEnabled' => true,
                'defaultFont' => 'DejaVu Sans',
            ])
            ->setHttpContext(stream_context_create([
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                ],
            ]))
            ->setPaper('A4', 'portrait');

        $filename = 'invoice-' . ($invoice['order_number'] ?: $order->id) . '.pdf';
        $content = $pdf->output();

        return response($content, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    public function bulkDownloadPdf(Request $request, InvoiceService $invoiceService, InvoiceKhqrService $invoiceKhqr)
    {
        $validated = $request->validate([
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['integer', 'exists:orders,id'],
        ]);

        $orderIds = collect($validated['order_ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $orders = Order::with(['user', 'items.product', 'shipment'])
            ->whereIn('id', $orderIds)
            ->orderByDesc('id')
            ->get();

        $invoices = $orders->map(function (Order $order) use ($invoiceService, $invoiceKhqr) {
            $invoice = $this->shopInvoice($order, $invoiceService, $invoiceKhqr, true);
            $invoice['logo_url'] = BrandLogo::invoiceLogoUrl();
            return $invoice;
        })->values()->all();

        $pdf = Pdf::loadView('invoices.bulk', [
            'invoices' => $invoices,
            'isBulk' => true,
        ])
            ->setOptions([
                'isRemoteEnabled' => true,
                'isHtml5ParserEnabled' => true,
                'defaultFont' => 'DejaVu Sans',
            ])
            ->setHttpContext(stream_context_create([
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                ],
            ]))
            ->setPaper('A4', 'portrait');

        $filename = 'invoices-bulk-' . now()->format('Ymd_His') . '.pdf';
        $content = $pdf->output();

        return response($content, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function shopInvoice(Order $order, InvoiceService $invoiceService, InvoiceKhqrService $invoiceKhqr, bool $withImage = false): array
    {
        $invoice = $invoiceService->buildOrderInvoiceData($order, InvoiceService::AUDIENCE_SHOP);

        return $invoiceKhqr->attach($order, $invoice, $withImage);
    }
}
