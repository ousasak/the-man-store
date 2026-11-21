<?php

namespace App\Services;

use App\Models\Category;
use App\Models\InventoryLot;
use App\Models\InventoryLotDetailEvent;
use App\Models\InventoryLotPriceEvent;
use App\Models\Product;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class InventoryLotBulkService
{
    public const ACTION_SET_ON_HOLD = 'set_on_hold';

    public const ACTION_RELEASE_HOLD = 'release_hold';

    public const ACTION_MARK_CLEARANCE = 'mark_clearance';

    public const ACTION_REVERT_CLEARANCE = 'revert_clearance';

    public const ACTION_APPLY_LOT_DISCOUNT = 'apply_lot_discount';

    public const ACTION_REMOVE_LOT_DISCOUNT = 'remove_lot_discount';

    public const ACTION_SET_UNIT_PRICE = 'set_unit_price';

    /** @var list<string> */
    public const ACTIONS = [
        self::ACTION_SET_ON_HOLD,
        self::ACTION_RELEASE_HOLD,
        self::ACTION_MARK_CLEARANCE,
        self::ACTION_REVERT_CLEARANCE,
        self::ACTION_APPLY_LOT_DISCOUNT,
        self::ACTION_REMOVE_LOT_DISCOUNT,
        self::ACTION_SET_UNIT_PRICE,
    ];

    public function __construct(
        private readonly InventoryLotService $lots,
        private readonly InventoryLotPriceAuditService $priceAudit,
        private readonly InventoryLotDetailAuditService $detailAudit,
    ) {
    }

    /**
     * @param  list<int>  $stockLabelIds
     * @return list<int>
     */
    public function expandStockLabelIds(array $stockLabelIds): array
    {
        $ids = collect($stockLabelIds)
            ->map(fn ($id) => (int) $id)
            ->filter(fn ($id) => $id > 0)
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return [];
        }

        $categories = Category::query()
            ->whereIn('id', $ids)
            ->where('type', PaidOrderInventory::BARCODE_CATEGORY_TYPE)
            ->get(['id', 'parent_id']);

        $expanded = collect();
        foreach ($categories as $category) {
            $expanded->push((int) $category->id);
            if ($category->parent_id === null) {
                $childIds = Category::query()
                    ->where('parent_id', $category->id)
                    ->where('type', PaidOrderInventory::BARCODE_CATEGORY_TYPE)
                    ->pluck('id');
                $expanded = $expanded->merge($childIds);
            }
        }

        return $expanded->unique()->values()->all();
    }

    /**
     * @param  list<int>  $stockLabelIds
     * @return Collection<int, InventoryLot>
     */
    public function lotsForStockLabels(array $stockLabelIds, bool $skipSoldOut = true): Collection
    {
        $labelIds = $this->expandStockLabelIds($stockLabelIds);
        if ($labelIds === []) {
            return collect();
        }

        $productIds = Product::query()
            ->whereIn('stock_label_id', $labelIds)
            ->pluck('id');

        if ($productIds->isEmpty()) {
            return collect();
        }

        $query = InventoryLot::query()->whereIn('product_id', $productIds);

        if ($skipSoldOut) {
            $query->where('quantity_on_hand', '>', 0);
        }

        return $query->orderBy('id')->get();
    }

    /**
     * @param  list<array{product_id: int, size?: string|null, color?: string|null}>  $variants
     * @return Collection<int, InventoryLot>
     */
    public function lotsForVariants(array $variants, bool $skipSoldOut = true): Collection
    {
        $lots = collect();

        foreach ($variants as $variant) {
            if (! is_array($variant)) {
                continue;
            }

            $productId = (int) ($variant['product_id'] ?? 0);
            if ($productId <= 0) {
                continue;
            }

            $size = isset($variant['size']) && $variant['size'] !== '' ? (string) $variant['size'] : null;
            $color = isset($variant['color']) && $variant['color'] !== '' ? (string) $variant['color'] : null;

            $variantLots = $this->lots->listForVariant($productId, $size, $color);
            if ($skipSoldOut) {
                $variantLots = $variantLots->filter(
                    fn (InventoryLot $lot) => (int) $lot->quantity_on_hand > 0
                );
            }

            $lots = $lots->merge($variantLots);
        }

        return $lots->unique('id')->sortBy('id')->values();
    }

    /**
     * @param  list<int>  $stockLabelIds
     * @param  list<array{product_id: int, size?: string|null, color?: string|null}>  $variants
     * @return Collection<int, InventoryLot>
     */
    public function resolveLots(array $stockLabelIds, array $variants, bool $skipSoldOut = true): Collection
    {
        if ($variants !== []) {
            return $this->lotsForVariants($variants, $skipSoldOut);
        }

        return $this->lotsForStockLabels($stockLabelIds, $skipSoldOut);
    }

    /**
     * @param  list<int>  $stockLabelIds
     * @param  list<array{product_id: int, size?: string|null, color?: string|null}>  $variants
     * @return array<string, int>
     */
    public function summarize(array $stockLabelIds, bool $skipSoldOut = true, array $variants = []): array
    {
        $variants = $this->normalizeVariants($variants);
        $lots = $this->resolveLots($stockLabelIds, $variants, $skipSoldOut);

        $base = $variants !== []
            ? [
                'variant_count' => count($variants),
                'stock_label_count' => 0,
                'expanded_label_count' => 0,
                'linked_product_count' => collect($variants)
                    ->pluck('product_id')
                    ->map(fn ($id) => (int) $id)
                    ->filter(fn ($id) => $id > 0)
                    ->unique()
                    ->count(),
                'lot_count' => $lots->count(),
            ]
            : (function () use ($stockLabelIds, $lots) {
                $uniqueLabels = array_values(array_unique(array_map('intval', $stockLabelIds)));
                $expanded = $this->expandStockLabelIds($uniqueLabels);

                return [
                    'variant_count' => 0,
                    'stock_label_count' => count($uniqueLabels),
                    'expanded_label_count' => count($expanded),
                    'linked_product_count' => $expanded === []
                        ? 0
                        : (int) Product::query()->whereIn('stock_label_id', $expanded)->count(),
                    'lot_count' => $lots->count(),
                ];
            })();

        return array_merge($base, $this->selectionInsights($lots));
    }

    /**
     * @param  Collection<int, InventoryLot>  $lots
     * @return array{listing_status: array<string, int>, action_eligible: array<string, int>}
     */
    public function selectionInsights(Collection $lots): array
    {
        $listingStatus = [];
        $actionEligible = array_fill_keys(self::ACTIONS, 0);

        foreach ($lots as $lot) {
            $status = (string) ($lot->listing_status ?? InventoryLot::LISTING_ACTIVE);
            $listingStatus[$status] = ($listingStatus[$status] ?? 0) + 1;

            foreach (self::ACTIONS as $action) {
                if ($this->isLotEligibleForAction($lot, $action)) {
                    $actionEligible[$action]++;
                }
            }
        }

        return [
            'listing_status' => $listingStatus,
            'action_eligible' => $actionEligible,
        ];
    }

    public function isLotEligibleForAction(InventoryLot $lot, string $action): bool
    {
        return match ($action) {
            self::ACTION_SET_ON_HOLD => ! (
                $lot->listing_status === InventoryLot::LISTING_ON_HOLD && ! $lot->is_sellable
            ),
            self::ACTION_RELEASE_HOLD => $lot->listing_status === InventoryLot::LISTING_ON_HOLD,
            self::ACTION_MARK_CLEARANCE => true,
            self::ACTION_REVERT_CLEARANCE => $lot->listing_status === InventoryLot::LISTING_CLEARANCE,
            self::ACTION_APPLY_LOT_DISCOUNT, self::ACTION_SET_UNIT_PRICE => true,
            self::ACTION_REMOVE_LOT_DISCOUNT => ($this->priceAudit->snapshot($lot)['discount_percent_off'] ?? 0) > 0,
            default => false,
        };
    }

    /**
     * @param  list<int>  $stockLabelIds
     * @param  list<array{product_id: int, size?: string|null, color?: string|null}>  $variants
     * @param  array<string, mixed>  $params
     * @return array<string, mixed>
     */
    public function apply(string $action, array $stockLabelIds, array $params, int $userId, array $variants = []): array
    {
        $skipSoldOut = ($params['skip_sold_out'] ?? true) !== false;
        $variants = $this->normalizeVariants($variants);
        $lots = $this->resolveLots($stockLabelIds, $variants, $skipSoldOut);

        $updated = 0;
        $skipped = 0;
        $errors = [];

        DB::transaction(function () use ($action, $lots, $params, $userId, &$updated, &$skipped, &$errors) {
            foreach ($lots as $lot) {
                try {
                    if ($this->applyToLot($lot, $action, $params, $userId)) {
                        $updated++;
                    } else {
                        $skipped++;
                    }
                } catch (\Throwable $e) {
                    $errors[] = 'Lot #'.$lot->id.': '.$e->getMessage();
                }
            }
        });

        return array_merge(
            $this->summarize($stockLabelIds, $skipSoldOut, $variants),
            [
                'updated' => $updated,
                'skipped' => $skipped,
                'errors' => $errors,
            ],
        );
    }

    /**
     * @param  list<array{product_id?: mixed, size?: mixed, color?: mixed}>  $variants
     * @return list<array{product_id: int, size: ?string, color: ?string}>
     */
    private function normalizeVariants(array $variants): array
    {
        $out = [];
        foreach ($variants as $variant) {
            if (! is_array($variant)) {
                continue;
            }
            $productId = (int) ($variant['product_id'] ?? 0);
            if ($productId <= 0) {
                continue;
            }
            $size = isset($variant['size']) && $variant['size'] !== '' && $variant['size'] !== null
                ? (string) $variant['size']
                : null;
            $color = isset($variant['color']) && $variant['color'] !== '' && $variant['color'] !== null
                ? (string) $variant['color']
                : null;
            $out[] = [
                'product_id' => $productId,
                'size' => $size,
                'color' => $color,
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function applyToLot(InventoryLot $lot, string $action, array $params, int $userId): bool
    {
        return match ($action) {
            self::ACTION_SET_ON_HOLD => $this->applySetOnHold($lot, $userId),
            self::ACTION_RELEASE_HOLD => $this->applyReleaseHold($lot, $userId),
            self::ACTION_MARK_CLEARANCE => $this->applyMarkClearance($lot, $params, $userId),
            self::ACTION_REVERT_CLEARANCE => $this->applyRevertClearance($lot, $userId),
            self::ACTION_APPLY_LOT_DISCOUNT => $this->applyLotDiscount($lot, $params, $userId),
            self::ACTION_REMOVE_LOT_DISCOUNT => $this->applyRemoveLotDiscount($lot, $userId),
            self::ACTION_SET_UNIT_PRICE => $this->applySetUnitPrice($lot, $params, $userId),
            default => false,
        };
    }

    private function applySetOnHold(InventoryLot $lot, int $userId): bool
    {
        if ($lot->listing_status === InventoryLot::LISTING_ON_HOLD && ! $lot->is_sellable) {
            return false;
        }

        $before = $this->detailAudit->snapshot($lot);
        $updated = $this->lots->setOnHold($lot);
        $this->detailAudit->record(
            $updated,
            $userId,
            InventoryLotDetailEvent::ACTION_SET_ON_HOLD,
            $before,
            $this->detailAudit->snapshot($updated),
        );

        return true;
    }

    private function applyReleaseHold(InventoryLot $lot, int $userId): bool
    {
        if ($lot->listing_status !== InventoryLot::LISTING_ON_HOLD) {
            return false;
        }

        $before = $this->detailAudit->snapshot($lot);
        $updated = $this->lots->releaseFromHold($lot);
        $this->detailAudit->record(
            $updated,
            $userId,
            InventoryLotDetailEvent::ACTION_SET_SELLABLE,
            $before,
            $this->detailAudit->snapshot($updated),
        );

        return true;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function applyMarkClearance(InventoryLot $lot, array $params, int $userId): bool
    {
        if ($lot->listing_status === InventoryLot::LISTING_CLEARANCE
            && ! array_key_exists('unit_price', $params)
            && ! array_key_exists('price_percent', $params)) {
            return false;
        }

        $wasClearance = $lot->listing_status === InventoryLot::LISTING_CLEARANCE;
        $priceBefore = $this->priceAudit->snapshot($lot);
        $detailBefore = $this->detailAudit->snapshot($lot);

        $unitPrice = array_key_exists('unit_price', $params) && $params['unit_price'] !== null
            ? (float) $params['unit_price']
            : null;
        $pricePercent = array_key_exists('price_percent', $params) && $params['price_percent'] !== null
            ? (float) $params['price_percent']
            : null;

        $updated = $this->lots->markClearance($lot, $unitPrice, $pricePercent);

        $this->priceAudit->record(
            $updated,
            $userId,
            $wasClearance
                ? InventoryLotPriceEvent::ACTION_UPDATE_CLEARANCE
                : InventoryLotPriceEvent::ACTION_MARK_CLEARANCE,
            $priceBefore,
            $this->priceAudit->snapshot($updated),
        );

        $this->detailAudit->record(
            $updated,
            $userId,
            InventoryLotDetailEvent::ACTION_MARK_CLEARANCE,
            $detailBefore,
            $this->detailAudit->snapshot($updated),
        );

        return true;
    }

    private function applyRevertClearance(InventoryLot $lot, int $userId): bool
    {
        if ($lot->listing_status !== InventoryLot::LISTING_CLEARANCE) {
            return false;
        }

        $priceBefore = $this->priceAudit->snapshot($lot);
        $detailBefore = $this->detailAudit->snapshot($lot);
        $updated = $this->lots->revertFromClearance($lot);

        $this->priceAudit->record(
            $updated,
            $userId,
            InventoryLotPriceEvent::ACTION_REVERT_CLEARANCE,
            $priceBefore,
            $this->priceAudit->snapshot($updated),
        );

        $this->detailAudit->record(
            $updated,
            $userId,
            InventoryLotDetailEvent::ACTION_REVERT_CLEARANCE,
            $detailBefore,
            $this->detailAudit->snapshot($updated),
        );

        return true;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function applyLotDiscount(InventoryLot $lot, array $params, int $userId): bool
    {
        $percent = (float) ($params['discount_percent'] ?? 0);
        if ($percent <= 0) {
            return false;
        }

        $before = $this->priceAudit->snapshot($lot);
        $hadDiscount = ($before['discount_percent_off'] ?? 0) > 0;
        $updated = $this->lots->applyLotDiscount($lot, $percent);

        $this->priceAudit->record(
            $updated,
            $userId,
            $hadDiscount
                ? InventoryLotPriceEvent::ACTION_UPDATE_LOT_DISCOUNT
                : InventoryLotPriceEvent::ACTION_APPLY_LOT_DISCOUNT,
            $before,
            $this->priceAudit->snapshot($updated),
            ['discount_percent' => $percent],
        );

        return true;
    }

    private function applyRemoveLotDiscount(InventoryLot $lot, int $userId): bool
    {
        $before = $this->priceAudit->snapshot($lot);
        if (($before['discount_percent_off'] ?? 0) <= 0) {
            return false;
        }

        $updated = $this->lots->clearLotDiscount($lot);

        $this->priceAudit->record(
            $updated,
            $userId,
            InventoryLotPriceEvent::ACTION_REMOVE_LOT_DISCOUNT,
            $before,
            $this->priceAudit->snapshot($updated),
        );

        return true;
    }

    /**
     * @param  array<string, mixed>  $params
     */
    private function applySetUnitPrice(InventoryLot $lot, array $params, int $userId): bool
    {
        if (! array_key_exists('unit_price', $params) || $params['unit_price'] === null) {
            return false;
        }

        $unitPrice = round((float) $params['unit_price'], 2);
        if ($unitPrice < 0) {
            return false;
        }

        if ($lot->price_rule === InventoryLot::PRICE_FIXED
            && round((float) ($lot->unit_price ?? 0), 2) === $unitPrice
            && $lot->price_percent === null) {
            return false;
        }

        $before = $this->priceAudit->snapshot($lot);
        $updated = $this->lots->setFixedUnitPrice($lot, $unitPrice);

        $this->priceAudit->record(
            $updated,
            $userId,
            InventoryLotPriceEvent::ACTION_SET_UNIT_PRICE,
            $before,
            $this->priceAudit->snapshot($updated),
            ['unit_price' => $unitPrice],
        );

        return true;
    }
}
