<?php

namespace App\Http\Controllers\Api\V1\Storefront\Catalog;

use App\Http\Controllers\Controller;
use App\Models\Collection;
use App\Services\StorefrontCacheService;
use App\Support\Media;
use Illuminate\Http\Request;

class CollectionController extends Controller
{
    /**
     * Active collections for homepage tiles.
     */
    public function index()
    {
        $items = StorefrontCacheService::remember(
            'collections',
            StorefrontCacheService::TTL_COLLECTIONS,
            'all',
            fn () => Collection::where('is_active', true)
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get()
                ->map(fn ($c) => $this->serialize($c))
                ->values()
                ->all()
        );

        return response()->json(['data' => $items]);
    }

    /**
     * Single collection for landing page (hero + product filters).
     */
    public function show(string $slug)
    {
        $collection = Collection::where('slug', $slug)
            ->where('is_active', true)
            ->first();

        if (!$collection) {
            return response()->json(['message' => 'Collection not found'], 404);
        }

        return response()->json($this->serialize($collection));
    }

    /**
     * Get collections by gender
     */
    public function gender(string $gender)
    {
        $items = Collection::where('gender', $gender)
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get()
            ->map(fn ($c) => $this->serialize($c));

        return response()->json(['data' => $items]);
    }

    private function serialize(Collection $c): array
    {
        $parent = $c->gender
            ? ucfirst(strtolower((string) $c->gender))
            : null;

        return [
            'id' => $c->id,
            'name' => $c->name,
            'subtitle' => $c->subtitle,
            'slug' => $c->slug,
            'gender' => $c->gender ?? null,
            'placement' => $c->placement ?: 'home',
            'parent_category' => $parent,
            'image_url' => Media::url($c->image_url),
            'image_path' => $c->image_url,
            'text_position' => $c->text_position ?? 'overlay',
            'link' => $c->link ?: ($c->slug ? '/collections/' . $c->slug : null),
            'sort_order' => (int) ($c->sort_order ?? 0),
            'is_active' => (bool) $c->is_active,
        ];
    }
}
