<?php

namespace App\Http\Controllers\Api\V1\Admin\Products;

use App\Http\Controllers\Api\V1\Admin\BaseAdminController;

use App\Models\Collection;
use App\Services\StorefrontCacheService;
use App\Support\Media;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CollectionAdminController extends BaseAdminController
{
    public function index()
    {
        $items = Collection::orderBy('gender')->orderBy('sort_order')->get()->map(fn ($c) => $this->serialize($c));

        return response()->json(['data' => $items]);
    }

    public function store(Request $request)
    {
        $v = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'subtitle' => ['nullable', 'string', 'max:255'],
            'gender' => ['required', 'in:men,women,boys,girls'],
            'placement' => ['nullable', 'in:home,explore'],
            'slug' => ['nullable', 'string', 'max:255', 'unique:collections,slug'],
            'text_position' => ['required', 'in:top,overlay,bottom'],
            'link' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer'],
            'is_active' => ['nullable'],
            'image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,avif', 'max:5120'],
        ]);

        $slug = $v['slug'] ?? Str::slug($v['name']);
        $path = $this->storeImage($request, 'image', 'collections');

        $c = Collection::create([
            'name' => $v['name'],
            'subtitle' => $v['subtitle'] ?? null,
            'gender' => $v['gender'],
            'placement' => $v['placement'] ?? 'home',
            'slug' => $slug,
            'image_url' => $path,
            'text_position' => $v['text_position'],
            'link' => $v['link'] ?? null,
            'sort_order' => $v['sort_order'] ?? 0,
            'is_active' => $this->bool($request->input('is_active', true)),
        ]);

        $this->bustCache();

        return response()->json(['data' => $this->serialize($c)], 201);
    }

    public function update(Request $request, Collection $collection)
    {
        $v = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            'subtitle' => ['sometimes', 'nullable', 'string', 'max:255'],
            'gender' => ['sometimes', 'required', 'in:men,women,boys,girls'],
            'placement' => ['sometimes', 'nullable', 'in:home,explore'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255', 'unique:collections,slug,' . $collection->id],
            'text_position' => ['sometimes', 'required', 'in:top,overlay,bottom'],
            'link' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sort_order' => ['sometimes', 'nullable', 'integer'],
            'is_active' => ['sometimes'],
            'image' => ['sometimes', 'nullable', 'file', 'mimes:jpg,jpeg,png,webp,avif', 'max:5120'],
            'remove_image' => ['sometimes', 'nullable'],
        ]);

        foreach (['name', 'subtitle', 'gender', 'placement', 'text_position', 'link'] as $f) {
            if ($request->has($f)) {
                $collection->$f = $request->input($f);
            }
        }
        if ($request->has('slug')) {
            $collection->slug = $request->input('slug') ?: Str::slug($collection->name);
        }
        if ($request->has('sort_order')) {
            $collection->sort_order = $request->input('sort_order') ?? 0;
        }
        if ($request->has('is_active')) {
            $collection->is_active = $this->bool($request->input('is_active'));
        }

        if ($this->bool($request->input('remove_image', false)) && $collection->image_url) {
            $this->deleteMediaPath($collection->image_url);
            $collection->image_url = null;
        }

        $newPath = $this->storeImage($request, 'image', 'collections');
        if ($newPath) {
            $this->deleteMediaPath($collection->image_url);
            $collection->image_url = $newPath;
        }

        $collection->save();
        $this->bustCache();

        return response()->json(['data' => $this->serialize($collection)]);
    }

    public function destroy(Collection $collection)
    {
        $this->deleteMediaPath($collection->image_url);
        $collection->delete();
        $this->bustCache();

        return response()->json(['ok' => true]);
    }

    private function serialize(Collection $c): array
    {
        return [
            'id' => $c->id,
            'name' => $c->name,
            'subtitle' => $c->subtitle,
            'slug' => $c->slug,
            'gender' => $c->gender,
            'placement' => $c->placement ?: 'home',
            'image_url' => Media::url($c->image_url),
            'text_position' => $c->text_position,
            'link' => $c->link,
            'sort_order' => $c->sort_order,
            'is_active' => $c->is_active,
        ];
    }

    private function bustCache(): void
    {
        StorefrontCacheService::bump('collections');
        StorefrontCacheService::bumpHomepageBootstrap();
    }
}
