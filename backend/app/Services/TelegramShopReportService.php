<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payment;
use App\Models\PurchaseOrderItem;
use App\Models\Setting;
use App\Support\OrderMetrics;
use Illuminate\Support\Carbon;

/**
 * Shop-owner Telegram reports: orders, money received, expenses, by day/month/year.
 */
class TelegramShopReportService
{
    /**
     * @return array{inline_keyboard: list<list<array{text: string, callback_data: string}>>}
     */
    public function keyboard(?string $active = null): array
    {
        $now = now($this->tz());
        $months = [];
        for ($i = 0; $i < 4; $i++) {
            $month = $now->copy()->subMonths($i);
            $key = $month->format('Y-m');
            $months[] = [
                'text' => $month->format('M Y'),
                'callback_data' => 'rpt_m_'.$key,
            ];
        }

        $year = (int) $now->format('Y');

        return [
            'inline_keyboard' => [
                [
                    ['text' => '📅 Today', 'callback_data' => 'rpt_today'],
                    ['text' => 'Yesterday', 'callback_data' => 'rpt_yday'],
                ],
                [
                    ['text' => 'This week', 'callback_data' => 'rpt_week'],
                    ['text' => 'This month', 'callback_data' => 'rpt_month'],
                ],
                [
                    ['text' => (string) $year, 'callback_data' => 'rpt_y_'.$year],
                    ['text' => (string) ($year - 1), 'callback_data' => 'rpt_y_'.($year - 1)],
                ],
                array_slice($months, 0, 2),
                array_slice($months, 2, 2),
            ],
        ];
    }

    public function html(string $period): string
    {
        [$from, $to, $label] = $this->resolvePeriod($period);
        $snap = $this->snapshot($from, $to);

        $e = fn (string $value): string => htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $money = fn (float $n): string => '$'.number_format($n, 2);

        $lines = [
            '<i>SHOP OWNER REPORT</i>',
            '<b>'.$e($label).'</b>',
            $e($from->timezone($this->tz())->format('Y-m-d H:i').' → '.$to->timezone($this->tz())->format('Y-m-d H:i')),
            '',
            '<b>ការបញ្ជាទិញ / Orders</b>',
            '• Placed: <b>'.$snap['orders_placed'].'</b>',
            '• Paid: <b>'.$snap['orders_paid'].'</b>',
            '• Unpaid: <b>'.$snap['orders_unpaid'].'</b>',
            '• Cancelled: <b>'.$snap['orders_cancelled'].'</b>',
            '',
            '<b>ចំណូល / Income</b>',
            '• Order total: <b>'.$money($snap['revenue']).'</b>',
            '• Money received: <b>'.$money($snap['money_received']).'</b>',
            '',
            '<b>ចំណាយ / Expenses</b>',
            '• Purchase orders: <b>'.$money($snap['expenses']).'</b>',
            '• Net (received − spend): <b>'.$money($snap['net']).'</b>',
        ];

        if ($snap['by_method'] !== []) {
            $lines[] = '';
            $lines[] = '<b>Payment mix</b>';
            foreach ($snap['by_method'] as $method => $row) {
                $lines[] = '• '.$e($this->methodLabel($method)).': '.$row['count'].' · '.$money($row['total']);
            }
        }

        if ($snap['recent'] !== []) {
            $lines[] = '';
            $lines[] = '<b>Latest orders</b>';
            foreach ($snap['recent'] as $row) {
                $lines[] = '• <code>'.$e($row['label']).'</code> · '.$e($row['pay']).' · '.$money($row['total']);
            }
        }

        $lines[] = '';
        $lines[] = '<i>Tap a period below. Owner-only — staff cannot open this report.</i>';

        return implode("\n", $lines);
    }

    /**
     * @return array{0: Carbon, 1: Carbon, 2: string}
     */
    public function resolvePeriod(string $period): array
    {
        $tz = $this->tz();
        $now = now($tz);
        $period = strtolower(trim($period));

        if (preg_match('/^d_(\d{4}-\d{2}-\d{2})$/', $period, $m)) {
            $day = Carbon::createFromFormat('Y-m-d', $m[1], $tz)->startOfDay();

            return [$day->copy(), $day->copy()->endOfDay(), $day->format('D, j M Y')];
        }

        if (preg_match('/^m_(\d{4}-\d{2})$/', $period, $m)) {
            $month = Carbon::createFromFormat('Y-m', $m[1], $tz)->startOfMonth();

            return [$month->copy(), $month->copy()->endOfMonth(), $month->format('F Y')];
        }

        if (preg_match('/^y_(\d{4})$/', $period, $m)) {
            $year = Carbon::createFromFormat('Y', $m[1], $tz)->startOfYear();

            return [$year->copy(), $year->copy()->endOfYear(), $year->format('Y')];
        }

        return match ($period) {
            'yday', 'yesterday' => [
                $now->copy()->subDay()->startOfDay(),
                $now->copy()->subDay()->endOfDay(),
                'Yesterday',
            ],
            'week' => [
                $now->copy()->startOfWeek(),
                $now->copy()->endOfWeek(),
                'This week',
            ],
            'month' => [
                $now->copy()->startOfMonth(),
                $now->copy()->endOfMonth(),
                'This month · '.$now->format('F Y'),
            ],
            'year' => [
                $now->copy()->startOfYear(),
                $now->copy()->endOfYear(),
                'This year · '.$now->format('Y'),
            ],
            default => [
                $now->copy()->startOfDay(),
                $now->copy()->endOfDay(),
                'Today · '.$now->format('D, j M Y'),
            ],
        };
    }

    /**
     * @return array{
     *   orders_placed: int,
     *   orders_paid: int,
     *   orders_unpaid: int,
     *   orders_cancelled: int,
     *   revenue: float,
     *   money_received: float,
     *   expenses: float,
     *   net: float,
     *   by_method: array<string, array{count: int, total: float}>,
     *   recent: list<array{label: string, pay: string, total: float}>
     * }
     */
    public function snapshot(Carbon $from, Carbon $to): array
    {
        $placed = Order::query()->whereBetween('created_at', [$from, $to]);
        $ordersPlaced = (int) (clone $placed)->count();
        $ordersCancelled = (int) (clone $placed)->where('status', 'cancelled')->count();
        $ordersPaid = (int) (clone $placed)->where('payment_status', 'paid')->count();
        $ordersUnpaid = max(0, $ordersPlaced - $ordersPaid - $ordersCancelled);

        $revenue = OrderMetrics::sumRevenue($from, $to);
        $moneyReceived = $this->moneyReceivedUsd($from, $to);
        $expenses = $this->purchaseSpend($from, $to);

        $methodRows = (clone $placed)
            ->selectRaw("coalesce(nullif(payment_method, ''), 'unknown') as method, count(*) as cnt, coalesce(sum(total), 0) as total")
            ->groupByRaw("coalesce(nullif(payment_method, ''), 'unknown')")
            ->get();

        $byMethod = [];
        foreach ($methodRows as $row) {
            $byMethod[(string) $row->method] = [
                'count' => (int) $row->cnt,
                'total' => round((float) $row->total, 2),
            ];
        }

        $recent = (clone $placed)->orderByDesc('id')->limit(6)->get(['id', 'order_number', 'payment_status', 'total'])
            ->map(fn (Order $order) => [
                'label' => (string) ($order->order_number ?: '#'.$order->id),
                'pay' => strtoupper((string) ($order->payment_status ?: 'unpaid')),
                'total' => round((float) $order->total, 2),
            ])
            ->all();

        return [
            'orders_placed' => $ordersPlaced,
            'orders_paid' => $ordersPaid,
            'orders_unpaid' => $ordersUnpaid,
            'orders_cancelled' => $ordersCancelled,
            'revenue' => $revenue,
            'money_received' => $moneyReceived,
            'expenses' => $expenses,
            'net' => round($moneyReceived - $expenses, 2),
            'by_method' => $byMethod,
            'recent' => $recent,
        ];
    }

    private function moneyReceivedUsd(Carbon $from, Carbon $to): float
    {
        $rate = max(1, (int) (Setting::query()->where('key', 'usd_khr_exchange_rate')->value('value') ?? 4100));
        $usd = 0.0;

        Payment::query()
            ->whereIn('status', ['paid', 'success'])
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$from, $to])
            ->orderBy('id')
            ->get(['amount', 'currency'])
            ->each(function (Payment $payment) use (&$usd, $rate) {
                $amount = (float) $payment->amount;
                $currency = strtoupper((string) ($payment->currency ?: 'USD'));
                $usd += $currency === 'KHR' ? ($amount / $rate) : $amount;
            });

        return round($usd, 2);
    }

    private function purchaseSpend(Carbon $from, Carbon $to): float
    {
        return round((float) PurchaseOrderItem::query()
            ->whereHas('purchaseOrder', function ($query) use ($from, $to) {
                $query->where(function ($inner) use ($from, $to) {
                    $inner->whereBetween('order_date', [$from->toDateString(), $to->toDateString()])
                        ->orWhere(function ($created) use ($from, $to) {
                            $created->whereNull('order_date')->whereBetween('created_at', [$from, $to]);
                        });
                });
            })
            ->sum('line_total_cost'), 2);
    }

    private function methodLabel(string $method): string
    {
        return match (strtolower($method)) {
            'cod' => 'COD',
            'bakong_khqr', 'invoice_khqr' => 'KHQR',
            'aba_payway' => 'ABA',
            default => strtoupper($method),
        };
    }

    private function tz(): string
    {
        return (string) config('app.timezone', 'Asia/Phnom_Penh');
    }
}
