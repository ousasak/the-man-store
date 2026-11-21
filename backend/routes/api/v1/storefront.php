<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\Storefront\Catalog\StorefrontController;

/*
|--------------------------------------------------------------------------
| Storefront (Web & Mobile Customer) Routes
|--------------------------------------------------------------------------
| Public & customer-facing endpoints for browsing catalog, banner promotions,
| cart synchronization, customer profile, and online checkout.
*/
Route::prefix('storefront')->group(function () {
    Route::get('/bootstrap', [StorefrontController::class, 'bootstrap']);
    Route::get('/products', [StorefrontController::class, 'products']);
    Route::get('/products/{id}', [StorefrontController::class, 'productDetails']);

    Route::middleware('auth:sanctum')->group(function () {
        // Customer profile, order history, wishlist
    });
});
