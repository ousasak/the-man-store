<?php

namespace App\Http\Controllers\Api\V1\Admin\Dashboard;

use App\Http\Controllers\Api\BaseApiController;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends BaseApiController
{
    public function index(Request $request): JsonResponse
    {
        return $this->sendResponse([
            'summary' => [
                'total_sales'      => 0,
                'total_orders'     => 0,
                'active_repairs'   => 0,
                'low_stock_items'  => 0,
            ],
            'recent_activities' => [],
        ], 'Admin dashboard metrics retrieved.');
    }
}
