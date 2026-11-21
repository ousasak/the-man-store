<?php

namespace App\Http\Controllers\Api\V1\Storefront\Orders;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Services\DeliveryFeeService;
use App\Services\InventoryLotService;
use App\Services\LoyaltyService;
use App\Services\ProductVariantInventory;
use App\Services\RielpayPaymentService;
use App\Services\SecurityAuditService;
use App\Support\ShippingAddress;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class OrderController extends Controller
{
    public function __construct(
        private SecurityAuditService $securityAudit,
        private LoyaltyService $loyaltyService,
        private InventoryLotService $inventoryLots,
        private DeliveryFeeService $deliveryFees,
        private RielpayPaymentService $rielpayPayments,
    ) {
    }

    private function resolveUnitPrice($cartItem): float
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

    private function generateOrderNumber(): string
    {
        // Generate a unique order number like "ORD-2026-001234"
        $date = now()->format('Y');
        $uniqueId = strtoupper(Str::random(6));
        return "ORD-{$date}-{$uniqueId}";
    }

    public function myOrders(Request $request)
    {
        $orders = Order::with(['items.product.category', 'shipment'])
            ->where('user_id', $request->user()->id)
            ->where(function ($query) {
                $query->paymentSuccessful()
                    ->orWhere(function ($codQuery) {
                        $codQuery->where('payment_method', 'cod')
                            ->where('status', '!=', 'cancelled');
                    });
            })
            ->orderByDesc('id')
            ->paginate(10);

        $orders->getCollection()->transform(function (Order $order) {
            $payload = $order->toArray();
            $payload['shipment'] = $this->shipmentPayload($order);

            return $payload;
        });

        return response()->json($orders);
    }

    public function trackOrder($orderNumber, Request $request)
    {
        $order = Order::with(['items.product', 'shipment'])
            ->where('order_number', $orderNumber)
            ->first();

        if (!$order) {
            // Also check by ID
            $order = Order::with(['items.product', 'shipment'])
                ->where('id', (int) $orderNumber)
                ->first();
        }

        if (!$order) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if ((int) $order->user_id !== (int) $request->user()->id) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        if (! $order->isPaymentSuccessful()) {
            return response()->json(['message' => 'Order not found'], 404);
        }

        return response()->json([
            'order' => [
                'id' => $order->order_number ?: $order->id,
                'status' => $order->status,
                'total' => $order->total,
                'created_at' => $order->created_at,
                'shipping_address' => $order->shipping_address ?? 'N/A',
                'tracking_number' => $order->shipment?->tracking_code,
                'shipment' => $this->shipmentPayload($order),
                'items' => $order->items->map(function ($item) {
                    $qty = $item->qty ?? $item->quantity ?? 0;
                    $price = $item->price ?? $item->unit_price ?? 0;
                    $subtotal = $item->line_total ?? ((float) $price * (int) $qty);
                    return [
                        'name' => $item->name ?? $item->product->name ?? 'Product',
                        'quantity' => (int) $qty,
                        'price' => (float) $price,
                        'subtotal' => round((float) $subtotal, 2),
                        'image_url' => $item->product->image_url ?? null,
                        'lot_tier_at_sale' => $item->lot_tier_at_sale,
                        'lot_number_at_sale' => $item->lot_number_at_sale,
                        'listing_status_at_sale' => $item->listing_status_at_sale,
                    ];
                }),
            ],
        ]);
    }

    public function checkout(Request $request)
    {
        $user = $request->user();
        if ($user && ! $user->canPlaceStorefrontOrder()) {
            return response()->json([
                'message' => 'Admin accounts cannot place customer orders. Use Admin → Checkout / POS for in-store sales.',
            ], 403);
        }

        $validated = $request->validate([
            'payment_method' => 'required|in:bakong_khqr,cod',
            'shipping_address' => 'required|array',
            'shipping_address.province' => 'required|string|max:120',
            'shipping_address.house_no' => 'nullable|string|max:50',
            'shipping_address.street_no' => 'nullable|string|max:120',
            'shipping_address.sangkat' => 'nullable|string|max:120',
            'shipping_address.khan' => 'nullable|string|max:120',
            'shipping_address.landmark' => 'nullable|string|max:255',
            'shipping_address.receiver_name' => 'nullable|string|max:120',
            'shipping_address.receiver_phone' => 'nullable|string|max:30',
            'billing_address' => 'nullable|array',
        ]);

        $shippingAddress = ShippingAddress::hydrateFromSaved($validated['shipping_address'], $user);

        if (! ShippingAddress::isDeliverable($shippingAddress)) {
            throw ValidationException::withMessages([
                'shipping_address' => ['Please provide a full delivery address (house no., street, sangkat/khan), not only the province.'],
            ]);
        }

        $validated['shipping_address'] = ShippingAddress::normalize($shippingAddress, $user);

        $userId = (int) $request->user()->id;

        $cart = Cart::with('items.product.activeDiscount')->where('user_id', $userId)->first();

        if (! $cart || $cart->items->isEmpty()) {
            return response()->json(['message' => 'Cart is empty.'], 422);
        }

        foreach ($cart->items as $ci) {
            $product = Product::with('activeDiscount')->find((int) $ci->product_id);
            if (! $product || ! (bool) $product->is_active) {
                throw ValidationException::withMessages([
                    'cart' => ['One or more products are unavailable. Please refresh your cart and try again.'],
                ]);
            }
            if (is_numeric($product->stock)) {
                $cap = ProductVariantInventory::effectiveCapForCartLine($product, $ci->color, $ci->size);
                if ((int) $ci->quantity > $cap) {
                    throw ValidationException::withMessages([
                        'cart' => ['Not enough stock for: '.$product->name.'.'],
                    ]);
                }
            }
        }

        $shippingProvince = (string) ($validated['shipping_address']['province'] ?? '');
        $isCod = $validated['payment_method'] === 'cod';

        if ($isCod && ! $this->deliveryFees->isPhnomPenh($shippingProvince)) {
            throw ValidationException::withMessages([
                'payment_method' => ['Pay on delivery is only available in Phnom Penh. Please pay with KHQR to ship to other provinces.'],
            ]);
        }

        $shippingFee = $this->deliveryFees->resolveForProvince($shippingProvince);
        $deliveryZone = $this->deliveryFees->resolveZone($shippingProvince);

        $discountPercent = $this->loyaltyService->discountPercentForUser($request->user());
        $order = DB::transaction(function () use ($userId, $cart, $validated, $discountPercent, $shippingFee, $deliveryZone, $isCod) {
            $total = 0;
            $validatedProducts = [];
            $validatedUnitPrices = [];

            foreach ($cart->items as $i) {
                $productId = (int) $i->product_id;
                if (!isset($validatedProducts[$productId])) {
                    $product = Product::with('activeDiscount')->find($productId);
                    if (! $product || ! (bool) $product->is_active) {
                        throw ValidationException::withMessages([
                            'cart' => ['One or more products are unavailable. Please refresh your cart and try again.'],
                        ]);
                    }

                    $validatedProducts[$productId] = $product;
                }

                $variantKey = implode('|', [
                    $productId,
                    trim((string) ($i->size ?? '')),
                    trim((string) ($i->color ?? '')),
                ]);

                if (! array_key_exists($variantKey, $validatedUnitPrices)) {
                    $cartLine = clone $i;
                    $cartLine->setRelation('product', $validatedProducts[$productId]);
                    $validatedUnitPrices[$variantKey] = $this->resolveUnitPrice($cartLine);
                }

                $unitPrice = (float) $validatedUnitPrices[$variantKey];
                $total += $unitPrice * (int) $i->quantity;
            }

            $discountAmount = round($total * ($discountPercent / 100), 2);
            $finalTotal = max(round($total - $discountAmount + $shippingFee, 2), 0);

            $order = Order::create([
                'user_id' => $userId,
                'order_number' => $this->generateOrderNumber(),
                'status' => $isCod ? 'processing' : 'pending_payment',
                'payment_status' => 'pending',
                'subtotal' => round($total, 2),
                'shipping' => round($shippingFee, 2),
                'discount' => $discountAmount,
                'total' => $finalTotal,
                'payment_method' => $validated['payment_method'],
                'shipping_address' => $validated['shipping_address'] ?? null,
                'billing_address' => $validated['billing_address'] ?? null,
                'pos_meta' => [
                    'loyalty_discount_percent' => $discountPercent,
                    'delivery_zone' => $deliveryZone,
                ],
            ]);

            foreach ($cart->items as $ci) {
                $productId = (int) $ci->product_id;
                $product = $validatedProducts[$productId] ?? $ci->product;
                $variantKey = implode('|', [
                    $productId,
                    trim((string) ($ci->size ?? '')),
                    trim((string) ($ci->color ?? '')),
                ]);
                $unitPrice = (float) ($validatedUnitPrices[$variantKey] ?? $this->resolveUnitPrice($ci));
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

            // Create pending payment record
            \App\Models\Payment::create([
                'order_id' => $order->id,
                'provider' => $isCod ? 'cod' : 'rielpay',
                'amount' => $order->total,
                'currency' => $isCod ? 'USD' : config('services.rielpay.currency', 'KHR'),
                'method' => $validated['payment_method'],
                'status' => 'pending',
            ]);

            $order->load(['items.product.category']);
            $khqrCurrency = strtoupper((string) config('services.rielpay.currency', 'USD'));
            $order->setAttribute(
                'khqr_amount',
                $khqrCurrency === 'KHR'
                    ? $this->rielpayPayments->khrAmountForOrder($order)
                    : round((float) $order->total, 2)
            );
            $order->setAttribute('khqr_currency', $khqrCurrency);

            return $order;
        });

        if ($validated['payment_method'] === 'cod') {
            $cart->items()->delete();
        }

        $shipping = $validated['shipping_address'] ?? [];
        $hasDeliveryGps = ! empty($shipping['latitude']) && ! empty($shipping['longitude']);

        $this->securityAudit->record($request, 'checkout.placed', $request->user(), [
            'order_id' => $order->id,
            'order_number' => $order->order_number,
            'payment_method' => $validated['payment_method'],
            'delivery_gps_provided' => $hasDeliveryGps,
        ]);

        return response()->json([
            'message' => $isCod
                ? 'Order placed. Pay when your order is delivered.'
                : 'Checkout successful. Please complete payment.',
            'order' => $order,
        ], 201);
    }

    private function shipmentPayload(Order $order): ?array
    {
        $shipment = $order->relationLoaded('shipment') ? $order->shipment : $order->shipment()->first();

        if (! $shipment) {
            return null;
        }

        return [
            'provider' => $shipment->provider,
            'tracking_code' => $shipment->tracking_code,
            'external_tracking_url' => $shipment->external_tracking_url,
            'status' => $shipment->status,
            'shipped_at' => $shipment->shipped_at,
        ];
    }
}
