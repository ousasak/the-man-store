<?php

namespace App\Observers;

use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Collection;
use App\Models\Setting;
use App\Services\StorefrontCacheService;
use Illuminate\Database\Eloquent\Model;

class StorefrontCatalogCacheObserver
{
    public function saved(Model $model): void
    {
        $this->invalidate($model);
    }

    public function deleted(Model $model): void
    {
        $this->invalidate($model);
    }

    private function invalidate(Model $model): void
    {
        if ($model instanceof Banner) {
            StorefrontCacheService::bump('banners');
            StorefrontCacheService::bumpHomepageBootstrap();

            return;
        }

        if ($model instanceof Brand) {
            StorefrontCacheService::bumpHomepageBootstrap();

            return;
        }

        if ($model instanceof Category) {
            StorefrontCacheService::bump('categories');
            StorefrontCacheService::bumpProducts();

            return;
        }

        if ($model instanceof Collection) {
            StorefrontCacheService::bump('collections');
            StorefrontCacheService::bumpHomepageBootstrap();

            return;
        }

        if ($model instanceof Setting) {
            if ($model->group === 'homepage' || in_array($model->key, ['font_en', 'font_km'], true)) {
                StorefrontCacheService::bump('homepage-settings');
                StorefrontCacheService::bumpHomepageBootstrap();
            }
        }
    }
}
