<?php

namespace App\Http\Resources\Products;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductResource extends JsonResource
{
    /**
     * Transform product model into customer-facing array.
     * Strictly hides sensitive fields like cost_price, supplier_id, and margin calculations.
     */
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'name'                => $this->name,
            'slug'                => $this->slug,
            'sku'                 => $this->sku,
            'barcode'             => $this->barcode_code ?? $this->barcode,
            'price'               => (float) ($this->price ?? $this->base_price),
            'compare_at_price'    => $this->compare_at_price ? (float) $this->compare_at_price : null,
            'discount_price'      => $this->discount_price ? (float) $this->discount_price : null,
            'discount_percentage' => $this->discount_percentage ? (float) $this->discount_percentage : null,
            'final_price'         => (float) ($this->final_price ?? $this->price),
            'image_url'           => $this->image_url,
            'gallery'             => $this->gallery ?? [],
            'stock'               => (int) ($this->stock ?? 0),
            'in_stock'            => (bool) (($this->stock ?? 0) > 0),
            'category'            => $this->whenLoaded('category', fn() => [
                'id'   => $this->category?->id,
                'name' => $this->category?->name,
                'slug' => $this->category?->slug,
            ]),
            'brand'               => $this->whenLoaded('brand', fn() => [
                'id'   => $this->brand?->id,
                'name' => $this->brand?->name,
                'slug' => $this->brand?->slug,
            ]),
            'attributes'          => $this->attributes ?? [],
            'colors'              => $this->colors ?? [],
            'sizes'               => $this->sizes ?? [],
            'description'         => $this->description,
            'created_at'          => $this->created_at?->toIso8601String(),
        ];
    }
}
