<?php

namespace App\Http\Controllers\Api\V1\Admin\Sales;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\ShipmentTrackingEvent;
use App\Support\OrderAdminFilters;
use App\Support\OrderMetrics;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OrderAdminController extends Controller
{
    public function index(Request $request)
    {
        $perPage = min(max((int) $request->input('per_page', 20), 1), 1000);
        $compact = $request->boolean('compact');
        $statuses = OrderAdminFilters::parseArrayParam($request, 'statuses');

        $query = Order::query();

        if ($compact) {
            $query->select([
                'orders.id',
                'orders.user_id',
                'orders.order_number',
                'orders.status',
                'orders.payment_status',
                'orders.payment_method',
                'orders.total',
                'orders.created_at',
            ])->with(['user:id,name,email,profile_image_path'])
                ->withCount('items');
        } else {
            $query->with(['user', 'items.product', 'items.inventoryLot']);
        }

        OrderAdminFilters::applyListFilters($query, $request);

        $includeSummary = $request->boolean('include_summary', ! $compact);

        $summary = [
            'order_count' => 0,
            'total_items' => 0,
            'total_revenue' => 0.0,
        ];

        if ($includeSummary) {
            $summaryQuery = clone $query;
            $revenueQuery = OrderAdminFilters::applyRevenueScope(clone $summaryQuery, $statuses);

            $summary = [
                'order_count' => (int) (clone $summaryQuery)->count('orders.id'),
                'total_items' => OrderMetrics::sumItemQtyForOrders(clone $summaryQuery),
                'total_revenue' => round((float) (clone $revenueQuery)->sum('orders.total'), 2),
            ];
        }

        $paginator = (clone $query)->orderByDesc('orders.id')->paginate($perPage);

        return response()->json(array_merge($paginator->toArray(), [
            'summary' => $summary,
        ]));
    }

    public function show(Order $order)
    {
        return $order->load([
            'user',
            'items.product.category',
            'items.inventoryLot',
            'shipment.trackingEvents',
            'shipment.deliveredByUser',
            'payments' => fn ($q) => $q->latest('id'),
        ]);
    }

    public function update(Request $request, Order $order)
    {
        $data = $request->validate([
            'status' => [
                'required',
                'string',
                Rule::in([
                    'pending',
                    'pending_payment',
                    'processing',
                    'preparing',
                    'shipped',
                    'in_transit',
                    'arrived',
                    'completed',
                    'delivered',
                    'cancelled',
                    'failed',
                    'returned',
                ]),
            ],
        ]);

        $status = strtolower($data['status']);
        if ($status === 'delivered') {
            $status = 'completed';
        }
        if ($status === 'pending') {
            $status = 'pending_payment';
        }

        $order->update(['status' => $status]);
        $this->syncShipmentWithOrderStatus($order->fresh(['shipment']), $status);

        return $order->fresh()->load(['user', 'items.product.category', 'shipment']);
    }

    private function syncShipmentWithOrderStatus(Order $order, string $orderStatus): void
    {
        $shipment = $order->shipment;
        if (! $shipment) {
            return;
        }

        $shipmentStatus = match ($orderStatus) {
            'processing', 'preparing' => 'processing',
            'shipped' => 'shipped',
            'in_transit' => 'in_transit',
            'arrived' => 'arrived',
            'completed' => 'delivered',
            default => null,
        };

        if ($shipmentStatus === null || strtolower((string) $shipment->status) === $shipmentStatus) {
            return;
        }

        $shippedAt = $shipment->shipped_at;
        $deliveredAt = $shipment->delivered_at;
        if (in_array($shipmentStatus, ['shipped', 'in_transit', 'arrived', 'delivered'], true) && ! $shippedAt) {
            $shippedAt = now();
        }
        if ($shipmentStatus === 'delivered' && ! $deliveredAt) {
            $deliveredAt = now();
        }

        $shipment->update([
            'status' => $shipmentStatus,
            'shipped_at' => $shippedAt,
            'delivered_at' => $deliveredAt,
        ]);

        ShipmentTrackingEvent::create([
            'shipment_id' => $shipment->id,
            'status' => $shipmentStatus,
            'note' => 'Status synced from admin order fulfillment.',
            'updated_by' => auth()->guard('sanctum')->id(),
            'event_time' => now(),
        ]);
    }

    public function destroy(Order $order)
    {
        $order->items()->delete();
        $order->payments()->delete();
        if ($order->shipment) {
            $order->shipment()->delete();
        }
        $order->replacementCases()->delete();
        $order->delete();

        return response()->json(['message' => 'Order deleted']);
    }
}
