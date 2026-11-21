<?php

namespace App\Http\Controllers\Api\V1\Storefront\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Services\StorefrontCacheService;
use App\Support\Media;

class CategoryController extends Controller
{
    public function index()
    {
        $cats = StorefrontCacheService::remember(
            'categories',
            StorefrontCacheService::TTL_CATEGORIES,
            'all',
            fn () => Category::query()
                ->where('is_active', true)
                ->catalogOnly()
                ->orderBy('sort_order')
                ->get()
                ->map(fn ($c) => [
                    'id' => $c->id,
                    'name' => $c->name,
                    'slug' => $c->slug,
                    'type' => $c->type,
                    'image_url' => Media::url($c->image_path),
                ])
                ->values()
                ->all()
        );

        return response()->json($cats);
    }
}
