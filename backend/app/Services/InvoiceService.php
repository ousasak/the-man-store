<?php

namespace App\Services;

use App\Models\Order;
use App\Support\ShippingAddress;

class InvoiceService
{
    public const AUDIENCE_CUSTOMER = 'customer';

    public const AUDIENCE_SHOP = 'shop';

    public const AUDIENCE_DRIVER = 'driver';

    public function buildOrderInvoiceData(Order $order, string $audience = self::AUDIENCE_CUSTOMER): array
    {
        $order->loadMissing(['user', 'items.product', 'shipment']);

        $shippingAddress = is_array($order->shipping_address) ? $order->shipping_address : [];

        $formatted = ShippingAddress::format($shippingAddress);
        $fullAddress = $formatted === '—' ? '' : $formatted;

        $subtotal = (float) ($order->subtotal ?? 0);
        $discount = (float) ($order->discount ?? 0);
        $shipping = (float) ($order->shipping ?? 0);
        $total = (float) ($order->total ?? 0);

        $items = [];
        $itemCount = max(1, $order->items->count());

        foreach ($order->items as $index => $item) {
            $qty = (int) ($item->qty ?? 0);
            $price = (float) ($item->price ?? 0);
            $lineBase = (float) ($item->line_total ?? ($qty * $price));

            $discountShare = $subtotal > 0 ? round($discount * ($lineBase / $subtotal), 2) : round($discount / $itemCount, 2);
            $shippingShare = $index === 0 ? $shipping : 0;
            $grandTotal = max(0, round($lineBase - $discountShare + $shippingShare, 2));

            $items[] = [
                'product_name' => $item->name ?: ($item->product->name ?? 'Item'),
                'sku' => $item->sku ?: ($item->product->sku ?? '-'),
                'quantity' => $qty,
                'price' => round($price, 2),
                'line_total' => round($lineBase, 2),
                'discount' => $discountShare,
                'shipping_fee' => $shippingShare,
                'grand_total' => $grandTotal,
            ];
        }

        $trackingCode = $order->shipment?->tracking_code;
        $isInternalAudience = in_array($audience, [self::AUDIENCE_SHOP, self::AUDIENCE_DRIVER], true);

        $paymentStatusRaw = strtolower((string) ($order->payment_status ?: $order->status));
        $isPaid = in_array($paymentStatusRaw, ['paid', 'completed', 'success', 'succeeded'], true);

        $provider = $order->shipment?->provider;
        $courierLabel = $provider && strtolower((string) $provider) !== 'internal'
            ? (string) $provider
            : null;

        $invoice = [
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'invoice_number' => 'INV-' . ($order->order_number ?: str_pad((string) $order->id, 6, '0', STR_PAD_LEFT)),
            'invoice_date' => $order->created_at?->format('Y-m-d H:i') ?? now()->format('Y-m-d H:i'),
            'invoice_audience' => $audience,
            'doc_title' => match ($audience) {
                self::AUDIENCE_SHOP => 'Shop Delivery Note',
                self::AUDIENCE_DRIVER => 'Driver Delivery Note',
                default => 'Invoice',
            },
            'doc_title_km' => match ($audience) {
                self::AUDIENCE_SHOP => 'វិក័យបត្រ ហាង',
                self::AUDIENCE_DRIVER => 'វិក័យបត្រ អ្នកដឹក',
                default => 'វិក័យបត្រ',
            },
            'customer' => [
                'name' => $shippingAddress['receiver_name'] ?? $shippingAddress['name'] ?? $order->user?->name ?? 'Guest',
                'phone' => $shippingAddress['receiver_phone']
                    ?? $shippingAddress['phone']
                    ?? $order->user?->phone
                    ?? '-',
                'full_address' => $fullAddress ?: '-',
                'email' => $order->user?->email,
            ],
            'items' => $items,
            'subtotal' => round($subtotal, 2),
            'discount' => round($discount, 2),
            'shipping_fee' => round($shipping, 2),
            'grand_total' => round($total, 2),
            'payment_status' => $isPaid ? 'PAID' : 'UNPAID',
            'payment_status_raw' => $order->payment_status ?: $order->status,
            'payment_method' => $order->payment_method,
            'is_cod' => $order->payment_method === 'cod',
            'tracking_code' => $trackingCode,
        ];

        if ($isInternalAudience) {
            $invoice['courier_provider'] = $courierLabel;
        }

        if ($audience === self::AUDIENCE_SHOP) {
            $shipment = $order->shipment;
            $invoice['picked_up_by_name'] = $shipment?->picked_up_by_name;
            $invoice['picked_up_by_phone'] = $shipment?->picked_up_by_phone;
            $invoice['picked_up_at'] = $shipment?->picked_up_at?->format('Y-m-d H:i');
        }

        return $invoice;
    }
}
