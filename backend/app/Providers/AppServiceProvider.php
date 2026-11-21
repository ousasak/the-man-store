<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Route;
use App\Models\User;
use App\Models\Order;
use App\Models\Product;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Collection;
use App\Models\Setting;
use App\Models\Shipment;
use App\Observers\OrderObserver;
use App\Observers\ProductObserver;
use App\Observers\ShipmentObserver;
use App\Observers\StorefrontCatalogCacheObserver;
use Illuminate\Auth\Notifications\ResetPassword;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->booting(function () {
            $name = (string) config('database.connections.pgsql.database', '');
            $clean = preg_replace('/[^A-Za-z0-9._-]/', '', $name) ?? $name;
            if ($clean !== '' && $clean !== $name) {
                config(['database.connections.pgsql.database' => $clean]);
            }
            // Never let Laravel re-parse a quoted DATABASE_URL into dbname.
            config(['database.connections.pgsql.url' => null]);
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Route model binding for customer parameter
        Route::model('customer', User::class);

        ResetPassword::createUrlUsing(function (User $user, string $token): string {
            $frontendUrl = rtrim(config('app.frontend_url'), '/');

            return $frontendUrl.'/reset-password?token='.$token.'&email='.urlencode($user->email);
        });

        Order::observe(OrderObserver::class);
        Product::observe(ProductObserver::class);
        Shipment::observe(ShipmentObserver::class);

        $catalogCacheObserver = StorefrontCatalogCacheObserver::class;
        Banner::observe($catalogCacheObserver);
        Brand::observe($catalogCacheObserver);
        Category::observe($catalogCacheObserver);
        Collection::observe($catalogCacheObserver);
        Setting::observe($catalogCacheObserver);

        // Asynchronous Events & Listeners (Order Paid, Telegram Alert, PDF Generation)
        \Illuminate\Support\Facades\Event::listen(
            \App\Events\OrderPaidEvent::class,
            \App\Listeners\SendTelegramOrderAlertListener::class
        );
        \Illuminate\Support\Facades\Event::listen(
            \App\Events\OrderPaidEvent::class,
            \App\Listeners\GenerateInvoicePdfListener::class
        );
    }
}

