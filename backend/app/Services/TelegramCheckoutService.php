<?php

namespace App\Services;

use App\Models\Address;
use App\Models\Cart;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\User;
use App\Support\ShippingAddress;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;

class TelegramCheckoutService
{
    public function __construct(
        private InventoryLotService $inventoryLots,
        private DeliveryFeeService $deliveryFees,
        private LoyaltyService $loyaltyService,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function addressFromGps(float $latitude, float $longitude, User $user): array
    {
        $geo = $this->reverseGeocode($latitude, $longitude);
        $province = (string) ($geo['province'] ?? '');
        if ($province === '') {
            $province = $this->isPhnomPenhGps($latitude, $longitude) ? 'Phnom Penh' : 'Province';
        }

        $label = trim((string) ($geo['label'] ?? ''));
        if ($label === '') {
            $label = 'GPS pin '.$this->coordLabel($latitude, $longitude);
        }

        return ShippingAddress::normalize([
            'province' => $province,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'landmark' => $label,
            'formatted_address' => $label,
            'delivery_location_source' => 'telegram_checkout_gps',
            'receiver_name' => $user->name,
            'receiver_phone' => $user->phone,
        ], $user);
    }

    /**
     * @return array<string, mixed>
     */
    public function addressFromSaved(Address $saved, User $user): array
    {
        $payload = [
            'id' => $saved->id,
            'receiver_name' => $saved->receiver_name,
            'receiver_phone' => $saved->receiver_phone,
            'house_no' => $saved->house_no,
            'street_no' => $saved->street_no,
            'sangkat' => $saved->sangkat,
            'khan' => $saved->khan,
            'province' => $saved->province,
            'landmark' => $saved->landmark,
            'street' => $saved->street,
            'city' => $saved->city,
            'state' => $saved->state,
            'zip' => $saved->zip,
            'country' => $saved->country,
            'latitude' => $saved->latitude,
            'longitude' => $saved->longitude,
            'delivery_location_source' => 'telegram_saved_address',
        ];

        $hydrated = ShippingAddress::hydrateFromSaved($payload, $user);
        $normalized = ShippingAddress::normalize($hydrated, $user);
        if (! ShippingAddress::isDeliverable($normalized)) {
            throw new RuntimeException('That saved address is missing street details or a map pin.');
        }

        return $normalized;
    }

    /**
     * Desktop-safe: typed street address, optional "lat, lng" from Google Maps.
     *
     * @return array<string, mixed>
     */
    public function addressFromText(string $text, User $user, ?string $provinceHint = null): array
    {
        $text = trim($text);
        if ($text === '') {
            throw new RuntimeException('Send your delivery address as text.');
        }

        if (preg_match('/(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/', $text, $m)) {
            return $this->addressFromGps((float) $m[1], (float) $m[2], $user);
        }

        $province = trim((string) $provinceHint);
        if ($province === '') {
            $province = $this->deliveryFees->isPhnomPenh($text) ? 'Phnom Penh' : 'Province';
        }

        $line = mb_substr($text, 0, 255);

        return ShippingAddress::normalize([
            'province' => $province,
            'street' => $line,
            'landmark' => $line,
            'formatted_address' => $line,
            'delivery_location_source' => 'telegram_typed_address',
            'receiver_name' => $user->name,
            'receiver_phone' => $user->phone,
        ], $user);
    }

    /**
     * @param  array<string, mixed>  $address
     * @return array{subtotal: float, shipping: float, discount: float, total: float, zone: string, province: string, cod_ok: bool}
     */
    public function quote(User $user, Cart $cart, array $address): array
    {
        $subtotal = 0.0;
        foreach ($cart->items as $item) {
            $unit = $this->unitPrice($item);
            $subtotal += $unit * (int) $item->quantity;
        }

        $province = (string) ($address['province'] ?? '');
        $shipping = $this->deliveryFees->resolveForProvince($province);
        $discountPercent = $this->loyaltyService->discountPercentForUser($user);
        $discount = round($subtotal * ($discountPercent / 100), 2);
        $total = max(round($subtotal - $discount + $shipping, 2), 0);

        return [
            'subtotal' => round($subtotal, 2),
            'shipping' => round($shipping, 2),
            'discount' => $discount,
            'total' => $total,
            'zone' => $this->deliveryFees->resolveZone($province),
            'province' => $province,
            'cod_ok' => $this->deliveryFees->isPhnomPenh($province),
        ];
    }

    /**
     * @param  array<string, mixed>  $address
     */
    public function placeOrder(User $user, Cart $cart, array $address, string $paymentMethod): Order
    {
        if (! $user->canPlaceStorefrontOrder()) {
            throw new RuntimeException('This account cannot place a shop order.');
        }

        $cart->loadMissing('items.product.activeDiscount');
        if ($cart->items->isEmpty()) {
            throw new RuntimeException('Cart is empty.');
        }

        $address = ShippingAddress::normalize($address, $user);
        if (! ShippingAddress::isDeliverable($address)) {
            throw new RuntimeException('Please share a delivery location or a full saved address.');
        }

        $paymentMethod = $paymentMethod === 'cod' ? 'cod' : 'bakong_khqr';
        $province = (string) ($address['province'] ?? '');
        if ($paymentMethod === 'cod' && ! $this->deliveryFees->isPhnomPenh($province)) {
            throw new RuntimeException('Pay on delivery is only available in Phnom Penh. Choose KHQR instead.');
        }

        foreach ($cart->items as $ci) {
            $product = Product::query()->find((int) $ci->product_id);
            if (! $product || ! $product->is_active) {
                throw new RuntimeException('One or more products are unavailable. Refresh your cart.');
            }
            if (is_numeric($product->stock)) {
                $cap = ProductVariantInventory::effectiveCapForCartLine($product, $ci->color, $ci->size);
                if ((int) $ci->quantity > $cap) {
                    throw new RuntimeException('Not enough stock for: '.$product->name);
                }
            }
        }

        $quote = $this->quote($user, $cart, $address);
        $isCod = $paymentMethod === 'cod';

        $order = DB::transaction(function () use ($user, $cart, $address, $paymentMethod, $quote, $isCod) {
            $order = Order::create([
                'user_id' => $user->id,
                'order_number' => $this->orderNumber(),
                'status' => $isCod ? 'processing' : 'pending_payment',
                'payment_status' => 'pending',
                'subtotal' => $quote['subtotal'],
                'shipping' => $quote['shipping'],
                'discount' => $quote['discount'],
                'total' => $quote['total'],
                'payment_method' => $paymentMethod,
                'shipping_address' => $address,
                'pos_meta' => [
                    'loyalty_discount_percent' => $this->loyaltyService->discountPercentForUser($user),
                    'delivery_zone' => $quote['zone'],
                    'channel' => 'telegram',
                ],
            ]);

            foreach ($cart->items as $ci) {
                $product = $ci->product;
                $unitPrice = $this->unitPrice($ci);
                $line = $unitPrice * (int) $ci->quantity;
                OrderItem::create([
                    'order_id' => $order->id,
                    'product_id' => $ci->product_id,
                    'size' => $ci->size ?? null,
                    'color' => $ci->color ?? null,
                    'name' => $product->name ?? 'Product',
                    'sku' => $product->sku ?? '',
                    'price' => $unitPrice,
                    'qty' => $ci->quantity,
                    'line_total' => round($line, 2),
                ]);
            }

            Payment::create([
                'order_id' => $order->id,
                'provider' => $isCod ? 'cod' : 'rielpay',
                'amount' => $order->total,
                'currency' => $isCod ? 'USD' : config('services.rielpay.currency', 'KHR'),
                'method' => $paymentMethod,
                'status' => 'pending',
            ]);

            return $order->load(['items.product']);
        });

        if ($isCod) {
            $cart->items()->delete();
        }

        return $order;
    }

    private function unitPrice($cartItem): float
    {
        if ($cartItem->product) {
            $cartItem->product->loadMissing('activeDiscount');

            return $this->inventoryLots->resolveStorefrontCustomerPrice(
                $cartItem->product,
                $cartItem->size ?? null,
                $cartItem->color ?? null,
            );
        }

        return (float) ($cartItem->unit_price ?? 0);
    }

    private function orderNumber(): string
    {
        return 'ORD-'.now()->format('Y').'-'.strtoupper(Str::random(6));
    }

    /**
     * @return array{province?: string, label?: string}
     */
    private function reverseGeocode(float $latitude, float $longitude): array
    {
        try {
            $response = Http::timeout(4)
                ->withHeaders(['User-Agent' => 'TheManStoreBot/1.0 (checkout)'])
                ->get('https://nominatim.openstreetmap.org/reverse', [
                    'lat' => $latitude,
                    'lon' => $longitude,
                    'format' => 'jsonv2',
                    'zoom' => 14,
                    'addressdetails' => 1,
                ]);
            if (! $response->ok()) {
                return [];
            }

            $json = $response->json();
            $addr = is_array($json['address'] ?? null) ? $json['address'] : [];
            $province = trim((string) (
                $addr['city']
                ?? $addr['state']
                ?? $addr['province']
                ?? $addr['county']
                ?? ''
            ));
            $label = trim((string) ($json['display_name'] ?? ''));

            return array_filter([
                'province' => $province,
                'label' => $label !== '' ? mb_substr($label, 0, 255) : null,
            ]);
        } catch (\Throwable) {
            return [];
        }
    }

    private function isPhnomPenhGps(float $latitude, float $longitude): bool
    {
        return $latitude >= 11.47 && $latitude <= 11.70
            && $longitude >= 104.80 && $longitude <= 105.05;
    }

    private function coordLabel(float $latitude, float $longitude): string
    {
        return number_format($latitude, 5).', '.number_format($longitude, 5);
    }
}
