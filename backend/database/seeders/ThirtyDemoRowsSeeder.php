<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Inserts ~30 demo rows into application tables and ensures 3 login users:
 * superadmin, admin, customer.
 */
class ThirtyDemoRowsSeeder extends Seeder
{
    private const TARGET = 30;

    public function run(): void
    {
        $steps = [
            'seedRoleUsers',
            'padUsers',
            'padBrands',
            'padCategories',
            'padSuppliers',
            'padProducts',
            'padProductImages',
            'padCollections',
            'padBanners',
            'padMenus',
            'padSettings',
            'padDiscounts',
            'padAddresses',
            'padWishlists',
            'padCarts',
            'padContacts',
            'padNotifications',
            'padMessages',
            'padOrders',
            'padPayments',
            'padShipments',
            'padStockInventory',
            'padStockReceived',
            'padCategoryStockReceived',
            'padPurchaseOrders',
            'padInventoryLots',
            'padReplacementCases',
            'padLoyalty',
            'padStorefrontEvents',
            'padOtpCodes',
            'padTelegram',
            'padSecurity',
            'padTrustedDevices',
            'padAccessTokens',
        ];

        foreach ($steps as $step) {
            try {
                $this->{$step}();
            } catch (Throwable $e) {
                $this->command?->warn($step.': '.$e->getMessage());
            }
        }

        $this->command?->info('ThirtyDemoRowsSeeder finished.');
    }

    private function remaining(string $table): int
    {
        if (! Schema::hasTable($table)) {
            return 0;
        }

        return max(0, self::TARGET - (int) DB::table($table)->count());
    }

    private function insertRow(string $table, array $row): ?int
    {
        if (! Schema::hasTable($table)) {
            return null;
        }

        $filtered = [];
        foreach ($row as $column => $value) {
            if (Schema::hasColumn($table, $column)) {
                $filtered[$column] = $value;
            }
        }

        if ($filtered === []) {
            return null;
        }

        return (int) DB::table($table)->insertGetId($filtered);
    }

    private function ids(string $table): array
    {
        return DB::table($table)->orderBy('id')->pluck('id')->all();
    }

    private function pick(array $ids, int $i): mixed
    {
        return $ids[$i % count($ids)];
    }

    private function seedRoleUsers(): void
    {
        $accounts = [
            [
                'email' => 'superadmin@themanstore.com',
                'name' => 'Super Administrator',
                'role' => 'superadmin',
                'password' => '1234567',
                'phone' => '+855 12 000 001',
            ],
            [
                'email' => 'admin@themanstore.com',
                'name' => 'Administrator',
                'role' => 'admin',
                'password' => '1234567',
                'phone' => '+855 12 000 002',
            ],
            [
                'email' => 'customer@themanstore.com',
                'name' => 'Test Customer',
                'role' => 'customer',
                'password' => '1234567',
                'phone' => '+855 12 000 003',
            ],
        ];

        foreach ($accounts as $account) {
            User::updateOrCreate(
                ['email' => $account['email']],
                [
                    'name' => $account['name'],
                    'role' => $account['role'],
                    'password' => $account['password'],
                    'status' => 'active',
                    'phone' => $account['phone'],
                    'email_verified_at' => now(),
                ]
            );
        }
    }

    private function padUsers(): void
    {
        $need = $this->remaining('users');
        for ($i = 1; $i <= $need; $i++) {
            $n = str_pad((string) $i, 2, '0', STR_PAD_LEFT);
            User::updateOrCreate(
                ['email' => "demo.customer{$n}@themanstore.com"],
                [
                    'name' => "Demo Customer {$n}",
                    'role' => 'customer',
                    'password' => '1234567',
                    'status' => 'active',
                    'phone' => '+855 12 400 '.$n,
                    'email_verified_at' => now(),
                ]
            );
        }
    }

    private function padBrands(): void
    {
        $need = $this->remaining('brands');
        $start = (int) DB::table('brands')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('brands')->insert([
                'name' => "Demo Brand {$n}",
                'slug' => 'demo-brand-'.$n,
                'sort_order' => $n,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padCategories(): void
    {
        $need = $this->remaining('categories');
        $start = (int) DB::table('categories')->count();
        $genders = ['MEN', 'WOMEN', 'BOY', 'GIRL'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('categories')->insert([
                'name' => "Demo Category {$n}",
                'slug' => 'demo-category-'.$n,
                'type' => 'parent',
                'gender' => $genders[($n - 1) % count($genders)],
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padSuppliers(): void
    {
        $need = $this->remaining('suppliers');
        $start = (int) DB::table('suppliers')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('suppliers')->insert([
                'supplier_code' => 'SUP-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                'name' => "Demo Supplier {$n}",
                'contact_person' => "Contact {$n}",
                'email' => "supplier{$n}@themanstore.com",
                'phone' => '+855 23 000 '.$n,
                'city' => 'Phnom Penh',
                'country' => 'Cambodia',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padProducts(): void
    {
        $categories = $this->ids('categories');
        $brands = $this->ids('brands');
        $suppliers = $this->ids('suppliers');
        if ($categories === []) {
            return;
        }

        $need = $this->remaining('products');
        $start = (int) DB::table('products')->count();
        $audiences = ['men', 'women', 'unisex', 'boy', 'girl'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $sku = 'DEMO-SKU-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT);
            DB::table('products')->insert([
                'category_id' => $this->pick($categories, $n),
                'brand_id' => $brands === [] ? null : $this->pick($brands, $n),
                'supplier_id' => $suppliers === [] ? null : $this->pick($suppliers, $n),
                'name' => "Demo Product {$n}",
                'slug' => 'demo-product-'.$n,
                'sku' => $sku,
                'description' => "Demo product {$n} for local testing.",
                'price' => 10 + ($n % 40),
                'cost_price' => 5 + ($n % 20),
                'compare_at_price' => 15 + ($n % 40),
                'stock' => 20 + ($n % 50),
                'is_active' => true,
                'image_url' => 'https://picsum.photos/seed/demo-product-'.$n.'/800/800',
                'audience' => $audiences[($n - 1) % count($audiences)],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padProductImages(): void
    {
        $products = $this->ids('products');
        if ($products === []) {
            return;
        }
        $need = $this->remaining('product_images');
        $start = (int) DB::table('product_images')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $productId = $this->pick($products, $n);
            DB::table('product_images')->insert([
                'product_id' => $productId,
                'path' => 'https://picsum.photos/seed/demo-img-'.$n.'/800/800',
                'is_primary' => $i === 1,
                'sort_order' => $n,
                'created_at' => now(),
            ]);
        }
    }

    private function padCollections(): void
    {
        $need = max(0, 2 - (int) DB::table('collections')->count());
        $start = (int) DB::table('collections')->count();
        $genders = ['men', 'women', 'boys', 'girls'];
        $categoryIds = array_slice($this->ids('categories'), 0, 4);
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('collections')->insert([
                'name' => "Demo Collection {$n}",
                'slug' => 'demo-collection-'.$n,
                'subtitle' => "Look {$n}",
                'gender' => $genders[($n - 1) % count($genders)],
                'description' => "Demo collection {$n}.",
                'image_url' => 'https://picsum.photos/seed/demo-collection-'.$n.'/1200/800',
                'sort_order' => $n,
                'is_active' => true,
                'category_ids' => $categoryIds === [] ? null : json_encode($categoryIds),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padBanners(): void
    {
        $need = $this->remaining('banners');
        $start = (int) DB::table('banners')->count();
        $pages = ['home', 'shop', 'sale'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('banners')->insert([
                'title' => "Demo Banner {$n}",
                'subtitle' => "Promo {$n}",
                'image_url' => 'https://picsum.photos/seed/demo-banner-'.$n.'/1400/600',
                'link_url' => '/search',
                'position' => 'hero',
                'page' => $pages[($n - 1) % count($pages)],
                'is_active' => true,
                'order' => $n,
                'sort_order' => $n,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padMenus(): void
    {
        $need = $this->remaining('menus');
        $start = (int) DB::table('menus')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('menus')->insert([
                'title' => "Demo Menu {$n}",
                'slug' => 'demo-menu-'.$n,
                'groups' => json_encode([['title' => 'Items', 'links' => [['label' => 'Shop', 'url' => '/search']]]]),
                'sort_order' => $n,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padSettings(): void
    {
        $need = $this->remaining('settings');
        $start = (int) DB::table('settings')->count();
        $groups = ['general', 'seo', 'social', 'commerce'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('settings')->insert([
                'key' => 'demo_setting_'.$n,
                'value' => 'value-'.$n,
                'type' => 'string',
                'group' => $groups[($n - 1) % count($groups)],
            ]);
        }
    }

    private function padDiscounts(): void
    {
        $products = $this->ids('products');
        if ($products === []) {
            return;
        }
        $need = $this->remaining('discounts');
        $existing = DB::table('discounts')->pluck('product_id')->all();
        $available = array_values(array_diff($products, $existing));
        $count = min($need, count($available));
        for ($i = 0; $i < $count; $i++) {
            $productId = $available[$i];
            $price = (float) DB::table('products')->where('id', $productId)->value('price');
            DB::table('discounts')->insert([
                'product_id' => $productId,
                'discount_type' => 'percentage',
                'discount_value' => 10 + ($i % 20),
                'sale_price' => round($price * 0.85, 2),
                'quantity' => 10,
                'start_date' => now()->subDays(2),
                'end_date' => now()->addDays(30),
                'is_active' => true,
                'description' => 'Demo discount',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padAddresses(): void
    {
        $users = $this->ids('users');
        if ($users === []) {
            return;
        }
        $need = $this->remaining('addresses');
        $start = (int) DB::table('addresses')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $userId = $this->pick($users, $n);
            DB::table('addresses')->insert([
                'user_id' => $userId,
                'label' => $n % 2 === 0 ? 'Office' : 'Home',
                'receiver_name' => 'Receiver '.$n,
                'receiver_phone' => '+855 99 200 '.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                'house_no' => (string) (10 + $n),
                'street_no' => (string) (100 + $n),
                'sangkat' => 'Boeung Keng Kang',
                'khan' => 'Chamkar Mon',
                'province' => 'Phnom Penh',
                'street' => 'Street '.$n,
                'city' => 'Phnom Penh',
                'state' => 'Phnom Penh',
                'zip' => '12000',
                'country' => 'Cambodia',
                'is_default' => $i === 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padWishlists(): void
    {
        $users = User::where('role', 'customer')->orderBy('id')->pluck('id')->all();
        $products = $this->ids('products');
        if ($users === [] || $products === []) {
            return;
        }

        $need = $this->remaining('wishlists');
        $start = (int) DB::table('wishlists')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $wishlistId = DB::table('wishlists')->insertGetId([
                'user_id' => $this->pick($users, $n),
                'name' => $n === 1 ? 'My Favorites' : 'Wishlist '.$n,
                'is_default' => $n === 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('wishlist_items')->insertOrIgnore([
                'wishlist_id' => $wishlistId,
                'product_id' => $this->pick($products, $n),
                'created_at' => now(),
            ]);
        }

        $itemNeed = $this->remaining('wishlist_items');
        $wishlists = $this->ids('wishlists');
        for ($i = 1; $i <= $itemNeed; $i++) {
            try {
                DB::table('wishlist_items')->insert([
                    'wishlist_id' => $this->pick($wishlists, $i),
                    'product_id' => $this->pick($products, $i + 7),
                    'created_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padCarts(): void
    {
        $users = User::where('role', 'customer')->orderBy('id')->pluck('id')->all();
        $products = $this->ids('products');
        if ($users === [] || $products === []) {
            return;
        }

        $need = $this->remaining('carts');
        $start = (int) DB::table('carts')->count();
        $sizes = ['S', 'M', 'L', 'XL'];
        $colors = ['Black', 'White', 'Navy', 'Grey'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $cartId = DB::table('carts')->insertGetId([
                'user_id' => $this->pick($users, $n),
                'status' => 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $productId = $this->pick($products, $n);
            $price = (float) DB::table('products')->where('id', $productId)->value('price');
            DB::table('cart_items')->insert([
                'cart_id' => $cartId,
                'product_id' => $productId,
                'quantity' => 1 + ($n % 3),
                'unit_price' => $price,
                'size' => $sizes[($n - 1) % count($sizes)],
                'color' => $colors[($n - 1) % count($colors)],
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $itemNeed = $this->remaining('cart_items');
        $carts = $this->ids('carts');
        for ($i = 1; $i <= $itemNeed; $i++) {
            $productId = $this->pick($products, $i + 11);
            $price = (float) DB::table('products')->where('id', $productId)->value('price');
            try {
                DB::table('cart_items')->insert([
                    'cart_id' => $this->pick($carts, $i),
                    'product_id' => $productId,
                    'quantity' => 1,
                    'unit_price' => $price,
                    'size' => $sizes[$i % count($sizes)],
                    'color' => $colors[$i % count($colors)],
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padContacts(): void
    {
        $need = $this->remaining('contacts');
        $start = (int) DB::table('contacts')->count();
        $statuses = ['new', 'read', 'replied', 'closed'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('contacts')->insert([
                'name' => "Contact {$n}",
                'email' => "contact{$n}@example.com",
                'phone' => '+855 10 555 '.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                'subject' => "Question {$n}",
                'message' => "Demo contact message {$n}.",
                'status' => $statuses[($n - 1) % count($statuses)],
                'created_at' => now()->subDays($n % 20),
                'updated_at' => now(),
            ]);
        }
    }

    private function padNotifications(): void
    {
        $users = $this->ids('users');
        if ($users === []) {
            return;
        }
        $need = $this->remaining('notifications');
        $start = (int) DB::table('notifications')->count();
        $types = ['order', 'promotion', 'system', 'account'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('notifications')->insert([
                'user_id' => $this->pick($users, $n),
                'type' => $types[($n - 1) % count($types)],
                'title' => "Notification {$n}",
                'message' => "Demo notification {$n}.",
                'data' => json_encode(['source' => 'thirty-seeder']),
                'is_read' => $n % 2 === 0,
                'created_at' => now()->subDays($n % 15),
                'updated_at' => now(),
            ]);
        }
    }

    private function padMessages(): void
    {
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        if (! $adminId) {
            return;
        }
        $need = $this->remaining('messages');
        $start = (int) DB::table('messages')->count();
        $audiences = ['all', 'customers', 'guests'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('messages')->insert([
                'title' => "Announcement {$n}",
                'content' => "Demo store announcement {$n}.",
                'language' => $n % 2 === 0 ? 'km' : 'en',
                'target_audience' => $audiences[($n - 1) % count($audiences)],
                'is_active' => true,
                'created_by' => $adminId,
                'scheduled_at' => now()->subDays(1),
                'expires_at' => now()->addDays(30),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padOrders(): void
    {
        $customers = User::where('role', 'customer')->orderBy('id')->pluck('id')->all();
        $products = DB::table('products')->orderBy('id')->get(['id', 'name', 'sku', 'price']);
        if ($customers === [] || $products->isEmpty()) {
            return;
        }

        $need = $this->remaining('orders');
        $start = (int) DB::table('orders')->count();
        $statuses = ['pending', 'processing', 'completed', 'cancelled'];
        $payments = ['unpaid', 'paid', 'paid', 'paid'];
        $methods = ['cod', 'khqr', 'aba_payway', 'card'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $product = $products[($n - 1) % $products->count()];
            $qty = 1 + ($n % 3);
            $price = (float) $product->price;
            $subtotal = round($price * $qty, 2);
            $shipping = $n % 4 === 0 ? 0 : 2.5;
            $orderId = DB::table('orders')->insertGetId([
                'user_id' => $this->pick($customers, $n),
                'order_number' => 'DEMO-'.str_pad((string) $n, 5, '0', STR_PAD_LEFT),
                'status' => $statuses[($n - 1) % count($statuses)],
                'payment_status' => $payments[($n - 1) % count($payments)],
                'payment_method' => $methods[($n - 1) % count($methods)],
                'sale_channel' => $n % 5 === 0 ? 'pos' : 'storefront',
                'subtotal' => $subtotal,
                'shipping' => $shipping,
                'discount' => 0,
                'total' => round($subtotal + $shipping, 2),
                'shipping_address' => json_encode(['city' => 'Phnom Penh', 'country' => 'Cambodia']),
                'created_at' => now()->subDays($n % 40),
                'updated_at' => now(),
            ]);
            DB::table('order_items')->insert([
                'order_id' => $orderId,
                'product_id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'price' => $price,
                'qty' => $qty,
                'line_total' => $subtotal,
                'size' => 'M',
                'color' => 'Black',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $itemNeed = $this->remaining('order_items');
        $orders = $this->ids('orders');
        for ($i = 1; $i <= $itemNeed; $i++) {
            $product = $products[$i % $products->count()];
            try {
                DB::table('order_items')->insert([
                    'order_id' => $this->pick($orders, $i),
                    'product_id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'price' => (float) $product->price,
                    'qty' => 1,
                    'line_total' => (float) $product->price,
                    'size' => 'L',
                    'color' => 'White',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padPayments(): void
    {
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        $orders = DB::table('orders')->orderBy('id')->get();
        $paidIds = DB::table('payments')->pluck('order_id')->all();
        $need = $this->remaining('payments');
        $added = 0;
        foreach ($orders as $order) {
            if ($added >= $need) {
                break;
            }
            if (in_array($order->id, $paidIds, true)) {
                continue;
            }
            $isPaid = $order->payment_status === 'paid';
            DB::table('payments')->insert([
                'order_id' => $order->id,
                'verified_by' => $isPaid ? $adminId : null,
                'method' => $order->payment_method ?: 'cod',
                'status' => $isPaid ? 'paid' : 'pending',
                'reference_code' => 'PAY'.str_pad((string) $order->id, 6, '0', STR_PAD_LEFT),
                'amount' => $order->total,
                'currency' => 'USD',
                'bill_number' => 'BILL-'.$order->order_number,
                'paid_at' => $isPaid ? $order->created_at : null,
                'verified_at' => $isPaid ? $order->created_at : null,
                'created_at' => $order->created_at,
                'updated_at' => now(),
            ]);
            $added++;
        }
    }

    private function padShipments(): void
    {
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        $existing = DB::table('shipments')->pluck('order_id')->all();
        $orders = DB::table('orders')->whereNotIn('id', $existing ?: [0])->orderBy('id')->get();
        $need = $this->remaining('shipments');
        $providers = ['J&T Express', 'DHL', 'Cambodia Post', 'Vireak Buntham'];
        $added = 0;
        foreach ($orders as $order) {
            if ($added >= $need) {
                break;
            }
            $delivered = $order->status === 'completed';
            $shipmentId = DB::table('shipments')->insertGetId([
                'order_id' => $order->id,
                'provider' => $providers[$added % count($providers)],
                'tracking_code' => 'TRK'.str_pad((string) $order->id, 8, '0', STR_PAD_LEFT),
                'status' => $delivered ? 'delivered' : 'in_transit',
                'shipped_at' => now()->subDays(2),
                'delivered_at' => $delivered ? now()->subDay() : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('shipment_tracking_events')->insert([
                'shipment_id' => $shipmentId,
                'updated_by' => $adminId,
                'status' => $delivered ? 'delivered' : 'in_transit',
                'location' => 'Phnom Penh',
                'note' => 'Demo tracking event',
                'event_time' => now()->subDay(),
                'created_at' => now(),
            ]);
            $added++;
        }

        $eventNeed = $this->remaining('shipment_tracking_events');
        $shipments = $this->ids('shipments');
        for ($i = 1; $i <= $eventNeed && $shipments !== []; $i++) {
            DB::table('shipment_tracking_events')->insert([
                'shipment_id' => $this->pick($shipments, $i),
                'updated_by' => $adminId,
                'status' => 'in_transit',
                'location' => 'Hub '.$i,
                'note' => "Checkpoint {$i}",
                'event_time' => now()->subHours($i),
                'created_at' => now(),
            ]);
        }
    }

    private function padStockInventory(): void
    {
        $used = DB::table('stock_inventory')->pluck('category_id')->all();
        $categories = array_values(array_diff($this->ids('categories'), $used));
        $brands = $this->ids('brands');
        $need = min($this->remaining('stock_inventory'), count($categories));
        for ($i = 0; $i < $need; $i++) {
            $n = $i + 1;
            $categoryId = $categories[$i];
            DB::table('stock_inventory')->insert([
                'category_id' => $categoryId,
                'name' => "Stock SKU {$n}",
                'slug' => 'stock-sku-'.$categoryId,
                'sku' => 'STK-'.str_pad((string) $categoryId, 3, '0', STR_PAD_LEFT),
                'stock' => 20 + $n,
                'stock_received' => 30 + $n,
                'min_stock' => 5,
                'manage_stock' => true,
                'cost' => 8 + $n,
                'price' => 16 + $n,
                'unit' => 'pcs',
                'origin' => 'Cambodia',
                'brand_id' => $brands === [] ? null : $this->pick($brands, $n),
                'product_condition' => 'new',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padStockReceived(): void
    {
        $inventory = $this->ids('stock_inventory');
        $products = $this->ids('products');
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        $need = $this->remaining('stock_received');
        $start = (int) DB::table('stock_received')->count();
        if ($products === []) {
            return;
        }

        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $qty = 5 + ($n % 10);
            $cost = 7.5;
            $when = now()->subDays($n % 15);
            $this->insertRow('stock_received', [
                'stock_inventory_id' => $inventory === [] ? null : $this->pick($inventory, $n),
                'category_id' => null,
                'product_id' => $this->pick($products, $n),
                'created_by' => $adminId,
                'entry_type' => 'received',
                'quantity' => $qty,
                'unit_cost' => $cost,
                'total_cost' => $qty * $cost,
                'supplier_name' => 'Demo Supplier',
                'invoice_number' => 'INV-'.$n,
                'date_in' => $when->toDateString(),
                'received_at' => $when->toDateString(),
                'notes' => 'Demo receive',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padCategoryStockReceived(): void
    {
        $need = $this->remaining('category_stock_received');
        $start = Schema::hasTable('category_stock_received')
            ? (int) DB::table('category_stock_received')->count()
            : 0;
        $categories = $this->ids('categories');
        $brands = $this->ids('brands');
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $this->insertRow('category_stock_received', [
                'category_id' => $categories === [] ? null : $this->pick($categories, $n),
                'name' => "Demo Stock Label {$n}",
                'slug' => 'demo-stock-label-'.$n,
                'type' => 'barcode_qr',
                'sort_order' => $n,
                'is_active' => true,
                'image_url' => 'https://picsum.photos/seed/demo-stock-'.$n.'/800/800',
                'description' => "Demo stock received label {$n}.",
                'sku' => 'CSR-'.str_pad((string) $n, 3, '0', STR_PAD_LEFT),
                'cost' => 8 + ($n % 10),
                'price' => 16 + ($n % 20),
                'unit' => 'pcs',
                'origin' => 'Cambodia',
                'brand_id' => $brands === [] ? null : $this->pick($brands, $n),
                'manage_stock' => true,
                'stock' => 20 + $n,
                'min_stock' => 5,
                'date_in' => now()->subDays($n % 20)->toDateString(),
                'product_condition' => 'new',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padPurchaseOrders(): void
    {
        $suppliers = $this->ids('suppliers');
        $products = DB::table('products')->orderBy('id')->get(['id', 'price', 'cost_price']);
        if ($suppliers === [] || $products->isEmpty()) {
            return;
        }
        $need = $this->remaining('purchase_orders');
        $start = (int) DB::table('purchase_orders')->count();
        $statuses = ['draft', 'pending', 'received'];
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $poId = DB::table('purchase_orders')->insertGetId([
                'supplier_id' => $this->pick($suppliers, $n),
                'po_number' => 'PO-DEMO-'.str_pad((string) $n, 4, '0', STR_PAD_LEFT),
                'status' => $statuses[($n - 1) % count($statuses)],
                'order_date' => now()->subDays($n)->toDateString(),
                'expected_delivery' => now()->addDays(7)->toDateString(),
                'purchaser' => 'Demo Buyer',
                'notes' => 'Demo PO',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $product = $products[($n - 1) % $products->count()];
            $qty = 10;
            $cost = (float) ($product->cost_price ?: 8);
            $sell = (float) $product->price;
            DB::table('purchase_order_items')->insert([
                'purchase_order_id' => $poId,
                'product_id' => $product->id,
                'size' => 'M',
                'color' => 'Black',
                'qty' => $qty,
                'cost_per_unit' => $cost,
                'sell_price' => $sell,
                'line_total_cost' => $qty * $cost,
                'line_subtotal_sell' => $qty * $sell,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('purchase_order_product_limits')->insert([
                'purchase_order_id' => $poId,
                'product_id' => $product->id,
                'max_qty' => 100,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $itemNeed = $this->remaining('purchase_order_items');
        $pos = $this->ids('purchase_orders');
        for ($i = 1; $i <= $itemNeed; $i++) {
            $product = $products[$i % $products->count()];
            try {
                DB::table('purchase_order_items')->insert([
                    'purchase_order_id' => $this->pick($pos, $i),
                    'product_id' => $product->id,
                    'size' => 'L',
                    'color' => 'White',
                    'qty' => 4,
                    'cost_per_unit' => 8,
                    'sell_price' => (float) $product->price,
                    'line_total_cost' => 32,
                    'line_subtotal_sell' => 4 * (float) $product->price,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }

        $limitNeed = $this->remaining('purchase_order_product_limits');
        for ($i = 1; $i <= $limitNeed; $i++) {
            $product = $products[($i + 3) % $products->count()];
            try {
                DB::table('purchase_order_product_limits')->insert([
                    'purchase_order_id' => $this->pick($pos, $i),
                    'product_id' => $product->id,
                    'max_qty' => 50,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padInventoryLots(): void
    {
        $products = $this->ids('products');
        $received = $this->ids('stock_received');
        if ($products === []) {
            return;
        }
        $need = $this->remaining('inventory_lots');
        $start = (int) DB::table('inventory_lots')->count();
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            $lotId = DB::table('inventory_lots')->insertGetId([
                'product_id' => $this->pick($products, $n),
                'sku' => 'LOT-SKU-'.$n,
                'size' => 'M',
                'color' => 'Black',
                'lot_number' => 'LOT-'.str_pad((string) $n, 5, '0', STR_PAD_LEFT),
                'season' => '2026SS',
                'listing_status' => 'active',
                'lot_tier' => $n % 2 === 0 ? 'newer' : 'older',
                'quantity_on_hand' => 12,
                'quantity_received' => 12,
                'unit_cost' => 8,
                'unit_price' => 18,
                'price_rule' => 'fixed',
                'barcode' => 'BAR'.str_pad((string) $n, 8, '0', STR_PAD_LEFT),
                'is_sellable' => true,
                'stock_received_id' => $received === [] ? null : $this->pick($received, $n),
                'received_at' => now()->subDays($n % 10),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('inventory_lot_price_events')->insert([
                'inventory_lot_id' => $lotId,
                'user_id' => $adminId,
                'action' => 'set_unit_price',
                'unit_price_before' => 16,
                'unit_price_after' => 18,
                'listing_status_before' => 'active',
                'listing_status_after' => 'active',
                'price_rule_before' => 'fixed',
                'price_rule_after' => 'fixed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            DB::table('inventory_lot_detail_events')->insert([
                'inventory_lot_id' => $lotId,
                'user_id' => $adminId,
                'action' => 'create',
                'changes' => json_encode(['quantity_on_hand' => [0, 12]]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $priceNeed = $this->remaining('inventory_lot_price_events');
        $lots = $this->ids('inventory_lots');
        for ($i = 1; $i <= $priceNeed && $lots !== []; $i++) {
            DB::table('inventory_lot_price_events')->insert([
                'inventory_lot_id' => $this->pick($lots, $i),
                'user_id' => $adminId,
                'action' => 'update_sku_pricing',
                'unit_price_before' => 18,
                'unit_price_after' => 19,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        $detailNeed = $this->remaining('inventory_lot_detail_events');
        for ($i = 1; $i <= $detailNeed && $lots !== []; $i++) {
            DB::table('inventory_lot_detail_events')->insert([
                'inventory_lot_id' => $this->pick($lots, $i),
                'user_id' => $adminId,
                'action' => 'update',
                'changes' => json_encode(['notes' => 'demo']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padReplacementCases(): void
    {
        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        $used = DB::table('replacement_cases')->pluck('order_id')->all();
        $orders = DB::table('orders')->whereNotIn('id', $used ?: [0])->orderBy('id')->get();
        $need = $this->remaining('replacement_cases');
        $statuses = ['pending', 'approved', 'rejected', 'completed'];
        $added = 0;
        foreach ($orders as $order) {
            if ($added >= $need) {
                break;
            }
            $caseId = DB::table('replacement_cases')->insertGetId([
                'order_id' => $order->id,
                'handled_by' => $adminId,
                'reason' => 'Wrong size',
                'status' => $statuses[$added % count($statuses)],
                'notes' => 'Demo replacement',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $item = DB::table('order_items')->where('order_id', $order->id)->first();
            if ($item) {
                try {
                    DB::table('replacement_case_items')->insert([
                        'replacement_case_id' => $caseId,
                        'order_item_id' => $item->id,
                        'quantity' => 1,
                        'requested_size' => 'L',
                        'requested_color' => 'Black',
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } catch (Throwable) {
                }
            }
            $added++;
        }

        $itemNeed = $this->remaining('replacement_case_items');
        $cases = $this->ids('replacement_cases');
        $orderItems = $this->ids('order_items');
        for ($i = 1; $i <= $itemNeed && $cases !== [] && $orderItems !== []; $i++) {
            try {
                DB::table('replacement_case_items')->insert([
                    'replacement_case_id' => $this->pick($cases, $i),
                    'order_item_id' => $this->pick($orderItems, $i + 3),
                    'quantity' => 1,
                    'requested_size' => 'M',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padLoyalty(): void
    {
        $users = $this->ids('users');
        $existing = DB::table('loyalty_profiles')->pluck('user_id')->all();
        $available = array_values(array_diff($users, $existing));
        $need = min($this->remaining('loyalty_profiles'), count($available));
        $tiers = ['bronze', 'silver', 'gold'];
        for ($i = 0; $i < $need; $i++) {
            DB::table('loyalty_profiles')->insert([
                'user_id' => $available[$i],
                'points' => 50 + ($i * 10),
                'tier' => $tiers[$i % count($tiers)],
                'orders_count' => $i % 8,
                'lifetime_spend' => 20 + ($i * 5),
                'last_earned_at' => now()->subDays($i % 10),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $orders = $this->ids('orders');
        $eventNeed = $this->remaining('loyalty_events');
        for ($i = 1; $i <= $eventNeed && $users !== []; $i++) {
            DB::table('loyalty_events')->insert([
                'user_id' => $this->pick($users, $i),
                'order_id' => $orders === [] ? null : $this->pick($orders, $i),
                'event_type' => 'earn',
                'points_delta' => 10,
                'meta' => json_encode(['source' => 'seeder']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padStorefrontEvents(): void
    {
        $users = $this->ids('users');
        $products = $this->ids('products');
        $orders = $this->ids('orders');
        $need = $this->remaining('storefront_events');
        $types = ['product_view', 'add_to_cart', 'purchase'];
        for ($i = 1; $i <= $need; $i++) {
            DB::table('storefront_events')->insert([
                'user_id' => $users === [] ? null : $this->pick($users, $i),
                'session_id' => 'sess-'.$i,
                'event_type' => $types[($i - 1) % count($types)],
                'product_id' => $products === [] ? null : $this->pick($products, $i),
                'order_id' => $orders === [] ? null : $this->pick($orders, $i),
                'meta' => json_encode(['source' => 'seeder']),
                'occurred_at' => now()->subHours($i),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padOtpCodes(): void
    {
        $need = $this->remaining('otp_codes');
        $start = (int) DB::table('otp_codes')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('otp_codes')->insert([
                'email' => "otp{$n}@themanstore.com",
                'purpose' => $n % 2 === 0 ? 'login' : 'register',
                'code_hash' => hash('sha256', '000000'),
                'attempts' => 0,
                'expires_at' => now()->addMinutes(10),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padTelegram(): void
    {
        $users = $this->ids('users');
        $need = $this->remaining('telegram_users');
        $start = (int) DB::table('telegram_users')->count();
        for ($i = 1; $i <= $need; $i++) {
            $n = $start + $i;
            DB::table('telegram_users')->insert([
                'telegram_user_id' => 100000 + $n,
                'user_id' => $users === [] ? null : $this->pick($users, $n),
                'chat_id' => 200000 + $n,
                'username' => 'demo_tg_'.$n,
                'first_name' => 'Telegram',
                'last_name' => (string) $n,
                'preferred_locale' => 'en',
                'language_code' => 'en',
                'last_interacted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $tgUsers = $this->ids('telegram_users');
        $orders = $this->ids('orders');
        $subNeed = $this->remaining('telegram_order_subscriptions');
        for ($i = 1; $i <= $subNeed && $orders !== [] && $tgUsers !== []; $i++) {
            try {
                DB::table('telegram_order_subscriptions')->insert([
                    'order_id' => $this->pick($orders, $i),
                    'telegram_user_id' => $this->pick($tgUsers, $i),
                    'chat_id' => 200000 + $i,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }

        $adminId = User::whereIn('role', ['superadmin', 'admin'])->value('id');
        $codeNeed = $this->remaining('telegram_link_codes');
        for ($i = 1; $i <= $codeNeed && $users !== []; $i++) {
            DB::table('telegram_link_codes')->insert([
                'user_id' => $this->pick($users, $i),
                'code' => strtoupper(Str::random(8)),
                'purpose' => $i % 2 === 0 ? 'driver' : 'staff',
                'created_by' => $adminId,
                'expires_at' => now()->addDays(7),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function padSecurity(): void
    {
        $users = $this->ids('users');
        $need = $this->remaining('security_audit_logs');
        $types = ['login_success', 'login_failed', 'password_changed', 'logout'];
        for ($i = 1; $i <= $need; $i++) {
            DB::table('security_audit_logs')->insert([
                'user_id' => $users === [] ? null : $this->pick($users, $i),
                'event_type' => $types[($i - 1) % count($types)],
                'ip_address' => '127.0.0.1',
                'ip_city' => 'Phnom Penh',
                'ip_country' => 'Cambodia',
                'ip_country_code' => 'KH',
                'device_name' => 'Chrome',
                'browser' => 'Chrome',
                'os' => 'Windows',
                'metadata' => json_encode(['source' => 'seeder']),
                'created_at' => now()->subHours($i),
            ]);
        }
    }

    private function padTrustedDevices(): void
    {
        $users = $this->ids('users');
        $need = $this->remaining('user_trusted_devices');
        for ($i = 1; $i <= $need && $users !== []; $i++) {
            try {
                DB::table('user_trusted_devices')->insert([
                    'user_id' => $this->pick($users, $i),
                    'device_id' => 'trusted-'.$i,
                    'verified_at' => now()->subDays(1),
                    'last_seen_at' => now(),
                    'device_name' => 'Windows PC',
                    'browser' => 'Chrome',
                    'os' => 'Windows',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }

    private function padAccessTokens(): void
    {
        $users = $this->ids('users');
        $need = $this->remaining('personal_access_tokens');
        $tokenIds = [];
        for ($i = 1; $i <= $need && $users !== []; $i++) {
            $tokenIds[] = DB::table('personal_access_tokens')->insertGetId([
                'tokenable_type' => User::class,
                'tokenable_id' => $this->pick($users, $i),
                'name' => 'demo-token-'.$i,
                'token' => hash('sha256', 'demo-token-'.$i.Str::random(8)),
                'abilities' => json_encode(['*']),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $sessionNeed = $this->remaining('user_device_sessions');
        for ($i = 1; $i <= $sessionNeed && $users !== []; $i++) {
            try {
                DB::table('user_device_sessions')->insert([
                    'user_id' => $this->pick($users, $i),
                    'personal_access_token_id' => $tokenIds[$i - 1] ?? ($tokenIds[0] ?? null),
                    'device_id' => 'dev_'.$i,
                    'device_name' => 'Demo Device '.$i,
                    'browser' => 'Chrome',
                    'os' => 'Windows',
                    'user_agent' => 'Mozilla/5.0 demo',
                    'ip_address' => '127.0.0.1',
                    'last_login_at' => now(),
                    'last_used_at' => now(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (Throwable) {
                continue;
            }
        }
    }
}
