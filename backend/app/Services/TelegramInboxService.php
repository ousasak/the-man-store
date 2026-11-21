<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Shipment;
use App\Models\TelegramUser;
use App\Models\User;
use App\Support\ShippingAddress;
use Illuminate\Support\Collection;

class TelegramInboxService
{
    public function __construct(private AdminDashboardContextService $dashboard)
    {
    }

    public function welcomeHtml(string $role, ?string $name = null): string
    {
        $who = trim((string) $name);
        $greeting = $who !== '' ? 'Welcome back, '.$who : 'Welcome to The Man Store';

        $subtitle = match ($role) {
            'superadmin' => 'Shop owner · ម្ចាស់ហាង. You get every order alert (success and failed). Open Report for today, months, and years.',
            'admin' => 'Staff · បុគ្គលិក. You get every shop order alert. Use Orders, Shipments, and Customers — reports stay with the owner.',
            'driver' => 'You are signed in as Driver. Delivery jobs appear here.',
            'customer' => 'Your orders, products, and profile are ready in this chat.',
            default => 'Browse and add to cart as a guest. Login or register when you checkout.',
        };

        return $this->card('THE MAN STORE', $greeting, $this->roleLabel($role), [$subtitle]);
    }

    public function guestProfileHtml(): string
    {
        return $this->card(
            'ACCOUNT',
            'Guest session',
            'Not signed in',
            [
                'You can browse and add items to cart without an account.',
                'Checkout asks you to login or register. Share your phone: existing numbers sign in, new numbers create a customer account.',
            ]
        );
    }

    public function linkAccountHtml(): string
    {
        return $this->card(
            'THE MAN STORE',
            'Login or register',
            'Phone sign-in',
            [
                'Share your Telegram phone number. We never ask for a password in this chat.',
                'Existing account: you are signed in. New number: we create a customer account.',
                'Staff and driver accounts keep their current role.',
            ]
        );
    }

    public function phoneLinkSuccessHtml(User $user, bool $registered = false): string
    {
        return $this->card(
            'THE MAN STORE',
            $registered ? 'Account created' : 'Signed in',
            $this->roleLabel((string) $user->role),
            [
                ($registered ? 'Registered as ' : 'Connected as ').$user->name.'.',
                'You can use orders, profile, and the shop from this chat now.',
            ]
        );
    }

    public function phoneLinkFailedHtml(string $reason): string
    {
        $copy = match ($reason) {
            'not_yours' => 'Please share your own Telegram phone number with the button below.',
            'invalid' => 'That phone number could not be read. Try Share phone number again.',
            'not_found' => 'Could not create or find an account for this phone. Try Share phone number again.',
            'ambiguous' => 'More than one account uses this number. Ask the shop to clean up the phone on those profiles.',
            'inactive' => 'This shop account is inactive.',
            'telegram_busy' => 'This Telegram is already linked to another staff account. Sign out there first.',
            default => 'Could not sign in with this phone. Try again or use a one-time link from your profile.',
        };

        return $this->card('THE MAN STORE', 'Sign-in failed', 'Try again', [$copy]);
    }

    public function alreadyLinkedHtml(string $role, string $name): string
    {
        return $this->card(
            'ACCOUNT',
            'Already linked',
            $this->roleLabel($role),
            ['This Telegram is connected as '.$name.'. Sign out first if you need to link a different account.']
        );
    }

    public function signedOutHtml(): string
    {
        return $this->card(
            'THE MAN STORE',
            'Signed out',
            'Guest',
            ['This Telegram is no longer linked. Your website account is unchanged. Tap Login / Register to sign in again.']
        );
    }

    public function profileHtml(User $user, TelegramUser $telegramUser): string
    {
        $orderCount = $user->isCustomer()
            ? Order::query()->where('user_id', $user->id)->count()
            : null;

        $rows = [
            $this->field('Name', $user->name ?: '—'),
            $this->field('Email', $user->email ?: '—'),
            $this->field('Phone', $user->phone ?: '—'),
            $this->field('Telegram', $telegramUser->username ? '@'.$telegramUser->username : 'Linked'),
            $this->field('Status', $this->statusLabel((string) $user->status)),
        ];

        if ($orderCount !== null) {
            $rows[] = $this->field('Orders', (string) $orderCount);
        }

        return $this->card(
            'ACCOUNT',
            $user->name ?: 'Member',
            $this->roleLabel((string) $user->role),
            $rows
        );
    }

    public function dashboardHtml(): string
    {
        $ctx = $this->dashboard->build();
        $orders = $ctx['orders'] ?? [];
        $revenue = $ctx['revenue'] ?? [];
        $dash = $ctx['dashboard'] ?? [];
        $users = $ctx['users'] ?? [];
        $products = $ctx['products'] ?? ($dash['products'] ?? []);
        $payments = $ctx['payments'] ?? [];

        $pending = (int) ($orders['pending'] ?? 0);
        $failed = (int) ($payments['failed'] ?? 0);
        $lowStock = (int) ($products['low_stock'] ?? $dash['products']['low_stock'] ?? 0);
        $attention = $pending + $failed + $lowStock === 0
            ? 'All clear — no items need attention.'
            : $pending.' pending orders · '.$failed.' failed payments · '.$lowStock.' low stock';

        $rows = [
            $this->field('Today', (int) ($orders['today_count'] ?? 0).' orders  ·  $'.$this->money($revenue['today'] ?? 0)),
            $this->field('This month', '$'.$this->money($revenue['month'] ?? ($dash['revenue']['month'] ?? 0))),
            $this->field('Last 7 days', (int) ($orders['last_7_days_count'] ?? 0).' orders'),
            $this->field('Customers', (string) (int) ($users['customers'] ?? 0)),
            $this->field('Catalog', (int) ($products['total'] ?? $dash['products']['total'] ?? 0).' products'),
            '<blockquote>'.$this->e($attention).'</blockquote>',
        ];

        return $this->card('OPERATIONS', 'Dashboard', 'Live', $rows);
    }

    public function paymentsHtml(): string
    {
        $pending = Payment::query()->where('status', 'pending')->count();
        $paid = Payment::query()->whereIn('status', ['paid', 'success'])->count();
        $failed = Payment::query()->where('status', 'failed')->count();

        $rows = Payment::query()
            ->with('order:id,order_number')
            ->orderByDesc('id')
            ->limit(6)
            ->get();

        $lines = [
            $this->field('Summary', $paid.' paid  ·  '.$pending.' pending  ·  '.$failed.' failed'),
        ];

        if ($rows->isEmpty()) {
            $lines[] = $this->muted('No payments yet.');
        } else {
            foreach ($rows as $payment) {
                $label = $payment->order?->order_number ?: '#'.($payment->order_id ?: $payment->id);
                $method = $payment->method ?: $payment->provider ?: '—';
                $lines[] = $this->item(
                    $label,
                    '$'.$this->money($payment->amount).'  ·  '.$this->statusLabel((string) $payment->status).'  ·  '.$method
                );
            }
        }

        return $this->card('FINANCE', 'Payments', 'Latest activity', $lines);
    }

    public function shipmentsHtml(): string
    {
        $rows = Shipment::query()
            ->with('order:id,order_number,status')
            ->orderByDesc('id')
            ->limit(6)
            ->get();

        $lines = [];
        if ($rows->isEmpty()) {
            $lines[] = $this->muted('No shipments yet.');
        } else {
            foreach ($rows as $shipment) {
                $label = $shipment->order?->order_number ?: '#'.($shipment->order_id ?: $shipment->id);
                $track = $shipment->tracking_code ?: 'No tracking yet';
                $lines[] = $this->item($label, $this->statusLabel((string) ($shipment->status ?: 'pending')).'  ·  '.$track);
            }
        }

        return $this->card('LOGISTICS', 'Shipments', 'Latest activity', $lines);
    }

    public function customersHtml(): string
    {
        $total = User::query()->where('role', 'customer')->count();
        $rows = User::query()
            ->where('role', 'customer')
            ->orderByDesc('id')
            ->limit(6)
            ->get(['id', 'name', 'email']);

        $lines = [$this->field('Total', (string) $total)];
        if ($rows->isEmpty()) {
            $lines[] = $this->muted('No customers yet.');
        } else {
            foreach ($rows as $customer) {
                $lines[] = $this->item(
                    $customer->name ?: 'Customer #'.$customer->id,
                    (string) ($customer->email ?: 'No email')
                );
            }
        }

        return $this->card('PEOPLE', 'Customers', 'Directory', $lines);
    }

    /**
     * @param  Collection<int, Order>  $orders
     */
    public function ordersHtml(Collection $orders, bool $shopWide): string
    {
        $title = $shopWide ? 'Shop orders' : 'Your orders';
        $lines = [];

        if ($orders->isEmpty()) {
            $lines[] = $this->muted($shopWide ? 'No shop orders yet.' : 'You have no orders yet.');
        } else {
            foreach ($orders as $order) {
                $label = $order->order_number ?: '#'.$order->id;
                $lines[] = $this->item(
                    $label,
                    $this->statusLabel((string) $order->status).'  ·  $'.$this->money($order->total)
                );
            }
        }

        return $this->card('ORDERS', $title, 'Latest', $lines);
    }

    /**
     * @return array{html: string, products: Collection<int, Product>, needle: string}
     */
    public function productsCatalog(?string $query = null): array
    {
        $q = Product::query()->where('is_active', true)->orderByDesc('id');
        $needle = $this->normalizeProductQuery((string) $query);
        $subtitle = 'New in';

        if ($needle !== '') {
            $subtitle = 'Results for “'.$needle.'”';
            $q->where(function ($inner) use ($needle) {
                $inner->where('name', 'ilike', '%'.$needle.'%')
                    ->orWhere('sku', 'ilike', '%'.$needle.'%');
            });
        }

        $rows = $q->limit(6)->get(['id', 'name', 'price', 'stock']);
        $lines = [];

        if ($rows->isEmpty()) {
            $lines[] = $this->muted($needle !== '' ? 'No products matched.' : 'No products yet.');
        } else {
            foreach ($rows as $product) {
                $lines[] = $this->item(
                    (string) $product->name,
                    '$'.$this->money($product->price).'  ·  '.$product->stock.' in stock'
                );
            }
            $lines[] = $this->muted('Tap a product to view and add to cart.');
        }

        if ($needle === '') {
            $lines[] = $this->muted('Guests can add to cart. Login is required at checkout.');
        }

        return [
            'html' => $this->card('BOUTIQUE', $needle !== '' ? 'Search' : 'Collection', $subtitle, $lines),
            'products' => $rows,
            'needle' => $needle,
        ];
    }

    public function productsHtml(?string $query = null): string
    {
        return $this->productsCatalog($query)['html'];
    }

    public function searchPromptHtml(): string
    {
        return $this->card(
            'BOUTIQUE',
            'Search',
            'Type a name',
            [
                $this->muted('Send a product name to search.'),
                $this->muted('Tap a result to view it and add to cart.'),
            ]
        );
    }

    public function productHtml(Product $product): string
    {
        $meta = '$'.$this->money($product->price).'  ·  '.(int) $product->stock.' in stock';
        $lines = [
            $this->item((string) $product->name, $meta),
            $this->muted('Add to cart as a guest. Checkout will ask you to login or register.'),
        ];

        return $this->card('BOUTIQUE', (string) $product->name, 'Product', $lines);
    }

    /**
     * @param  Collection<int, \App\Models\CartItem>  $items
     */
    public function cartHtml(Collection $items, float $total, int $count, bool $linked): string
    {
        $lines = [
            $this->field('Items', (string) $count),
        ];

        if ($items->isEmpty()) {
            $lines[] = $this->muted('Your cart is empty. Open Collection and add a product.');
        } else {
            foreach ($items as $item) {
                $name = (string) ($item->product?->name ?: 'Product #'.$item->product_id);
                $variant = trim(implode(' / ', array_filter([(string) $item->color, (string) $item->size])));
                $label = $variant !== '' ? $name.' ('.$variant.')' : $name;
                $lines[] = $this->item(
                    $label,
                    '$'.$this->money($item->unit_price).'  ×  '.(int) $item->quantity
                );
            }
            $lines[] = $this->field('Total', '$'.$this->money($total));
            $lines[] = $this->muted(
                $linked
                    ? 'Tap Checkout, then share your delivery location.'
                    : 'Guests can keep shopping. Checkout will ask you to login, then share a delivery location.'
            );
        }

        return $this->card('CART', 'Your bag', $count > 0 ? $count.' item'.($count === 1 ? '' : 's') : 'Empty', $lines);
    }

    public function checkoutLoginHtml(): string
    {
        return $this->card(
            'CHECKOUT',
            'Login required',
            'Guest',
            [
                'Your cart is saved. Share your phone to login or create an account, then send your delivery location.',
                'Existing number: you are signed in. New number: we create a customer account.',
            ]
        );
    }

    /**
     * @param  Collection<int, \App\Models\Address>  $addresses
     */
    public function checkoutLocationHtml(Collection $addresses): string
    {
        $lines = [
            'Delivery location is required to finish checkout.',
            'Telegram Desktop cannot share GPS. Pick Phnom Penh or another province, then type your house / street / landmark.',
            'On a phone you can tap Phone GPS instead.',
        ];

        if ($addresses->isNotEmpty()) {
            $lines[] = $this->field('Saved addresses', (string) $addresses->count());
            foreach ($addresses->take(4) as $address) {
                $label = trim((string) ($address->label ?: $address->formatted_address ?: $address->province));
                $lines[] = $this->item(
                    $label !== '' ? $label : 'Address #'.$address->id,
                    trim((string) ($address->province ?: 'Cambodia'))
                );
            }
        }

        return $this->card('CHECKOUT', 'Delivery location', 'Required', $lines);
    }

    public function checkoutTypeAddressHtml(string $province): string
    {
        $zone = $province === '' ? 'your city or province' : $province;

        return $this->card(
            'CHECKOUT',
            'Type your address',
            $zone,
            [
                'Send one message with house no., street, sangkat/khan, and a landmark.',
                'You can also paste Google Maps coordinates like 11.556, 104.928.',
            ]
        );
    }

    /**
     * @param  array<string, mixed>  $address
     * @param  array{subtotal: float, shipping: float, discount: float, total: float, province: string, cod_ok: bool}  $quote
     */
    public function checkoutReviewHtml(array $address, array $quote): string
    {
        $where = ShippingAddress::format($address);
        $gps = ! empty($address['latitude']) && ! empty($address['longitude'])
            ? number_format((float) $address['latitude'], 5).', '.number_format((float) $address['longitude'], 5)
            : null;

        $lines = [
            $this->field('Deliver to', $where),
        ];
        if ($gps) {
            $lines[] = $this->field('Map pin', $gps);
        }
        $lines[] = $this->field('Zone', (string) ($quote['province'] ?: '—'));
        $lines[] = $this->field('Subtotal', '$'.$this->money($quote['subtotal']));
        $lines[] = $this->field('Delivery', '$'.$this->money($quote['shipping']));
        if ((float) $quote['discount'] > 0) {
            $lines[] = $this->field('Discount', '-$'.$this->money($quote['discount']));
        }
        $lines[] = $this->field('Total', '$'.$this->money($quote['total']));
        $lines[] = $this->muted(
            $quote['cod_ok']
                ? 'Pay with KHQR now, or cash on delivery in Phnom Penh.'
                : 'Pay with KHQR. Cash on delivery is only available in Phnom Penh.'
        );

        return $this->card('CHECKOUT', 'Confirm order', 'Location saved', $lines);
    }

    public function orderPlacedHtml(string $orderNumber, string $paymentMethod): string
    {
        $pay = $paymentMethod === 'cod'
            ? 'Pay the driver when your order is delivered. Shop QR is not sent in this chat.'
            : 'Open the shop app to pay with KHQR. Payment QR is not sent in this customer chat.';

        return $this->card(
            'CHECKOUT',
            'Order placed',
            $orderNumber,
            [$pay]
        );
    }

    public function findProductFromMessage(string $text): ?Product
    {
        $needle = $this->normalizeProductQuery($text);
        if ($needle === '') {
            return null;
        }

        $exact = Product::query()
            ->where('is_active', true)
            ->where('name', 'ilike', $needle)
            ->orderByDesc('id')
            ->first();

        if ($exact) {
            return $exact;
        }

        $matches = Product::query()
            ->where('is_active', true)
            ->where('name', 'ilike', $needle.'%')
            ->orderByDesc('id')
            ->limit(2)
            ->get();

        return $matches->count() === 1 ? $matches->first() : null;
    }

    public function normalizeProductQuery(string $query): string
    {
        $needle = trim($query);
        $needle = preg_replace('/\s+\$[\d,]+\.?\d*\s*·\s*\d+\s+in stock\s*$/iu', '', $needle) ?? $needle;
        $needle = preg_replace('/\s+\$[\d,]+\.?\d*\s*$/u', '', $needle) ?? $needle;
        $needle = str_replace(['%', '_', '\\'], '', trim($needle));

        return $needle;
    }

    public function roleLabel(string $role): string
    {
        return match (strtolower($role)) {
            'superadmin' => 'Shop owner · ម្ចាស់ហាង',
            'admin' => 'Staff · បុគ្គលិក',
            'driver' => 'Driver · អ្នកដឹក',
            'customer' => 'Customer',
            default => 'Guest',
        };
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, string>>>}
     */
    public function inlineKeyboard(string $screen, string $role, string $shopUrl): array
    {
        $linked = ! in_array($role, ['guest', ''], true);

        $rows = match ($screen) {
            'dashboard' => [
                $this->cbPair('📅 Today', 'ux_today', '📊 Report', 'ux_report'),
                $this->cbPair('📦 Orders', 'ux_orders', '💳 Payments', 'ux_payments'),
            ],
            'report' => [
                $this->cbPair('📅 Today', 'ux_today', '📊 Report', 'ux_report'),
                $this->cbPair('📦 Orders', 'ux_orders', '💳 Payments', 'ux_payments'),
            ],
            'payments' => $role === 'superadmin'
                ? [
                    $this->cbPair('📊 Report', 'ux_report', '📅 Today', 'ux_today'),
                    $this->cbPair('📦 Orders', 'ux_orders', '👤 Account', 'ux_profile'),
                ]
                : [
                    $this->cbPair('📦 Orders', 'ux_orders', '👤 Account', 'ux_profile'),
                ],
            'orders' => $linked && $role === 'superadmin'
                ? [
                    $this->cbPair('📊 Report', 'ux_report', '📅 Today', 'ux_today'),
                    $this->cbPair('💳 Payments', 'ux_payments', '👤 Account', 'ux_profile'),
                ]
                : ($linked && $role === 'admin'
                ? [
                    $this->cbPair('🚚 Shipments', 'ux_shipments', '👥 Customers', 'ux_customers'),
                    [$this->cb('👤 Account', 'ux_profile')],
                ]
                : [
                    $this->cbPair('🛍 Collection', 'ux_shop', '👤 Account', 'ux_profile'),
                ]),
            'shipments', 'customers' => [
                $this->cbPair('📦 Orders', 'ux_orders', '👤 Account', 'ux_profile'),
            ],
            'products' => [
                $this->cbPair('🛒 Cart', 'ux_cart', '🔍 Search', 'ux_search'),
                $linked
                    ? $this->cbPair('📦 Orders', 'ux_orders', '👤 Account', 'ux_profile')
                    : $this->cbPair('🔐 Login / Register', 'ux_link', '🛍 Collection', 'ux_shop'),
            ],
            'cart' => [
                $linked
                    ? [$this->webApp('🧾 Checkout', rtrim($shopUrl, '/').'/checkout')]
                    : [$this->cb('🧾 Checkout', 'ux_checkout')],
                $this->cbPair('🛍 Collection', 'ux_shop', '🔍 Search', 'ux_search'),
            ],
            'product' => [
                $this->cbPair('🛒 Cart', 'ux_cart', '🛍 Collection', 'ux_shop'),
            ],
            'checkout' => [
                $linked
                    ? [$this->webApp('🧾 Checkout', rtrim($shopUrl, '/').'/checkout')]
                    : [$this->cb('🔐 Login / Register', 'ux_link')],
                [$this->cb('🛒 Cart', 'ux_cart')],
            ],
            'link' => [
                $this->cbPair('🛍 Collection', 'ux_shop', '🛒 Cart', 'ux_cart'),
                [$this->cb('🔐 Login / Register', 'ux_link')],
            ],
            'signed_out' => [
                $this->cbPair('🛍 Collection', 'ux_shop', '🛒 Cart', 'ux_cart'),
                [$this->cb('🔐 Login / Register', 'ux_link')],
            ],
            default => $linked
                ? [
                    $this->cbPair('📦 Orders', 'ux_orders', '❓ Help', 'ux_help'),
                    [$this->cb('🚪 Sign out', 'ux_logout')],
                ]
                : [
                    $this->cbPair('🛍 Collection', 'ux_shop', '🛒 Cart', 'ux_cart'),
                    [$this->cb('🔐 Login / Register', 'ux_link')],
                ],
        };

        return ['inline_keyboard' => $rows];
    }

    /**
     * @param  Collection<int, Product>  $products
     * @return array{inline_keyboard: list<list<array<string, mixed>>>}
     */
    public function productsKeyboard(Collection $products, string $role, int $cartCount = 0): array
    {
        $linked = ! in_array($role, ['guest', ''], true);
        $rows = [];

        foreach ($products as $product) {
            $label = $this->btnLabel((string) $product->name.' · $'.$this->money($product->price), 54);
            $rows[] = [$this->cb($label, 'prd_'.$product->id)];
        }

        $cartLabel = $cartCount > 0 ? '🛒 Cart ('.$cartCount.')' : '🛒 Cart';
        $rows[] = $this->cbPair($cartLabel, 'ux_cart', '🔍 Search', 'ux_search');
        $rows[] = $linked
            ? $this->cbPair('📦 Orders', 'ux_orders', '👤 Account', 'ux_profile')
            : [$this->cb('🔐 Login / Register', 'ux_link')];

        return ['inline_keyboard' => $rows];
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, mixed>>>}
     */
    public function productKeyboard(Product $product, int $cartCount = 0): array
    {
        $cartLabel = $cartCount > 0 ? '🛒 Cart ('.$cartCount.')' : '🛒 Cart';

        return ['inline_keyboard' => [
            [$this->cb('➕ Add to cart', 'add_'.$product->id)],
            $this->cbPair($cartLabel, 'ux_cart', '🛍 Collection', 'ux_shop'),
        ]];
    }

    /**
     * @param  Collection<int, \App\Models\CartItem>  $items
     * @return array{inline_keyboard: list<list<array<string, mixed>>>}
     */
    public function cartKeyboard(Collection $items, string $role, string $shopUrl, bool $empty): array
    {
        $linked = ! in_array($role, ['guest', ''], true);
        $rows = [];

        foreach ($items->take(6) as $item) {
            $name = (string) ($item->product?->name ?: 'Item');
            $rows[] = [$this->cb('✕ '.$this->btnLabel($name, 40), 'rm_'.$item->id)];
        }

        if (! $empty) {
            $rows[] = [$this->cb('🧾 Checkout', 'ux_checkout')];
        }

        $rows[] = $this->cbPair('🛍 Collection', 'ux_shop', '🔍 Search', 'ux_search');
        if (! $linked) {
            $rows[] = [$this->cb('🔐 Login / Register', 'ux_link')];
        }

        return ['inline_keyboard' => $rows];
    }

    /**
     * @param  Collection<int, \App\Models\Address>  $addresses
     * @return array{inline_keyboard: list<list<array<string, mixed>>>}
     */
    public function checkoutLocationKeyboard(Collection $addresses, string $shopUrl = ''): array
    {
        $rows = [
            $this->cbPair('🏙 Phnom Penh', 'zone_pp', '🗺 Other province', 'zone_prov'),
            $this->cbPair('⌨️ Type address', 'addr_type', '📍 Phone GPS', 'gps_phone'),
        ];
        foreach ($addresses->take(4) as $address) {
            $label = trim((string) ($address->label ?: $address->province ?: 'Address #'.$address->id));
            $rows[] = [$this->cb('🏠 '.$this->btnLabel($label, 48), 'caddr_'.$address->id)];
        }
        if ($shopUrl !== '') {
            $rows[] = [$this->webApp('Open shop checkout', rtrim($shopUrl, '/').'/checkout')];
        }
        $rows[] = [$this->cb('🛒 Cart', 'ux_cart')];

        return ['inline_keyboard' => $rows];
    }

    /**
     * @return array{inline_keyboard: list<list<array<string, mixed>>>}
     */
    public function checkoutPaymentKeyboard(bool $codOk): array
    {
        $rows = [
            [$this->cb('💳 Pay with KHQR', 'pay_khqr')],
        ];
        if ($codOk) {
            $rows[] = [$this->cb('💵 Cash on delivery', 'pay_cod')];
        }
        $rows[] = $this->cbPair('📍 Change location', 'ux_checkout', '🛒 Cart', 'ux_cart');

        return ['inline_keyboard' => $rows];
    }

    /**
     * @param  list<string>  $body
     */
    private function card(string $eyebrow, string $title, string $badge, array $body): string
    {
        $lines = [
            '<i>'.$this->e($eyebrow).'</i>',
            '<b>'.$this->e($title).'</b>',
            $this->e($badge),
            '',
        ];

        $first = true;
        foreach ($body as $block) {
            if (! $first) {
                $lines[] = '';
            }
            $first = false;
            $lines[] = $block;
        }

        return implode("\n", $lines);
    }

    private function field(string $label, string $value): string
    {
        return '<i>'.$this->e($label).'</i>'."\n".'<b>'.$this->e($value).'</b>';
    }

    private function item(string $title, string $meta): string
    {
        return '<b>'.$this->e($title).'</b>'."\n".$this->e($meta);
    }

    private function muted(string $text): string
    {
        return '<i>'.$this->e($text).'</i>';
    }

    /**
     * @return list<array{text: string, callback_data: string}>
     */
    private function cbPair(string $aLabel, string $aData, string $bLabel, string $bData): array
    {
        return [$this->cb($aLabel, $aData), $this->cb($bLabel, $bData)];
    }

    /**
     * @return array{text: string, callback_data: string}
     */
    private function cb(string $label, string $data): array
    {
        return ['text' => $label, 'callback_data' => $data];
    }

    /**
     * @return array{text: string, web_app: array{url: string}}
     */
    private function webApp(string $label, string $url): array
    {
        return ['text' => $label, 'web_app' => ['url' => $url]];
    }

    private function btnLabel(string $text, int $max = 40): string
    {
        $text = trim($text);
        if (mb_strlen($text) <= $max) {
            return $text;
        }

        return mb_substr($text, 0, max(1, $max - 1)).'…';
    }

    private function statusLabel(string $status): string
    {
        $status = strtolower(trim($status));

        return match ($status) {
            'active', 'paid', 'success', 'delivered', 'completed' => '● '.ucfirst($status),
            'pending', 'pending_payment', 'processing' => '○ '.str_replace('_', ' ', $status),
            'failed', 'cancelled', 'inactive' => '✕ '.ucfirst($status),
            default => $status !== '' ? ucfirst(str_replace('_', ' ', $status)) : '—',
        };
    }

    private function money(mixed $value): string
    {
        return number_format((float) $value, 2);
    }

    private function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
