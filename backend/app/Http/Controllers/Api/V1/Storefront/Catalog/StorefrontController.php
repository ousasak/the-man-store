<?php

namespace App\Http\Controllers\Api\V1\Storefront\Catalog;

use App\Http\Controllers\Api\BaseApiController;
use App\Models\Product;
use App\Models\Category;
use App\Models\Banner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StorefrontController extends BaseApiController
{
    public function bootstrap(): JsonResponse
    {
        return $this->sendResponse([
            'featured_categories' => Category::take(8)->get(),
            'banners'             => Banner::take(5)->get(),
            'store'               => [
                'name'     => 'The Man Store',
                'currency' => 'USD',
            ],
        ], 'Storefront bootstrap data loaded.');
    }

    public function products(Request $request): JsonResponse
    {
        $products = Product::with(['category', 'images'])->paginate(15);
        return $this->paginatedResponse($products, 'Products retrieved.');
    }

    public function productDetails(int $id): JsonResponse
    {
        $product = Product::with(['category', 'images', 'brand'])->findOrFail($id);
        return $this->sendResponse($product, 'Product details.');
    }
}
