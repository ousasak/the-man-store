<?php

namespace App\Services;

use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Product;
use App\Models\TelegramUser;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class TelegramCartService
{
    public function __construct(private InventoryLotService $inventoryLots)
    {
    }

    public function guestToken(TelegramUser $telegramUser): string
    {
        return 'tg:'.(int) $telegramUser->telegram_user_id;
    }

    public function resolveCart(TelegramUser $telegramUser): Cart
    {
        if ($telegramUser->user_id) {
            return Cart::firstOrCreate(
                ['user_id' => (int) $telegramUser->user_id],
                ['status' => 'active']
            );
        }

        return Cart::firstOrCreate(
            ['guest_token' => $this->guestToken($telegramUser)],
            ['status' => 'active', 'user_id' => null]
        );
    }

    /**
     * @return array{cart: Cart, items: \Illuminate\Support\Collection<int, CartItem>, total: float, count: int}
     */
    public function snapshot(TelegramUser $telegramUser): array
    {
        $cart = $this->resolveCart($telegramUser)->load(['items.product']);
        $total = 0.0;
        $count = 0;

        foreach ($cart->items as $item) {
            if ($item->product) {
                $item->unit_price = $this->inventoryLots->resolveStorefrontCustomerPrice(
                    $item->product,
                    $item->size,
                    $item->color
                );
            }
            $qty = (int) $item->quantity;
            $count += $qty;
            $total += (float) $item->unit_price * $qty;
        }

        return [
            'cart' => $cart,
            'items' => $cart->items,
            'total' => round($total, 2),
            'count' => $count,
        ];
    }

    public function itemCount(TelegramUser $telegramUser): int
    {
        return $this->snapshot($telegramUser)['count'];
    }

    /**
     * @return array{ok: bool, message: string, count: int}
     */
    public function addProduct(TelegramUser $telegramUser, int $productId, int $qty = 1): array
    {
        $qty = max(1, $qty);
        $product = Product::query()->where('is_active', true)->find($productId);
        if (! $product) {
            return ['ok' => false, 'message' => 'not_found', 'count' => $this->itemCount($telegramUser)];
        }

        $variant = $this->defaultVariant($product);
        if (($variant['unavailable'] ?? false) === true) {
            return ['ok' => false, 'message' => 'out_of_stock', 'count' => $this->itemCount($telegramUser)];
        }

        $size = $variant['size'] !== '' ? $variant['size'] : null;
        $color = $variant['color'] !== '' ? $variant['color'] : null;
        $cart = $this->resolveCart($telegramUser);

        $stock = ProductVariantInventory::effectiveCapForCartLine($product, $color, $size);
        $existingTotal = $this->existingVariantQuantity((int) $cart->id, $product->id, $size, $color);
        if ($existingTotal + $qty > $stock) {
            return ['ok' => false, 'message' => 'out_of_stock', 'count' => $this->itemCount($telegramUser)];
        }

        DB::transaction(function () use ($cart, $product, $qty, $size, $color) {
            $unitPrice = $this->inventoryLots->resolveStorefrontCustomerPrice($product, $size, $color);
            $item = $this->findCartLineItem((int) $cart->id, $product->id, $size, $color);
            if ($item) {
                $item->quantity += $qty;
                $item->unit_price = $unitPrice;
                $item->save();

                return;
            }

            CartItem::create([
                'cart_id' => $cart->id,
                'product_id' => $product->id,
                'color' => $color,
                'size' => $size,
                'quantity' => $qty,
                'unit_price' => $unitPrice,
            ]);
        });

        return ['ok' => true, 'message' => 'added', 'count' => $this->itemCount($telegramUser)];
    }

    /**
     * @return array{ok: bool, message: string, count: int}
     */
    public function removeItem(TelegramUser $telegramUser, int $itemId): array
    {
        $cart = $this->resolveCart($telegramUser);
        CartItem::query()->where('id', $itemId)->where('cart_id', $cart->id)->delete();

        return ['ok' => true, 'message' => 'removed', 'count' => $this->itemCount($telegramUser)];
    }

    public function mergeGuestCartIntoUser(TelegramUser $telegramUser, User $user): void
    {
        $guest = Cart::query()
            ->where('guest_token', $this->guestToken($telegramUser))
            ->whereNull('user_id')
            ->first();

        if (! $guest) {
            return;
        }

        $guest->load('items.product');
        if ($guest->items->isEmpty()) {
            $guest->delete();

            return;
        }

        $userCart = Cart::firstOrCreate(
            ['user_id' => (int) $user->id],
            ['status' => 'active']
        );

        DB::transaction(function () use ($guest, $userCart) {
            foreach ($guest->items as $line) {
                if (! $line->product) {
                    continue;
                }

                $existing = $this->findCartLineItem(
                    (int) $userCart->id,
                    (int) $line->product_id,
                    $line->size,
                    $line->color
                );
                if ($existing) {
                    $existing->quantity += (int) $line->quantity;
                    $existing->save();
                    $line->delete();

                    continue;
                }

                $line->cart_id = $userCart->id;
                $line->save();
            }

            CartItem::query()->where('cart_id', $guest->id)->delete();
            $guest->delete();
        });
    }

    /**
     * @return array{color: string, size: string, unavailable?: bool}
     */
    private function defaultVariant(Product $product): array
    {
        $resolved = ProductVariantInventory::resolveVariantSelection($product, null, null);
        if ($resolved['color'] !== '' && $resolved['size'] !== '') {
            return $resolved;
        }

        if (ProductVariantInventory::usesMatrix($product)) {
            $inStock = array_values(array_filter(
                ProductVariantInventory::matrixRows($product),
                fn (array $row) => (int) ($row['qty'] ?? 0) > 0
            ));
            if ($inStock === []) {
                return ['color' => '', 'size' => '', 'unavailable' => true];
            }

            return [
                'color' => (string) $inStock[0]['color'],
                'size' => (string) $inStock[0]['size'],
            ];
        }

        return $resolved;
    }

    private function existingVariantQuantity(int $cartId, int $productId, ?string $size, ?string $color): int
    {
        return (int) $this->variantQuery($cartId, $productId, $size, $color)->sum('quantity');
    }

    private function findCartLineItem(int $cartId, int $productId, ?string $size, ?string $color): ?CartItem
    {
        return $this->variantQuery($cartId, $productId, $size, $color)->first();
    }

    private function variantQuery(int $cartId, int $productId, ?string $size, ?string $color)
    {
        $q = CartItem::query()->where('cart_id', $cartId)->where('product_id', $productId);
        if ($size !== null && $size !== '') {
            $q->whereRaw('LOWER(TRIM(size)) = ?', [mb_strtolower(trim($size))]);
        } else {
            $q->where(function ($w) {
                $w->whereNull('size')->orWhere('size', '');
            });
        }
        if ($color !== null && $color !== '') {
            $q->whereRaw('LOWER(TRIM(color)) = ?', [mb_strtolower(trim($color))]);
        } else {
            $q->where(function ($w) {
                $w->whereNull('color')->orWhere('color', '');
            });
        }

        return $q;
    }
}
