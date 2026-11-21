<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\V1\Technician\Repairs\RepairController;

Route::prefix('technician')->middleware(['auth:sanctum'])->group(function () {
    Route::prefix('repairs')->group(function () {
        Route::get('/', [RepairController::class, 'assignedTickets']);
        Route::patch('/{id}/status', [RepairController::class, 'updateStatus']);
    });
});
