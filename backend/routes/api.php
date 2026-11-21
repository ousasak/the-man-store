<?php
// ✅ FILE: backend/routes/api.php
// ✅ Single, clean, full version (no duplicates, correct homepage route placement)

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Http\Controllers\Api\V1\Auth\AuthSessionController;
use App\Http\Controllers\Api\V1\Storefront\Orders\BakongPaymentController;
use App\Http\Controllers\Api\V1\Admin\Employees\SecurityAuditController;
use App\Http\Controllers\Api\V1\Auth\SocialAuthController;
use App\Http\Controllers\Api\V1\Auth\TelegramAuthController;
use App\Http\Controllers\Api\V1\Auth\TwoFactorController;
use App\Http\Controllers\Api\V1\Storefront\Orders\CodCollectionController;
use App\Http\Controllers\Api\V1\Driver\DriverCodScanController;
// Storefront
use App\Http\Controllers\Api\V1\Storefront\Catalog\CategoryController;
use App\Http\Controllers\Api\V1\Storefront\Catalog\ProductController;
use App\Http\Controllers\Api\V1\Storefront\Orders\CartController;
use App\Http\Controllers\Api\V1\Storefront\Orders\OrderController;
use App\Http\Controllers\Api\V1\Storefront\Orders\PaymentController;
use App\Http\Controllers\Api\V1\Storefront\Orders\PublicReceiptController;
use App\Http\Controllers\Api\V1\Storefront\Catalog\BannerController;
use App\Http\Controllers\Api\V1\Storefront\Pages\HomepageBootstrapController;
use App\Http\Controllers\Api\V1\Storefront\Catalog\CollectionController as StorefrontCollectionController;
use App\Http\Controllers\Api\V1\Admin\Sales\DeliveryFeeAdminController;
use App\Http\Controllers\Api\V1\Admin\Drivers\ShipmentQrController;
use App\Http\Controllers\Api\V1\Storefront\Catalog\BrandController as StorefrontBrandController;
use App\Http\Controllers\Api\V1\Storefront\Pages\MenuController as StorefrontMenuController;
use App\Http\Controllers\Api\V1\Storefront\Services\ImageSearchController;
use App\Http\Controllers\Api\V1\Storefront\Orders\ShipmentTrackingController;
use App\Http\Controllers\Api\V1\Storefront\Customer\NotificationController;
use App\Http\Controllers\Api\V1\Storefront\Customer\PersonalizationController;
use App\Http\Controllers\Api\V1\Admin\Dashboard\AdminNavBadgesController;
use App\Http\Controllers\Api\V1\Admin\Communications\AdminMessageController;
use App\Http\Controllers\Api\V1\Admin\Reports\TableExportController;
use App\Services\TelegramService;
use App\Http\Controllers\Api\V1\Storefront\Customer\CustomerProfileController;
use App\Http\Controllers\Api\V1\Storefront\Services\ReplacementCaseController as StorefrontReplacementCaseController;
use App\Http\Controllers\Api\V1\Storefront\Services\ChatbotController;
use App\Http\Controllers\Api\V1\Storefront\Pages\LegalContentController;
use App\Http\Controllers\Api\V1\Storefront\Pages\FaqController;
use App\Http\Controllers\Api\V1\Storefront\Pages\ContactPageController;
use App\Http\Controllers\Api\V1\Storefront\Pages\PrivacyPageController;
use App\Http\Controllers\Api\V1\Storefront\Pages\TermsPageController;
use App\Http\Controllers\Api\V1\Storefront\Pages\CookiesPageController;
use App\Http\Controllers\Api\V1\Storefront\Orders\DeliveryFeeController;
use App\Http\Controllers\Api\V1\Storefront\Pages\PublicMediaController;
use App\Http\Controllers\Api\V1\Storefront\Services\TelegramController;
use App\Http\Controllers\Api\V1\Storefront\Services\TelegramWebhookController;
use App\Http\Controllers\Api\V1\Admin\Settings\ChatbotSettingsController;

// Admin
use App\Http\Controllers\Api\V1\Admin\Settings\HomepageAdminController;
use App\Http\Controllers\Api\V1\Admin\Settings\HomepageSettingsController;
use App\Http\Controllers\Api\V1\Admin\Inventory\BarcodeScanController;
use App\Http\Controllers\Api\V1\Admin\Sales\PosSaleController;
use App\Http\Controllers\Api\V1\Admin\Sales\PosSaleHistoryController;
use App\Http\Controllers\Api\V1\Admin\Products\CategoryAdminController;
use App\Http\Controllers\Api\V1\Admin\Products\ProductAdminController;
use App\Http\Controllers\Api\V1\Admin\Inventory\InventoryLotAdminController;
use App\Http\Controllers\Api\V1\Admin\Inventory\InventorySettingsAdminController;
use App\Http\Controllers\Api\V1\Admin\Inventory\StockInventoryAdminController;
use App\Http\Controllers\Api\V1\Admin\Inventory\StockReceivedAdminController;
use App\Http\Controllers\Api\V1\Admin\Purchases\PurchaseOrderAdminController;
use App\Http\Controllers\Api\V1\Admin\Sales\OrderAdminController;
use App\Http\Controllers\Api\V1\Admin\Sales\InvoiceAdminController;
use App\Http\Controllers\Api\V1\Admin\Customers\CustomerAdminController;
use App\Http\Controllers\Api\V1\Admin\Customers\UserProfileAdminController;
use App\Http\Controllers\Api\V1\Admin\Settings\BannerAdminController;
use App\Http\Controllers\Api\V1\Admin\Products\CollectionAdminController;
use App\Http\Controllers\Api\V1\Admin\Settings\SettingAdminController;
use App\Http\Controllers\Api\V1\Admin\Reports\ReportController;
use App\Http\Controllers\Api\V1\Admin\Products\BrandAdminController;
use App\Http\Controllers\Api\V1\Admin\Purchases\SupplierAdminController;
use App\Http\Controllers\Api\V1\Admin\Settings\MenuAdminController;
use App\Http\Controllers\Api\V1\Admin\Payments\PaymentAdminController;
use App\Http\Controllers\Api\V1\Admin\Payments\PaymentSettingsController;
use App\Http\Controllers\Api\V1\Admin\Drivers\ShipmentAdminController;
use App\Http\Controllers\Api\V1\Admin\Repairs\ReplacementCaseAdminController;
use App\Http\Controllers\Api\V1\Admin\Employees\AdminPermissionController;
use App\Http\Controllers\Api\V1\Admin\Employees\SuperAdminController;
use App\Http\Controllers\Api\V1\Driver\ShipmentDriverController;

// Admin - Search & Notifications
use App\Http\Controllers\Api\V1\Admin\Communications\AdminSearchController;
use App\Http\Controllers\Api\V1\Admin\Communications\AdminNotificationController;
use App\Http\Controllers\Api\V1\Admin\Employees\AdminUiPreferenceController;
use App\Http\Controllers\Api\V1\Admin\Communications\ContactController;
use App\Http\Controllers\Api\V1\Admin\Employees\ProfileController;
use App\Http\Controllers\Api\V1\Admin\Settings\FooterHeaderController;
use App\Http\Controllers\Api\V1\Admin\Products\DiscountAdminController;
use App\Http\Controllers\Api\V1\Admin\Drivers\DriverAdminController;
use App\Http\Controllers\Api\V1\Admin\Communications\TelegramLinkAdminController;
use App\Http\Controllers\Api\V1\Admin\Communications\AdminAiChatController;
use App\Http\Controllers\Api\V1\Admin\Customers\LoyaltyAdminController;

Route::get('/health', function () {
    try {
        return response()->json([
            'ok' => true,
            'release' => '2026-08-20-dbquote',
            'media' => \App\Support\Media::diagnostics(),
        ]);
    } catch (\Throwable $e) {
        return response()->json(['ok' => true]);
    }
});

// Lightweight dependency probe (outside throttle) — helps diagnose storefront 500s on Render.
Route::get('/health/deps', function () {
    $rawUrl = (string) (getenv('DATABASE_URL') ?: getenv('DATABASE_PRIVATE_URL') ?: env('DATABASE_URL') ?: env('DB_URL') ?: '');
    $db = [
        'ok' => false,
        'env' => [
            'database_url_set' => $rawUrl !== '',
            'database_url_unresolved' => str_contains($rawUrl, '${{'),
            'getenv_pghost' => is_string(getenv('PGHOST')) && getenv('PGHOST') !== '',
            'db_host' => env('DB_HOST'),
            'db_port' => env('DB_PORT'),
            'db_database' => env('DB_DATABASE'),
            'db_connection' => env('DB_CONNECTION', config('database.default')),
            'configured_host' => config('database.connections.pgsql.host'),
            'configured_database' => config('database.connections.pgsql.database'),
        ],
    ];
    $cache = ['ok' => false, 'store' => config('cache.default')];

    try {
        \Illuminate\Support\Facades\DB::select('select 1 as ok');
        $db['ok'] = true;
        try {
            $db['driver'] = \Illuminate\Support\Facades\DB::connection()->getDriverName();
            $db['has_cache_table'] = \Illuminate\Support\Facades\Schema::hasTable('cache');
            $db['has_collections_placement'] = \Illuminate\Support\Facades\Schema::hasColumn('collections', 'placement');
        } catch (\Throwable $e) {
            $db['schema_error'] = class_basename($e).': '.$e->getMessage();
        }
    } catch (\Throwable $e) {
        $db['error'] = class_basename($e).': '.$e->getMessage();
    }

    try {
        $key = 'health:deps:'.uniqid('', true);
        \Illuminate\Support\Facades\Cache::put($key, 1, 10);
        $cache['ok'] = \Illuminate\Support\Facades\Cache::pull($key) === 1;
        if (! $cache['ok']) {
            $cache['error'] = 'put/get mismatch';
        }
    } catch (\Throwable $e) {
        $cache['error'] = class_basename($e).': '.$e->getMessage();
    }

    $ok = ($db['ok'] ?? false) && ($cache['ok'] ?? false);

    return response()->json([
        'ok' => $ok,
        'release' => '2026-08-20-dbquote',
        'db' => $db,
        'cache' => $cache,
    ], $ok ? 200 : 503);
});

Route::get('/media/probe', function () {
    return response()->json([
        'media' => \App\Support\Media::diagnostics(),
        'probe' => \App\Support\Media::probeR2Write(),
    ]);
});

Route::get('/mail/probe', function () {
    return response()->json(\App\Support\MailDiagnostics::summary());
});

Route::get('/rielpay/probe', function () {
    return response()->json(\App\Support\RielpayDiagnostics::summary());
});

Route::middleware(['throttle:api'])->group(function () {

// Public files with CORS (for Flutter web / cross-origin clients; path = storage/app/public/...)
Route::get('/media/proxy', [PublicMediaController::class, 'proxy']);
Route::get('/media/{path}', [PublicMediaController::class, 'show'])
    ->where('path', '.*');

// Site logo raster (PNG) for Flutter web / CORS clients. Web storefront uses /logo.svg.
Route::get('/site-logo', function () {
    $path = public_path('logo.png');
    if (! is_file($path)) {
        abort(404);
    }
    $mime = @mime_content_type($path) ?: 'image/png';

    return response()->file($path, [
        'Content-Type' => $mime,
        'Cache-Control' => 'public, max-age=86400',
    ]);
});

// Current user
Route::get('/me', function (Request $request) {
    $user = $request->user();
    $telegramUser = \App\Models\TelegramUser::query()
        ->where('user_id', $user->id)
        ->orderByDesc('last_interacted_at')
        ->first();

    if ($telegramUser && ! filled($user->profile_image_path)) {
        try {
            $user = app(\App\Services\TelegramService::class)
                ->syncTelegramProfileToUser($telegramUser, $user);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Telegram profile sync on /me failed', [
                'user_id' => $user->id,
                'error' => $e->getMessage(),
            ]);
        }
    }

    $payload = $user->toArray();
    $payload['telegram_username'] = $telegramUser?->username;

    return response()->json($payload);
})->middleware(['auth:sanctum', 'device.bound']);

// -------------------------
// AUTH
// -------------------------
Route::post('/auth/register', [AuthController::class, 'register'])->middleware('throttle:auth-register');
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:auth-login');
Route::post('/auth/verification/select-method', [AuthController::class, 'selectVerificationMethod'])->middleware('throttle:auth-otp-verify');
Route::post('/auth/otp/verify', [AuthController::class, 'verifyOtp'])->middleware('throttle:auth-otp-verify');
Route::post('/auth/otp/resend', [AuthController::class, 'resendOtp'])->middleware('throttle:auth-otp-resend');
Route::post('/auth/logout', [AuthController::class, 'logout'])->middleware(['auth:sanctum', 'device.bound']);
Route::post('/auth/driver/token', [AuthController::class, 'driverToken'])->middleware(['auth:sanctum', 'device.bound']);
Route::get('/auth/sessions', [AuthSessionController::class, 'index'])->middleware(['auth:sanctum', 'device.bound']);
Route::get('/auth/security-activity', [SecurityAuditController::class, 'myActivity'])->middleware(['auth:sanctum', 'device.bound']);
Route::delete('/auth/sessions/{session}', [AuthSessionController::class, 'destroy'])->middleware(['auth:sanctum', 'device.bound']);
Route::get('/auth/facebook/redirect-direct', [AuthController::class, 'redirectToFacebook'])->middleware('throttle:auth-social');
Route::get('/auth/facebook/callback-direct', [AuthController::class, 'handleFacebookCallback'])->middleware('throttle:auth-social');
Route::post('/auth/telegram', [TelegramAuthController::class, 'login'])->middleware('throttle:auth-social');
Route::post('/auth/telegram/oidc', [TelegramAuthController::class, 'loginWithOidc'])->middleware('throttle:auth-social');
Route::post('/auth/telegram/web-session', [TelegramAuthController::class, 'createWebSession'])->middleware('throttle:auth-social');
Route::get('/auth/telegram/web-session/{code}', [TelegramAuthController::class, 'pollWebSession'])->middleware('throttle:auth-telegram-poll');
Route::post('/auth/device-continue', [TelegramAuthController::class, 'createWebSession'])->middleware('throttle:auth-social');
Route::get('/auth/device-continue/{code}', [TelegramAuthController::class, 'pollWebSession'])->middleware('throttle:auth-telegram-poll');
Route::post('/auth/telegram/webapp', [TelegramAuthController::class, 'loginWithWebApp'])->middleware('throttle:auth-social');
Route::post('/auth/telegram/phone', [TelegramAuthController::class, 'startPhoneLogin'])->middleware('throttle:auth-login');
Route::post('/auth/telegram/phone/verify', [TelegramAuthController::class, 'verifyPhoneLogin'])->middleware('throttle:auth-otp-verify');
Route::get('/auth/{provider}/redirect', [SocialAuthController::class, 'redirect'])->middleware('throttle:auth-social');
Route::get('/auth/{provider}/callback', [SocialAuthController::class, 'callback'])->middleware('throttle:auth-social');
Route::get('/auth/social/exchange/{ticket}', [SocialAuthController::class, 'exchange'])->middleware('throttle:auth-social');
Route::post('/auth/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
Route::post('/auth/reset-password-otp', [AuthController::class, 'resetPasswordOtp'])->middleware('throttle:10,1');
Route::post('/auth/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:10,1');
Route::post('/auth/two-factor/challenge', [TwoFactorController::class, 'challenge'])->middleware('throttle:auth-two-factor');
// -------------------------
// PUBLIC STOREFRONT
// -------------------------
Route::get('/menus', [StorefrontMenuController::class, 'index']); // header WOMEN/MEN mega menu
Route::get('/homepage', [HomepageAdminController::class, 'show']); // public homepage data (optional)
Route::get('/homepage/bootstrap', HomepageBootstrapController::class);

Route::get('/categories', [CategoryController::class, 'index']);
Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/filter-options', [ProductController::class, 'filterOptions']);
Route::get('/products/facets', [ProductController::class, 'filterFacets']);
Route::get('/products/discounts', [ProductController::class, 'discounts']);
Route::get('/products/recommended', [ProductController::class, 'recommendations']);
Route::get('/products/{slug}', [ProductController::class, 'show']);
Route::post('/storefront/events', [PersonalizationController::class, 'trackEvent'])->middleware('throttle:api-sensitive');

Route::get('/banners', [BannerController::class, 'all']);
Route::get('/banners/{position}', [BannerController::class, 'index']);

Route::get('/collections', [StorefrontCollectionController::class, 'index']);
Route::get('/collections/{slug}', [StorefrontCollectionController::class, 'show']);

Route::get('/brands', [StorefrontBrandController::class, 'index']);
Route::get('/brands/{slug}', [StorefrontBrandController::class, 'show']);

// Public chatbot (guests + customers)
Route::post('/chatbot/message', [ChatbotController::class, 'message'])->middleware('throttle:storefront-ai-chat');
Route::get('/chatbot/settings', [ChatbotController::class, 'settings']);

// Public notifications (guests)
Route::get('/notifications/public', [NotificationController::class, 'index']);

// Image Search (vector similarity)
Route::post('/image-search', [ImageSearchController::class, 'search'])->middleware('throttle:api-sensitive');
Route::post('/vision/search', [ImageSearchController::class, 'search'])->middleware('throttle:api-sensitive');

// Public shipment tracking
Route::get('/shipments/track', [ShipmentTrackingController::class, 'track']);

Route::get('/telegram/settings', [TelegramController::class, 'settings']);
Route::post('/telegram/webhook', [TelegramWebhookController::class, 'handle']);
Route::post('/telegram/webhook/{secret}', [TelegramWebhookController::class, 'handle']);
Route::post('/payments/khqr/webhook', [BakongPaymentController::class, 'webhook'])
    ->middleware('throttle:60,1');

Route::get('/receipt/{token}', [PublicReceiptController::class, 'show']);
Route::get('/receipt/{token}/pdf', [PublicReceiptController::class, 'downloadPdf']);
Route::get('/receipt/{token}/pay-qr', [PublicReceiptController::class, 'paymentQr']);

Route::get('/driver/cod-scan/{token}', [DriverCodScanController::class, 'show'])
    ->middleware('throttle:api');
Route::post('/driver/cod-scan/{token}', [DriverCodScanController::class, 'capture'])
    ->middleware('throttle:api-sensitive');

// Contact Form (public)
Route::post('/contact', [ContactController::class, 'store'])->middleware('throttle:api-sensitive');
Route::get('/legal-content', [LegalContentController::class, 'index']);

// Public footer & header content
Route::get('/footer-header', [FooterHeaderController::class, 'index']);
Route::get('/homepage-settings', [HomepageSettingsController::class, 'getSettings']);
Route::get('/faq', [FaqController::class, 'show']);
Route::get('/contact-page', [ContactPageController::class, 'show']);
Route::get('/privacy-page', [PrivacyPageController::class, 'show']);
Route::get('/terms-page', [TermsPageController::class, 'show']);
Route::get('/cookies-page', [CookiesPageController::class, 'show']);
Route::get('/delivery-fees', [DeliveryFeeController::class, 'rates']);
Route::post('/delivery-fees/quote', [DeliveryFeeController::class, 'quote']);

// -------------------------
// AUTH STOREFRONT
// -------------------------
Route::middleware(['auth:sanctum', 'device.bound'])->group(function () {
    Route::get('/auth/two-factor', [TwoFactorController::class, 'status']);
    Route::post('/auth/two-factor/preferred-method', [TwoFactorController::class, 'updatePreferredMethod']);
    Route::post('/auth/two-factor/setup', [TwoFactorController::class, 'setup']);
    Route::post('/auth/two-factor/confirm', [TwoFactorController::class, 'confirm']);
    Route::post('/auth/two-factor/disable', [TwoFactorController::class, 'disable']);
    Route::post('/auth/two-factor/recovery-codes', [TwoFactorController::class, 'regenerateRecoveryCodes']);

    Route::get('/cart', [CartController::class, 'show']);
    Route::post('/cart/items', [CartController::class, 'addItem']);
    Route::patch('/cart/items/{itemId}', [CartController::class, 'updateItem']);
    Route::delete('/cart/items/{itemId}', [CartController::class, 'removeItem']);

    Route::post('/checkout', [OrderController::class, 'checkout']);
    Route::get('/orders', [OrderController::class, 'myOrders']);
    Route::get('/orders/{orderNumber}/track', [OrderController::class, 'trackOrder']);
    Route::get('/telegram/status', [TelegramController::class, 'status']);
    Route::get('/telegram/orders/{orderNumber}/link', [TelegramController::class, 'orderLink']);
    Route::get('/orders/{order}', [PaymentController::class, 'show']);

    Route::post('/driver/update-status', [ShipmentDriverController::class, 'updateStatus'])
        ->middleware('driver');
    Route::post('/driver/scan', [ShipmentDriverController::class, 'scan'])
        ->middleware(['driver', 'throttle:30,1']);
    Route::get('/driver/receipt', [ShipmentDriverController::class, 'receipt'])
        ->middleware(['driver', 'throttle:30,1']);
    Route::get('/driver/orders/{order}/cod', [CodCollectionController::class, 'quote'])
        ->middleware('driver');
    Route::post('/driver/orders/{order}/cod/plan', [CodCollectionController::class, 'setPlan'])
        ->middleware('driver');
    Route::post('/driver/orders/{order}/cod/cash', [CodCollectionController::class, 'collectCash'])
        ->middleware('driver');
    Route::post('/driver/orders/{order}/cod/khqr', [CodCollectionController::class, 'createKhqr'])
        ->middleware('driver');
    Route::get('/driver/orders/{order}/cod/khqr/status', [CodCollectionController::class, 'khqrStatus'])
        ->middleware(['driver', 'throttle:20,1']);
    Route::post('/driver/orders/{order}/cod/khqr/confirm', [CodCollectionController::class, 'confirmKhqr'])
        ->middleware('driver');

    // Payment Processing
    Route::post('/payments/{order}/verify-bkash', [PaymentController::class, 'verifyBKash']);

    // KHQR Payments
    Route::post('/payments/khqr/create', [PaymentController::class, 'createKhqr']);
    Route::get('/payments/khqr/status/{orderId}', [PaymentController::class, 'khqrStatus'])
        ->middleware('throttle:20,1');

    // Bakong KHQR (Node generated)
    Route::post('/payments/bakong/create', [BakongPaymentController::class, 'create']);
    Route::post('/payments/bakong/deeplink/{payment}', [BakongPaymentController::class, 'deeplink'])
        ->whereNumber('payment');
    Route::get('/payments/bakong/status/{payment}', [BakongPaymentController::class, 'status'])
        ->whereNumber('payment')
        ->middleware('throttle:payment-status-poll');

    // User Notifications
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::patch('/notifications/{id}/read', [NotificationController::class, 'markAsRead']);
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy']);

    // User Profile
    Route::get('/user/profile', [CustomerProfileController::class, 'getProfile']);
    Route::put('/user/profile', [CustomerProfileController::class, 'updateProfile']);
    Route::post('/user/profile/image', [CustomerProfileController::class, 'uploadProfileImage']);
    Route::get('/user/orders', [CustomerProfileController::class, 'getOrders']);
    Route::get('/user/addresses', [CustomerProfileController::class, 'getAddresses']);
    Route::post('/user/addresses', [CustomerProfileController::class, 'addAddress']);
    Route::put('/user/addresses/{id}', [CustomerProfileController::class, 'updateAddress']);
    Route::delete('/user/addresses/{id}', [CustomerProfileController::class, 'deleteAddress']);
    Route::get('/user/wishlist', [CustomerProfileController::class, 'getWishlist']);
    Route::post('/user/wishlist/{productId}', [CustomerProfileController::class, 'addToWishlist']);
    Route::delete('/user/wishlist/{productId}', [CustomerProfileController::class, 'removeFromWishlist']);
    Route::get('/user/activity', [CustomerProfileController::class, 'getActivity']);
    Route::get('/user/loyalty', [CustomerProfileController::class, 'getLoyalty']);

    // Replacement Cases (Customer)
    Route::get('/replacement-cases', [StorefrontReplacementCaseController::class, 'index']);
    Route::get('/replacement-cases/order/{orderId}', [StorefrontReplacementCaseController::class, 'byOrder']);
    Route::post('/replacement-cases', [StorefrontReplacementCaseController::class, 'store']);
});

// -------------------------
// ADMIN AI (Laravel → Ollama — own model stack)
// -------------------------
Route::middleware(['auth:sanctum', 'device.bound', 'admin', 'throttle:admin-ai-chat'])->group(function () {
    Route::post('/ai/chat', [AdminAiChatController::class, 'chat']);
});

// -------------------------
// ADMIN
// -------------------------
Route::middleware(['auth:sanctum', 'device.bound', 'admin'])->prefix('admin')->group(function () {
    // Home Page Manager (banners + collections + categories + brands + menus)
    Route::get('/homepage', [HomepageAdminController::class, 'show']);

    // Homepage Settings Management
    Route::get('/homepage-settings', [HomepageSettingsController::class, 'getSettings']);
    Route::put('/homepage-settings/sections', [HomepageSettingsController::class, 'updateSections']);
    Route::put('/homepage-settings/header', [HomepageSettingsController::class, 'updateHeader']);
    Route::put('/homepage-settings/footer', [HomepageSettingsController::class, 'updateFooter']);
    Route::put('/homepage-settings/footer-sections', [HomepageSettingsController::class, 'updateFooterSections']);
    Route::post('/homepage-settings/save-all', [HomepageSettingsController::class, 'saveAll']);

    // Extended Homepage Settings (NEW IN, WOMEN, MEN, BOYS, Hero Banner)
    Route::put('/homepage-settings/hero', [HomepageSettingsController::class, 'updateHero']);
    Route::put('/homepage-settings/sections-extended', [HomepageSettingsController::class, 'updateSectionsExtended']);
    Route::put('/homepage-settings/header-extended', [HomepageSettingsController::class, 'updateHeaderExtended']);
    Route::put('/homepage-settings/footer-extended', [HomepageSettingsController::class, 'updateFooterExtended']);
    Route::put('/homepage-settings/faq', [HomepageSettingsController::class, 'updateFaq']);
    Route::put('/homepage-settings/contact-page', [HomepageSettingsController::class, 'updateContactPage']);
    Route::put('/homepage-settings/privacy-page', [HomepageSettingsController::class, 'updatePrivacyPage']);
    Route::put('/homepage-settings/terms-page', [HomepageSettingsController::class, 'updateTermsPage']);
    Route::put('/homepage-settings/cookies-page', [HomepageSettingsController::class, 'updateCookiesPage']);
    Route::post('/homepage-settings/logo-upload', [HomepageSettingsController::class, 'uploadLogo']);
    Route::post('/homepage-settings/chrome-background-upload', [HomepageSettingsController::class, 'uploadChromeBackground']);
    Route::post('/homepage-settings/menu-image-upload', [HomepageSettingsController::class, 'uploadMenuImage']);

    // Product gallery image upload
    Route::get('/media/diagnostics', [ProductAdminController::class, 'mediaDiagnostics']);
    Route::post('/products/gallery-upload', [ProductAdminController::class, 'uploadGalleryImage']);

    // Barcode scan → lookup (no stock change) + sale (deduct stock)
    Route::get('/barcode-scan/lookup', [BarcodeScanController::class, 'lookup']);
    Route::post('/barcode-scan/sale', [BarcodeScanController::class, 'sale']);

    // POS: complete sale (stock + paid order) or save unpaid draft
    Route::post('/pos/complete-sale', [PosSaleController::class, 'completeSale']);
    Route::post('/pos/draft-order', [PosSaleController::class, 'saveDraft']);
    Route::get('/pos/sale-history', [PosSaleHistoryController::class, 'index']);

    // CRUD
    Route::post('categories/image-upload', [CategoryAdminController::class, 'uploadImage']);
    Route::post('categories/{category}/quick-restock', [CategoryAdminController::class, 'quickRestock']);
    Route::apiResource('categories', CategoryAdminController::class);
    Route::apiResource('brands', BrandAdminController::class);
    Route::apiResource('suppliers', SupplierAdminController::class);
    Route::get('stock-received', [StockReceivedAdminController::class, 'index']);
    Route::get('stock-inventory', [StockInventoryAdminController::class, 'index']);
    Route::get('stock-inventory/{product}/movements', [StockInventoryAdminController::class, 'movements']);
    Route::get('stock-inventory/{product}/movement-detail', [StockInventoryAdminController::class, 'movementDetail']);
    Route::get('inventory-lots/catalog', [InventoryLotAdminController::class, 'catalog']);
    Route::post('inventory-lots/bulk', [InventoryLotAdminController::class, 'bulk']);
    Route::get('inventory-lots', [InventoryLotAdminController::class, 'index']);
    Route::post('inventory-lots', [InventoryLotAdminController::class, 'store']);
    Route::patch('inventory-lots/{inventoryLot}', [InventoryLotAdminController::class, 'update']);
    Route::get('inventory-lots/{inventoryLot}/price-events', [InventoryLotAdminController::class, 'priceEvents']);
    Route::get('inventory-lots/{inventoryLot}/detail-events', [InventoryLotAdminController::class, 'detailEvents']);
    Route::post('inventory-lots/{inventoryLot}/mark-clearance', [InventoryLotAdminController::class, 'markClearance']);
    Route::post('inventory-lots/{inventoryLot}/revert-clearance', [InventoryLotAdminController::class, 'revertFromClearance']);
    Route::post('inventory-lots/{inventoryLot}/on-hold', [InventoryLotAdminController::class, 'setOnHold']);
    Route::post('inventory-lots/{inventoryLot}/release-hold', [InventoryLotAdminController::class, 'releaseFromHold']);
    Route::post('inventory-lots/{inventoryLot}/lot-discount', [InventoryLotAdminController::class, 'applyLotDiscount']);
    Route::delete('inventory-lots/{inventoryLot}/lot-discount', [InventoryLotAdminController::class, 'clearLotDiscount']);
    Route::get('inventory-settings', [InventorySettingsAdminController::class, 'show']);
    Route::put('inventory-settings', [InventorySettingsAdminController::class, 'update']);
    Route::patch('purchase-orders/{purchase_order}/status', [PurchaseOrderAdminController::class, 'updateStatus']);
    Route::apiResource('purchase-orders', PurchaseOrderAdminController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::get('products/{product}/variant-pricing', [ProductAdminController::class, 'variantPricing']);
    Route::apiResource('products', ProductAdminController::class);
    Route::apiResource('banners', BannerAdminController::class);
    Route::apiResource('collections', CollectionAdminController::class);
    Route::apiResource('menus', MenuAdminController::class);

    // Settings (bulk must be BEFORE apiResource to avoid conflict with {setting})
    Route::put('/settings/bulk', [SettingAdminController::class, 'bulkUpdate']);
    Route::apiResource('settings', SettingAdminController::class);

    // Orders
    Route::get('orders', [OrderAdminController::class, 'index']);
    Route::post('orders/invoices/bulk-pdf', [InvoiceAdminController::class, 'bulkDownloadPdf']);
    Route::get('orders/{order}', [OrderAdminController::class, 'show']);
    Route::get('orders/{order}/invoice', [InvoiceAdminController::class, 'show']);
    Route::get('orders/{order}/invoice/pdf', [InvoiceAdminController::class, 'downloadPdf']);
    Route::patch('orders/{order}', [OrderAdminController::class, 'update']);
    Route::delete('orders/{order}', [OrderAdminController::class, 'destroy']);
    Route::get('orders/{order}/cod', [CodCollectionController::class, 'quote']);
    Route::post('orders/{order}/cod/plan', [CodCollectionController::class, 'setPlan']);
    Route::post('orders/{order}/cod/cash', [CodCollectionController::class, 'collectCash']);
    Route::post('orders/{order}/cod/khqr', [CodCollectionController::class, 'createKhqr']);
    Route::get('orders/{order}/cod/khqr/status', [CodCollectionController::class, 'khqrStatus']);
    Route::post('orders/{order}/cod/khqr/confirm', [CodCollectionController::class, 'confirmKhqr']);

    // Unified user profile (admin view)
    Route::get('users/{user}/profile', [UserProfileAdminController::class, 'show']);
    Route::put('users/{user}/password', [UserProfileAdminController::class, 'resetPassword']);
    Route::get('users/{user}/telegram-link', [TelegramLinkAdminController::class, 'status']);
    Route::post('users/{user}/telegram-link-code', [TelegramLinkAdminController::class, 'createCode']);
    Route::delete('users/{user}/telegram-link', [TelegramLinkAdminController::class, 'unlink']);
    Route::get('orders/{order}/driver-telegram-qr', [TelegramLinkAdminController::class, 'driverJobQr']);
    Route::post('orders/{order}/courier-job/unlock', [TelegramLinkAdminController::class, 'unlockCourierJob']);
    Route::post('orders/{order}/courier-job/lock', [TelegramLinkAdminController::class, 'lockCourierJob']);

    // Customers (full CRUD) - Using explicit routes to avoid implicit model binding
    Route::get('customers', [CustomerAdminController::class, 'index']);
    Route::post('customers', [CustomerAdminController::class, 'store']);
    Route::get('customers/{customer}', [CustomerAdminController::class, 'show']);
    Route::match(['put', 'patch'], 'customers/{customer}', [CustomerAdminController::class, 'update']);
    Route::delete('customers/{customer}', [CustomerAdminController::class, 'destroy']);

    // Reports
    Route::get('/reports/dashboard', [ReportController::class, 'dashboard']);
    Route::get('/reports/sales', [ReportController::class, 'sales']);
    Route::get('/reports/channel-sales', [ReportController::class, 'channelSales']);
    Route::get('/reports/monthly-driver-performance', [ReportController::class, 'monthlyDriverPerformance']);
    Route::get('/reports/top-products', [ReportController::class, 'topProducts']);
    Route::get('/reports/categories', [ReportController::class, 'categoryPerformance']);
    Route::get('/reports/product-analytics', [ReportController::class, 'productAnalytics']);
    Route::get('/reports/category-sales', [ReportController::class, 'categorySalesAnalytics']);
    Route::get('/reports/order-analytics', [ReportController::class, 'orderAnalytics']);
    Route::get('/reports/revenue-analytics', [ReportController::class, 'revenueAnalytics']);
    Route::get('/reports/stock-analytics', [ReportController::class, 'stockAnalytics']);
    Route::get('/reports/plan', [ReportController::class, 'plan']);
    Route::put('/reports/plan-target', [ReportController::class, 'updatePlanTarget']);
    Route::get('/reports/recent-orders', [ReportController::class, 'recentOrders']);
    Route::get('/reports/generate', [ReportController::class, 'generate']);
    Route::get('/reports/download-pdf', [ReportController::class, 'downloadPdf']);
    Route::get('/reports/download-excel', [ReportController::class, 'downloadExcel']);
    Route::post('/exports/table', [\App\Http\Controllers\Api\V1\Admin\Reports\TableExportController::class, 'export']);

    Route::get('/nav-badges', [\App\Http\Controllers\Api\V1\Admin\Dashboard\AdminNavBadgesController::class, 'index']);

    // Admin Search & Notifications
    Route::get('/search', [AdminSearchController::class, 'search']);
    Route::get('/ui-preferences', [AdminUiPreferenceController::class, 'show']);
    Route::put('/ui-preferences', [AdminUiPreferenceController::class, 'update']);
    Route::get('/loyalty/top-fans', [LoyaltyAdminController::class, 'topFans']);
    Route::get('/loyalty/rules', [LoyaltyAdminController::class, 'getRules']);
    Route::put('/loyalty/rules', [LoyaltyAdminController::class, 'updateRules']);
    Route::get('/notifications', [AdminNotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read', [AdminNotificationController::class, 'markAsRead']);
    Route::post('/notifications/mark-all-read', [AdminNotificationController::class, 'markAllRead']);
    Route::delete('/notifications/{id}', [AdminNotificationController::class, 'destroy']);

    // Contacts Management
    Route::apiResource('contacts', ContactController::class);
    Route::post('/contacts/bulk-update', [ContactController::class, 'bulkUpdate']);
    Route::post('/contacts/bulk-delete', [ContactController::class, 'bulkDelete']);

    // Profile Management
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::put('/profile', [ProfileController::class, 'update']);
    Route::put('/profile/password', [ProfileController::class, 'updatePassword']);
    Route::post('/profile/upload-image', [ProfileController::class, 'uploadImage']);

    // Footer & Header Management
    Route::get('/footer-header', [FooterHeaderController::class, 'index']);
    Route::get('/shipments/{shipment}/qr', [ShipmentQrController::class, 'png']);
    Route::put('/footer', [FooterHeaderController::class, 'updateFooter']);
    Route::put('/header', [FooterHeaderController::class, 'updateHeader']);
    Route::put('/social', [FooterHeaderController::class, 'updateSocial']);
    Route::post('/footer-header/seed', [FooterHeaderController::class, 'seedDefaults']);

    // Messages Management
    Route::apiResource('messages', \App\Http\Controllers\Api\V1\Admin\Communications\AdminMessageController::class);
    Route::patch('/messages/{message}/toggle-active', [\App\Http\Controllers\Api\V1\Admin\Communications\AdminMessageController::class, 'toggleActive']);
    Route::post('/messages/media-upload', [\App\Http\Controllers\Api\V1\Admin\Communications\AdminMessageController::class, 'uploadMedia']);

    // Chatbot Settings
    Route::get('/chatbot/settings', [ChatbotSettingsController::class, 'show']);
    Route::put('/chatbot/settings', [ChatbotSettingsController::class, 'update']);

    // Product discount management
    Route::get('/discounts/active/all', [DiscountAdminController::class, 'getActiveDiscounts']);
    Route::post('/discounts/bulk-toggle', [DiscountAdminController::class, 'bulkToggle']);
    Route::get('discounts', [DiscountAdminController::class, 'index']);
    Route::post('discounts', [DiscountAdminController::class, 'store']);
    Route::get('discounts/{discount}', [DiscountAdminController::class, 'show']);
    Route::match(['put', 'patch'], 'discounts/{discount}', [DiscountAdminController::class, 'update']);
    Route::delete('discounts/{discount}', [DiscountAdminController::class, 'destroy']);

    // Payments Management
    Route::get('/payments', [PaymentAdminController::class, 'index']);
    Route::get('/payments/{payment}', [PaymentAdminController::class, 'show']);
    Route::post('/payments/{payment}/verify', [PaymentAdminController::class, 'verify']);
    Route::post('/payments/{payment}/reject', [PaymentAdminController::class, 'reject']);
    Route::get('/payments/statistics', [PaymentAdminController::class, 'statistics']);

    // Delivery fees (checkout auto-pricing)
    Route::get('/delivery-fees', [DeliveryFeeAdminController::class, 'show']);
    Route::put('/delivery-fees', [DeliveryFeeAdminController::class, 'update']);

    // Shipments Management
    Route::get('/shipments', [ShipmentAdminController::class, 'index']);
    Route::get('/shipments/order/{orderId}', [ShipmentAdminController::class, 'byOrder']);
    Route::post('/shipments', [ShipmentAdminController::class, 'store']);
    Route::patch('/shipments/{shipment}/status', [ShipmentAdminController::class, 'updateStatus']);
    Route::patch('/shipments/{shipment}/delivery', [ShipmentAdminController::class, 'updateDeliveryInfo']);
    Route::post('/shipments/{shipment}/tracking-events', [ShipmentAdminController::class, 'addTrackingEvent']);
    Route::get('/shipments/providers', [ShipmentAdminController::class, 'providers']);

    // Drivers Management
    Route::get('/drivers', [DriverAdminController::class, 'index']);
    Route::post('/drivers', [DriverAdminController::class, 'store']);
    Route::match(['put', 'patch'], '/drivers/{driver}', [DriverAdminController::class, 'update']);
    Route::get('/drivers/{driver}/scans', [DriverAdminController::class, 'scans']);

    // Replacement Cases Management
    Route::get('/replacement-cases', [ReplacementCaseAdminController::class, 'index']);
    Route::post('/replacement-cases', [ReplacementCaseAdminController::class, 'store']);
    Route::get('/replacement-cases/order/{orderId}', [ReplacementCaseAdminController::class, 'byOrder']);
    Route::patch('/replacement-cases/{case}', [ReplacementCaseAdminController::class, 'update']);
    Route::post('/replacement-cases/{case}/approve', [ReplacementCaseAdminController::class, 'approve']);
    Route::post('/replacement-cases/{case}/reject', [ReplacementCaseAdminController::class, 'reject']);
    Route::post('/replacement-cases/{case}/complete', [ReplacementCaseAdminController::class, 'complete']);
    Route::get('/replacement-cases/statistics', [ReplacementCaseAdminController::class, 'statistics']);

    // Superadmin Routes (only accessible by superadmin)
    Route::middleware('superadmin')->group(function () {
        Route::get('/superadmin/users', [SuperAdminController::class, 'allUsers']);
        Route::post('/superadmin/admin-users', [SuperAdminController::class, 'createAdmin']);
        Route::put('/superadmin/admin-users/{user}', [SuperAdminController::class, 'updateAdmin']);
        Route::delete('/superadmin/admin-users/{user}', [SuperAdminController::class, 'deleteAdmin']);
        Route::get('/superadmin/permissions/catalog', [AdminPermissionController::class, 'catalog']);
        Route::get('/superadmin/users/{user}/permissions', [AdminPermissionController::class, 'show']);
        Route::patch('/superadmin/users/{user}/permissions', [AdminPermissionController::class, 'update']);
        Route::post('/superadmin/users/{user}/permissions/reset', [AdminPermissionController::class, 'reset']);
        Route::patch('/superadmin/users/{user}/role', [SuperAdminController::class, 'updateRole']);
        Route::patch('/superadmin/users/{user}/status', [SuperAdminController::class, 'updateStatus']);
        Route::get('/superadmin/users/{user}/sessions', [SuperAdminController::class, 'userSessions']);
        Route::delete('/superadmin/users/{user}/sessions/{session}', [SuperAdminController::class, 'revokeUserSession']);
        Route::get('/superadmin/statistics', [SuperAdminController::class, 'systemStatistics']);
        Route::get('/superadmin/user-logs', [SuperAdminController::class, 'userLogs']);
        Route::get('/superadmin/security-audit', [SecurityAuditController::class, 'adminIndex']);

        // Payment Settings Management (superadmin only)
        Route::get('/superadmin/payment-settings', [PaymentSettingsController::class, 'index']);
        Route::put('/superadmin/payment-settings', [PaymentSettingsController::class, 'update']);
    });
});

/*
|--------------------------------------------------------------------------
| API Version 1 (V1) Modular Routes
|--------------------------------------------------------------------------
| Follows the recommended production architecture:
| auth.php, storefront.php, pos.php, technician.php, admin.php
*/
Route::prefix('v1')->name('v1.')->group(function () {
    require __DIR__ . '/api/v1/auth.php';
    require __DIR__ . '/api/v1/storefront.php';
    require __DIR__ . '/api/v1/pos.php';
    require __DIR__ . '/api/v1/technician.php';
    require __DIR__ . '/api/v1/admin.php';
});

}); // throttle:api
