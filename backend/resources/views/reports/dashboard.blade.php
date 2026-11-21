@php
    /* ───────────────────────────────────────────────────────────────────────────
     *  BRAND — kept in sync with exports/table.blade.php (Stock & Inventory PDF)
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

    $rangeLabel    = $from . '  to  ' . $to;
    $title         = 'Dashboard Summary Report';
    $subtitle      = 'Date From: ' . $from . '  |  Date To: ' . $to . '  ·  របាយការណ៍សង្ខេប';
@endphp
<!DOCTYPE html>
<html lang="km">
<head>
    <meta charset="UTF-8">
    <title>{{ $title }}</title>
    <style>
        @if ($kmFontRegular)
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 400; font-style: normal; src: url("{{ $kmFontRegular }}") format("truetype"); }
        @endif
        @if ($kmFontBold)
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 700; font-style: normal; src: url("{{ $kmFontBold }}") format("truetype"); }
        @font-face { font-family: '{{ $kmFontFamily }}'; font-weight: 800; font-style: normal; src: url("{{ $kmFontBold }}") format("truetype"); }
        @endif

        /* Full-bleed page so the navy header touches the paper edge. */
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
        .content { padding: 14px 24px 24px 24px; }

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
            font-weight: 500;
            letter-spacing: 1px;
            text-transform: uppercase;
        }
        .brand-header .gen-line {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 9px;
            color: rgba(255,255,255,0.62);
            margin-top: 6px;
            letter-spacing: 0.2px;
        }

        /* ── Metric cards ──────────────────────────────────────────────────── */
        .metrics { width: 100%; border-collapse: separate; border-spacing: 8px 0; margin-bottom: 12px; }
        .metrics td { vertical-align: top; width: 25%; }
        .metric-card {
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            padding: 10px 12px 12px 12px;
            background: #FFFFFF;
        }
        .metric-card .metric-label {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1.1px;
            color: {{ $textMuted }};
            margin: 0 0 6px 0;
        }
        .metric-card .metric-value {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-size: 22px;
            font-weight: 800;
            color: {{ $textPrimary }};
            margin: 0;
            letter-spacing: 0.2px;
        }
        .metric-card .metric-hint {
            font-size: 9px;
            color: {{ $textMuted }};
            margin: 4px 0 0 0;
        }
        .metric-card.accent-blue   { border-top: 3px solid #2563EB; }
        .metric-card.accent-green  { border-top: 3px solid #16A34A; }
        .metric-card.accent-amber  { border-top: 3px solid #F59E0B; }
        .metric-card.accent-purple { border-top: 3px solid #7C3AED; }

        /* ── Breakdown sections ────────────────────────────────────────────── */
        .section-title {
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-weight: 800;
            font-size: 12px;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            color: {{ $textPrimary }};
            margin: 14px 0 8px 0;
        }

        table.kv {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border: 1px solid {{ $borderSoft }};
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 12px;
        }
        table.kv th {
            background: {{ $headerNavy }};
            color: #ffffff;
            font-family: '{{ $kmFontFamily }}', 'DejaVu Sans', sans-serif;
            font-weight: 700;
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 0.8px;
            padding: 8px 10px;
            text-align: left;
            border-right: 1px solid {{ $headerNavySoft }};
        }
        table.kv th:last-child { border-right: 0; }
        table.kv td {
            padding: 7px 10px;
            border-top: 1px solid {{ $borderSoft }};
            border-right: 1px solid {{ $borderSoft }};
            background: #ffffff;
            color: {{ $textPrimary }};
            vertical-align: middle;
            font-size: 10px;
        }
        table.kv td:last-child { border-right: 0; }
        table.kv tbody tr:nth-child(even) td { background: {{ $rowAlt }}; }
        table.kv td.label { color: {{ $textMuted }}; width: 45%; }
        table.kv td.num   { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; font-weight: 700; }

        /* Two columns of kv tables side-by-side */
        .two-col { width: 100%; border-collapse: separate; border-spacing: 10px 0; }
        .two-col > tbody > tr > td { width: 50%; vertical-align: top; padding: 0; }

        /* ── Cell chrome (status pills) ────────────────────────────────────── */
        .pill {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 0.2px;
            white-space: nowrap;
        }
        .pill-green { background: #DCFCE7; color: #166534; }
        .pill-amber { background: #FEF3C7; color: #B45309; }
        .pill-red   { background: #FEE2E2; color: #B91C1C; }
        .pill-gray  { background: #E2E8F0; color: #475569; }
        .pill-blue  { background: #DBEAFE; color: #1D4ED8; }

        /* ── Footer ───────────────────────────────────────────────────────── */
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
    </style>
</head>
<body>
    <div class="brand-header">
        <table>
            <tr>
                <td class="logo-cell"><img src="{{ $logoUrl }}" alt="{{ $brandName }}"></td>
                <td class="text-cell">
                    <p class="doc-title-h">{{ $title }}</p>
                    <p class="doc-subtitle-h">{{ $subtitle }}</p>
                </td>
                <td class="right-cell">
                    <span class="pill-doc">Dashboard</span>
                    <div class="gen-line">Generated {{ $generatedAt }}</div>
                </td>
            </tr>
        </table>
    </div>

    <div class="content">

        {{-- ── Top-line metrics ─────────────────────────────────────────────── --}}
        <table class="metrics">
            <tr>
                <td>
                    <div class="metric-card accent-green">
                        <p class="metric-label">Revenue in range</p>
                        <p class="metric-value">${{ number_format($revenue['total'], 2) }}</p>
                        <p class="metric-hint">{{ $rangeLabel }}</p>
                    </div>
                </td>
                <td>
                    <div class="metric-card accent-blue">
                        <p class="metric-label">Total Orders</p>
                        <p class="metric-value">{{ number_format($orders['total']) }}</p>
                        <p class="metric-hint">{{ (int) $orders['pending'] }} pending · {{ (int) $orders['completed'] }} completed</p>
                    </div>
                </td>
                <td>
                    <div class="metric-card accent-amber">
                        <p class="metric-label">Products</p>
                        <p class="metric-value">{{ number_format($products['total']) }}</p>
                        <p class="metric-hint">{{ (int) $products['active'] }} active · {{ (int) $products['low_stock'] }} low stock</p>
                    </div>
                </td>
                <td>
                    <div class="metric-card accent-purple">
                        <p class="metric-label">Customers</p>
                        <p class="metric-value">{{ number_format($customers['total']) }}</p>
                        <p class="metric-hint">{{ (int) $customers['new_this_month'] }} new this month</p>
                    </div>
                </td>
            </tr>
        </table>

        {{-- ── Detail breakdowns (two-column) ──────────────────────────────── --}}
        <p class="section-title">Breakdown</p>

        <table class="two-col">
            <tr>
                <td>
                    <table class="kv">
                        <thead>
                            <tr><th colspan="2">Revenue</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="label">Revenue in selected range</td>
                                <td class="num">${{ number_format($revenue['total'], 2) }}</td>
                            </tr>
                            <tr>
                                <td class="label">Revenue this month</td>
                                <td class="num">${{ number_format($revenue['month'], 2) }}</td>
                            </tr>
                            <tr>
                                <td class="label">Revenue today</td>
                                <td class="num">${{ number_format($revenue['today'], 2) }}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table class="kv">
                        <thead>
                            <tr><th colspan="2">Orders</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="label">Total orders</td>
                                <td class="num">{{ number_format($orders['total']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-amber">Pending</span></td>
                                <td class="num">{{ number_format($orders['pending']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-blue">Processing</span></td>
                                <td class="num">{{ number_format($orders['processing']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-green">Completed</span></td>
                                <td class="num">{{ number_format($orders['completed']) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </td>
                <td>
                    <table class="kv">
                        <thead>
                            <tr><th colspan="2">Products</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="label">Total products</td>
                                <td class="num">{{ number_format($products['total']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-green">Active</span></td>
                                <td class="num">{{ number_format($products['active']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-red">Low stock (&lt; 10)</span></td>
                                <td class="num">{{ number_format($products['low_stock']) }}</td>
                            </tr>
                        </tbody>
                    </table>

                    <table class="kv">
                        <thead>
                            <tr><th colspan="2">Customers</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td class="label">Total customers</td>
                                <td class="num">{{ number_format($customers['total']) }}</td>
                            </tr>
                            <tr>
                                <td class="label"><span class="pill pill-blue">New in range</span></td>
                                <td class="num">{{ number_format($customers['new_this_month']) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </td>
            </tr>
        </table>

        <div class="footnote">
            <span class="brand">{{ $brandName }}</span>
            &nbsp;·&nbsp; Confidential internal document &nbsp;·&nbsp;
            Generated on {{ $generatedAt }}
        </div>
    </div>
</body>
</html>
