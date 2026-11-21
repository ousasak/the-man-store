<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\Cashier\POS\PosController;

/*
|--------------------------------------------------------------------------
| POS (Point of Sale) & Cashier Routes
|--------------------------------------------------------------------------
| Dedicated for in-store registers, barcode scanning, shift cash drawer,
| and high-speed in-person sales checkout.
*/
Route::prefix('pos')->middleware(['auth:sanctum'])->group(function () {
    Route::get('/session', [PosController::class, 'sessionStatus']);
    Route::post('/checkout', [PosController::class, 'checkout']);

    Route::prefix('registers')->group(function () {
        // Shift opening, cash counting, drawer closing
    });

    Route::prefix('quick-search')->group(function () {
        // Barcode / IMEI / Phone lookup
    });
});
