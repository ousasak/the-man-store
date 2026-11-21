<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\Admin\Dashboard\DashboardController;

Route::prefix('admin')->middleware(['auth:sanctum', 'admin'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index']);

    // Admin module sub-groups (Products, Inventory, Purchases, Sales, Customers, etc.)
    Route::prefix('products')->group(function () {
        // Product catalog management
    });

    Route::prefix('inventory')->group(function () {
        // Device serials, stock transfer, lot tracking
    });

    Route::prefix('purchases')->group(function () {
        // Supplier purchases & POs
    });

    Route::prefix('sales')->group(function () {
        // Order history, invoice management
    });

    Route::prefix('customers')->group(function () {
        // Customer CRM & loyalty
    });

    Route::prefix('suppliers')->group(function () {
        // Supplier directory
    });

    Route::prefix('warranty')->group(function () {
        // Device warranty claims & tracking
    });

    Route::prefix('repairs')->group(function () {
        // Repair ticket management & parts
    });

    Route::prefix('trade-ins')->group(function () {
        // Used device evaluation & trade-in intake
    });

    Route::prefix('payments')->group(function () {
        // Payment gateway logs & Bakong KHQR verification
    });

    Route::prefix('expenses')->group(function () {
        // Store operational expense logging
    });

    Route::prefix('cash-registers')->group(function () {
        // Cash drawer shifts, opening & closing balance
    });

    Route::prefix('employees')->group(function () {
        // Staff profiles, roles, and shift assignments
    });

    Route::prefix('branches')->group(function () {
        // Multi-branch stores and warehouses
    });

    Route::prefix('reports')->group(function () {
        // Analytical reports (Sales, P&L, Inventory valuation)
    });

    Route::prefix('settings')->group(function () {
        // Store configuration, taxes, print templates
    });
});
