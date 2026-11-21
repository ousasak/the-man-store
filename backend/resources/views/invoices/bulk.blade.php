@php
    /* ───────────────────────────────────────────────────────────────────────────
     *  BRAND — kept in sync with exports/table.blade.php and reports/*.blade.php
     * ─────────────────────────────────────────────────────────────────────── */
    $brandName      = 'THE MAN STORE';
    $logoUrl        = \App\Support\BrandLogo::invoiceLogoUrl();
    $kmFontRegular  = \App\Support\PdfFonts::regularDataUri();
    $kmFontBold     = \App\Support\PdfFonts::boldDataUri();
    $kmFontFamily   = \App\Support\PdfFonts::khmerFamily();

    $headerNavy     = '#0F1923';
    $headerNavySoft = '#1B2638';
    $textPrimary    = '#0F172A';
    $textMuted      = '#64748B';
    $borderSoft     = '#E5E9F0';
    $rowAlt         = '#F8FAFC';

    $generatedAt    = now()->format('M j, Y · g:i A');
@endphp
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <title>{{ ($isBulk ?? false) ? 'Invoices' : 'Invoice' }}</title>
    <style>
        @if ($kmFontRegular)
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 400; font-style: normal; src: url("{{ $kmFontRegular }}") format("truetype"); }
        @endif
        @if ($kmFontBold)
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 700; font-style: normal; src: url("{{ $kmFontBold }}") format("truetype"); }
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 800; font-style: normal; src: url("{{ $kmFontBold }}") format("truetype"); }
        @endif

        /* Full-bleed page so the navy header touches the paper edge.
         * Each invoice carries its own header so multi-invoice bulk PDFs
         * still get a branded banner on every page. */
        @page { margin: 0; }

        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            color: {{ $textPrimary }};
            font-size: 10px;
            line-height: 1.45;
        }
        h1, h2, h3, .display { font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif; margin: 0; }

        /* ── Per-invoice page wrapper ─────────────────────────────────────── */
        .invoice-page {
            position: relative;
            page-break-inside: avoid;
        }
        .invoice-page.page-break { page-break-after: always; }
        .content { padding: 14px 24px 24px 24px; position: relative; z-index: 1; }

        /* ── Watermark (PAID / UNPAID) ────────────────────────────────────── */
        .watermark {
            position: absolute;
            top: 45%;
            left: 18%;
            transform: rotate(-28deg);
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 96px;
            font-weight: 800;
            letter-spacing: 6px;
            z-index: 0;
            pointer-events: none;
        }
        .watermark.paid   { color: rgba(22, 163, 74, 0.08); }
        .watermark.unpaid { color: rgba(220, 38, 38, 0.08); }

        /* ── Header bar (full-bleed) ───────────────────────────────────────── */
        .brand-header {
            background: {{ $headerNavy }};
            color: #ffffff;
            padding: 16px 24px;
            margin: 0 0 14px 0;
        }
        .brand-header table { width: 100%; border-collapse: collapse; }
        .brand-header td { vertical-align: middle; padding: 0; }
        .brand-header .logo-cell { width: 196px; }
        .brand-header .logo-cell img {
            display: block;
            width: 180px;
            height: auto;
            border-radius: 8px;
            background: #6e8b7e;
        }
        .brand-header .text-cell { padding-left: 18px; }
        .brand-header .doc-title-h {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-weight: 800;
            font-size: 22px;
            letter-spacing: 0.4px;
            margin: 0 0 4px 0;
            color: #ffffff;
        }
        .brand-header .doc-subtitle-h {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 10px;
            font-weight: 400;
            color: rgba(255,255,255,0.72);
            margin: 0;
            letter-spacing: 0.2px;
        }
        .brand-header .right-cell { text-align: right; }
        .brand-header .pill-doc {
            display: inline-block;
            background: {{ $headerNavySoft }};
            color: #ffffff;
            border: 1px solid rgba(255,255,255,0.10);
            border-radius: 14px;
            padding: 4px 12px;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .brand-header .pill-doc.paid {
            background: #16A34A;
            border-color: rgba(255,255,255,0.18);
        }
        .brand-header .pill-doc.unpaid {
            background: #DC2626;
            border-color: rgba(255,255,255,0.18);
        }
        .brand-header .gen-line {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 9px;
            color: rgba(255,255,255,0.62);
            margin-top: 6px;
            letter-spacing: 0.2px;
        }

        /* ── Bill-to / Invoice details cards ───────────────────────────────── */
        .meta-grid { width: 100%; border-collapse: separate; border-spacing: 10px 0; margin-bottom: 12px; }
        .meta-grid td { vertical-align: top; width: 50%; padding: 0; }

        .info-card {
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            padding: 12px 14px;
            background: #FFFFFF;
        }
        .info-card.accent-blue   { border-top: 3px solid #2563EB; }
        .info-card.accent-amber  { border-top: 3px solid #F59E0B; }
        .eyebrow {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.1px;
            color: {{ $textMuted }};
            margin: 0 0 6px 0;
        }
        .bill-name {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 15px;
            font-weight: 800;
            color: {{ $textPrimary }};
            margin: 0 0 4px 0;
        }
        .bill-line {
            font-size: 9.5px;
            color: {{ $textPrimary }};
            margin: 0 0 2px 0;
        }
        .bill-line.muted { color: {{ $textMuted }}; }

        table.meta-kv { width: 100%; border-collapse: collapse; }
        table.meta-kv td {
            padding: 3px 0;
            font-size: 9.5px;
            vertical-align: top;
        }
        table.meta-kv td.k { color: {{ $textMuted }}; width: 42%; }
        table.meta-kv td.v { color: {{ $textPrimary }}; font-weight: 700; text-align: right; }

        /* ── Items table ───────────────────────────────────────────────────── */
        table.report {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            overflow: hidden;
        }
        table.report thead { display: table-header-group; }
        table.report tr { page-break-inside: avoid; }
        table.report th {
            background: {{ $headerNavy }};
            color: #ffffff;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            padding: 9px 9px;
            text-align: left;
            border-right: 1px solid {{ $headerNavySoft }};
        }
        table.report th:last-child { border-right: 0; }
        table.report td {
            padding: 7px 9px;
            border-top: 1px solid {{ $borderSoft }};
            border-right: 1px solid {{ $borderSoft }};
            background: #ffffff;
            color: {{ $textPrimary }};
            vertical-align: middle;
            font-size: 10px;
        }
        table.report td:last-child { border-right: 0; }
        table.report tbody tr:nth-child(even) td { background: {{ $rowAlt }}; }
        table.report td.num,
        table.report th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        table.report .sku { color: {{ $textMuted }}; font-size: 9px; font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif; }
        table.report td.empty {
            text-align: center;
            color: {{ $textMuted }};
            font-style: italic;
            padding: 14px 8px;
        }

        /* ── Totals + QR footer ────────────────────────────────────────────── */
        .footer-grid { width: 100%; border-collapse: separate; border-spacing: 12px 0; margin-top: 12px; }
        .footer-grid > tbody > tr > td { vertical-align: top; padding: 0; }
        .footer-grid .qr-cell { width: 170px; }

        .qr-card {
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            padding: 10px;
            background: #ffffff;
            text-align: center;
        }
        .qr-card img {
            display: block;
            width: 130px;
            height: 130px;
            margin: 0 auto 6px auto;
        }
        .qr-card .qr-empty {
            width: 130px;
            height: 130px;
            margin: 0 auto 6px auto;
            border: 1px dashed #CBD5E1;
            color: {{ $textMuted }};
            font-size: 9px;
            display: table-cell;
            vertical-align: middle;
            text-align: center;
        }
        .qr-card .qr-label {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 8px;
            color: {{ $textMuted }};
            text-transform: uppercase;
            letter-spacing: 0.8px;
            margin: 0;
        }
        .qr-card .qr-code {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 9px;
            color: {{ $textPrimary }};
            font-weight: 700;
            margin: 2px 0 0 0;
            word-break: break-all;
        }

        table.totals {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            overflow: hidden;
        }
        table.totals td {
            padding: 8px 12px;
            font-size: 10.5px;
            border-top: 1px solid {{ $borderSoft }};
            background: #ffffff;
        }
        table.totals tr:first-child td { border-top: 0; }
        table.totals td.k { color: {{ $textMuted }}; }
        table.totals td.v { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
        table.totals tr.grand td {
            background: {{ $headerNavy }};
            color: #ffffff;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 0.4px;
        }
        table.totals tr.grand td.k { color: rgba(255,255,255,0.72); }

        /* ── Footnote ──────────────────────────────────────────────────────── */
        .footnote {
            margin-top: 14px;
            font-size: 8.5px;
            color: {{ $textMuted }};
            text-align: center;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            letter-spacing: 0.4px;
        }
        .footnote .brand {
            color: {{ $textPrimary }};
            font-weight: 800;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            letter-spacing: 1.2px;
        }

        .cut {
            margin-top: 10px;
            border-top: 2px dashed #94A3B8;
            text-align: center;
            color: {{ $textMuted }};
            font-size: 9px;
            padding-top: 4px;
            letter-spacing: 1px;
            text-transform: uppercase;
        }

        .pickup-box {
            margin-top: 16px;
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            padding: 12px 14px;
            background: #f8fafc;
        }
        .pickup-box .pickup-title {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0.6px;
            color: {{ $textPrimary }};
            margin: 0 0 4px 0;
        }
        .pickup-box .pickup-sub {
            font-size: 9px;
            color: {{ $textMuted }};
            margin: 0 0 10px 0;
        }
        table.pickup-fields td {
            padding: 6px 0;
            font-size: 10px;
            vertical-align: bottom;
        }
        table.pickup-fields td.k {
            width: 28%;
            color: {{ $textMuted }};
            font-weight: 600;
        }
        table.pickup-fields td.line {
            border-bottom: 1px solid #94A3B8;
            min-height: 18px;
            color: {{ $textPrimary }};
            font-weight: 600;
        }
        table.pickup-sign td {
            padding: 10px 0 4px 0;
            font-size: 9px;
            color: {{ $textMuted }};
            vertical-align: top;
        }
        table.pickup-sign td.sig-line {
            border-bottom: 1px solid #64748b;
            min-height: 28px;
        }

        .khqr-box {
            margin-top: 14px;
            border: 1.5px solid #C0272D;
            border-radius: 8px;
            padding: 12px 14px;
            background: #FFF8F8;
        }
        .khqr-box table { width: 100%; border-collapse: collapse; }
        .khqr-box td { vertical-align: middle; }
        .khqr-box .qr-cell { width: 150px; text-align: center; }
        .khqr-box .qr-cell img {
            width: 132px;
            height: 132px;
            display: block;
            margin: 0 auto;
            background: #fff;
            border: 1px solid #E5E9F0;
            border-radius: 6px;
            padding: 4px;
        }
        .khqr-box .khqr-kicker {
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.8px;
            color: #C0272D;
            margin: 0 0 4px 0;
            text-transform: uppercase;
        }
        .khqr-box .khqr-title {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 13px;
            font-weight: 800;
            margin: 0 0 4px 0;
            color: {{ $textPrimary }};
        }
        .khqr-box .khqr-copy {
            font-size: 9px;
            color: {{ $textMuted }};
            margin: 0 0 8px 0;
            line-height: 1.45;
        }
        .khqr-box .khqr-amt {
            font-size: 16px;
            font-weight: 800;
            margin: 0;
            color: {{ $textPrimary }};
        }
        .khqr-box .khqr-usd {
            font-size: 10px;
            color: {{ $textMuted }};
            margin: 2px 0 0 0;
        }
        .khqr-paid {
            margin-top: 14px;
            border: 1px solid #86EFAC;
            background: #F0FDF4;
            border-radius: 8px;
            padding: 10px 14px;
            font-size: 11px;
            font-weight: 700;
            color: #166534;
            text-align: center;
        }
    </style>
</head>
<body>
@foreach ($invoices as $index => $invoice)
    @php
        $isPaid       = strcasecmp((string) ($invoice['payment_status'] ?? ''), 'PAID') === 0;
        $statusClass  = $isPaid ? 'paid' : 'unpaid';
        $pageBreak    = ($isBulk ?? false) && $index < count($invoices) - 1;
        $orderRef     = $invoice['order_number'] ?: $invoice['order_id'];
        $customer     = $invoice['customer'] ?? [];
        $items        = $invoice['items'] ?? [];
        $audience     = $invoice['invoice_audience'] ?? 'customer';
        $isInternal   = in_array($audience, ['shop', 'driver'], true);
        $isShop       = $audience === 'shop';
        $docTitle     = $invoice['doc_title'] ?? 'Invoice';
        $docTitleKm   = $invoice['doc_title_km'] ?? 'វិក័យបត្រ';
    @endphp
    <section class="invoice-page {{ $pageBreak ? 'page-break' : '' }}">

        <div class="watermark {{ $statusClass }}">{{ $invoice['payment_status'] ?? '' }}</div>

        <div class="brand-header">
            <table>
                <tr>
                    <td class="logo-cell"><img src="{{ $invoice['logo_url'] ?? $logoUrl }}" alt="{{ $brandName }}"></td>
                    <td class="text-cell">
                        <p class="doc-title-h">{{ $docTitle }}</p>
                        <p class="doc-subtitle-h">{{ $docTitleKm }} · #{{ $invoice['invoice_number'] }} &nbsp;·&nbsp; {{ $invoice['invoice_date'] }}</p>
                    </td>
                    <td class="right-cell">
                        <span class="pill-doc {{ $statusClass }}">{{ $invoice['payment_status'] ?? '—' }}</span>
                        <div class="gen-line">Order #{{ $orderRef }}</div>
                    </td>
                </tr>
            </table>
        </div>

        <div class="content">

            {{-- ── Bill to / Invoice details ─────────────────────────────────── --}}
            <table class="meta-grid">
                <tr>
                    <td>
                        <div class="info-card accent-blue">
                            <p class="eyebrow">Bill to</p>
                            <p class="bill-name">{{ $customer['name'] ?? '—' }}</p>
                            @if (!empty($customer['phone']) && $customer['phone'] !== '-')
                                <p class="bill-line">{{ $customer['phone'] }}</p>
                            @endif
                            @if (!empty($customer['email']))
                                <p class="bill-line muted">{{ $customer['email'] }}</p>
                            @endif
                            @if (!empty($customer['full_address']) && $customer['full_address'] !== '-')
                                <p class="bill-line">{{ $customer['full_address'] }}</p>
                            @endif
                        </div>
                    </td>
                    <td>
                        <div class="info-card accent-amber">
                            <p class="eyebrow">Invoice details</p>
                            <table class="meta-kv">
                                <tr>
                                    <td class="k">Invoice no.</td>
                                    <td class="v">{{ $invoice['invoice_number'] }}</td>
                                </tr>
                                <tr>
                                    <td class="k">Invoice date</td>
                                    <td class="v">{{ $invoice['invoice_date'] }}</td>
                                </tr>
                                <tr>
                                    <td class="k">Order reference</td>
                                    <td class="v">#{{ $orderRef }}</td>
                                </tr>
                                @if (!empty($invoice['tracking_code']))
                                    <tr>
                                        <td class="k">Tracking code</td>
                                        <td class="v">{{ $invoice['tracking_code'] }}</td>
                                    </tr>
                                @endif
                                @if ($isInternal && !empty($invoice['courier_provider']))
                                    <tr>
                                        <td class="k">Courier</td>
                                        <td class="v">{{ $invoice['courier_provider'] }}</td>
                                    </tr>
                                @endif
                                @if ($isInternal && !empty($invoice['is_cod']))
                                    <tr>
                                        <td class="k">Payment</td>
                                        <td class="v">COD — Cash on delivery</td>
                                    </tr>
                                @endif
                            </table>
                        </div>
                    </td>
                </tr>
            </table>

            {{-- ── Items table ─────────────────────────────────────────────── --}}
            <table class="report">
                <thead>
                    <tr>
                        <th>Product</th>
                        <th class="num" style="width:7%;">Qty</th>
                        <th class="num" style="width:13%;">Unit price</th>
                        <th class="num" style="width:13%;">Discount</th>
                        <th class="num" style="width:13%;">Shipping</th>
                        <th class="num" style="width:16%;">Line total</th>
                    </tr>
                </thead>
                <tbody>
                    @forelse ($items as $item)
                        <tr>
                            <td>
                                <div>{{ $item['product_name'] ?? '—' }}</div>
                                @if (!empty($item['sku']))
                                    <div class="sku">SKU · {{ $item['sku'] }}</div>
                                @endif
                            </td>
                            <td class="num">{{ number_format((int) ($item['quantity'] ?? 0)) }}</td>
                            <td class="num">${{ number_format((float) ($item['price'] ?? 0), 2) }}</td>
                            <td class="num">${{ number_format((float) ($item['discount'] ?? 0), 2) }}</td>
                            <td class="num">${{ number_format((float) ($item['shipping_fee'] ?? 0), 2) }}</td>
                            <td class="num">${{ number_format((float) ($item['grand_total'] ?? $item['line_total'] ?? 0), 2) }}</td>
                        </tr>
                    @empty
                        <tr>
                            <td class="empty" colspan="6">No line items on this invoice</td>
                        </tr>
                    @endforelse
                </tbody>
            </table>

            {{-- ── Totals ────────────────────────────────────────────────────── --}}
            <table class="footer-grid">
                <tr>
                    <td colspan="2">
                        <table class="totals">
                            <tr>
                                <td class="k">Subtotal</td>
                                <td class="v">${{ number_format((float) $invoice['subtotal'], 2) }}</td>
                            </tr>
                            <tr>
                                <td class="k">Discount</td>
                                <td class="v">−${{ number_format((float) $invoice['discount'], 2) }}</td>
                            </tr>
                            <tr>
                                <td class="k">Shipping</td>
                                <td class="v">${{ number_format((float) $invoice['shipping_fee'], 2) }}</td>
                            </tr>
                            <tr class="grand">
                                <td class="k">Grand total</td>
                                <td class="v">${{ number_format((float) $invoice['grand_total'], 2) }}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>

            @php
                $payQr = $invoice['payment_qr'] ?? null;
                $payQrPending = is_array($payQr) && ($payQr['status'] ?? '') === 'pending' && !empty($payQr['qr_image']);
                $payQrPaid = is_array($payQr) && ($payQr['status'] ?? '') === 'paid';
            @endphp

            @if ($payQrPending)
                <div class="khqr-box">
                    <table>
                        <tr>
                            <td class="qr-cell">
                                <img src="{{ $payQr['qr_image'] }}" alt="KHQR">
                            </td>
                            <td>
                                <p class="khqr-kicker">KHQR · Bakong</p>
                                <p class="khqr-title">ស្កេនដើម្បីបង់ទៅហាង</p>
                                <p class="khqr-copy">
                                    Scan with any Bakong bank app to pay the shop in full.
                                    This QR stays valid until this invoice is paid — then the sale is complete.
                                    <br>QR នេះមិនផុតកំណត់ទេ ទាល់តែបង់រួច។
                                </p>
                                <p class="khqr-amt">{{ $payQr['amount_label'] ?? '' }}</p>
                                @if (!empty($payQr['usd_label']))
                                    <p class="khqr-usd">{{ $payQr['usd_label'] }}</p>
                                @endif
                            </td>
                        </tr>
                    </table>
                </div>
            @elseif ($payQrPaid)
                <div class="khqr-paid">PAID · បានបង់រួច — payment QR is closed</div>
            @endif

            @if ($isShop)
                <div class="pickup-box">
                    <p class="pickup-title">Courier pickup · អ្នកដឹកមកយកពីហាង</p>
                    <p class="pickup-sub">Courier signs on paper; shop keeps a copy and records name/phone in admin.</p>
                    <table class="pickup-fields" style="width:100%;">
                        <tr>
                            <td class="k">Name / ឈ្មោះ</td>
                            <td class="line">{{ $invoice['picked_up_by_name'] ?? '' }}</td>
                        </tr>
                        <tr>
                            <td class="k">Phone / ទូរស័ព្ធ</td>
                            <td class="line">{{ $invoice['picked_up_by_phone'] ?? '' }}</td>
                        </tr>
                        <tr>
                            <td class="k">Date / កាលបរិច្ឆេទ</td>
                            <td class="line">{{ $invoice['picked_up_at'] ?? '' }}</td>
                        </tr>
                    </table>
                    <table class="pickup-sign" style="width:100%; margin-top:8px;">
                        <tr>
                            <td style="width:50%; padding-right:12px;">
                                <div class="sig-line"></div>
                                Courier signature / ហត្ថលេខា
                            </td>
                            <td style="width:50%;">
                                <div class="sig-line"></div>
                                Shop staff / បុគ្គលិកហាង
                            </td>
                        </tr>
                    </table>
                </div>
            @endif

            <div class="footnote">
                <span class="brand">{{ $brandName }}</span>
                &nbsp;·&nbsp; Thank you for shopping with us &nbsp;·&nbsp;
                Generated on {{ $generatedAt }}
            </div>

            @if ($isBulk ?? false)
                <div class="cut">— cut here —</div>
            @endif
        </div>
    </section>
@endforeach
</body>
</html>
