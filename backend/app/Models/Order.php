<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    /** @var list<string> */
    public const PAID_PAYMENT_STATUSES = ['paid', 'completed', 'success', 'succeeded'];

    protected $fillable = [
        'user_id',
        'parent_order_id',
        'replacement_case_id',
        'sale_channel',
        'order_number',
        'status',
        'payment_status',
        'payment_method',
        'subtotal',
        'shipping',
        'discount',
        'total',
        'shipping_address',
        'billing_address',
        'pos_meta',
    ];

    protected $casts = [
        'total' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'shipping' => 'decimal:2',
        'discount' => 'decimal:2',
        'shipping_address' => 'array',
        'billing_address' => 'array',
        'pos_meta' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function items()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    public function shipment()
    {
        return $this->hasOne(Shipment::class);
    }

    public function replacementCases()
    {
        return $this->hasMany(ReplacementCase::class);
    }

    public function parentOrder()
    {
        return $this->belongsTo(Order::class, 'parent_order_id');
    }

    public function replacementCase()
    {
        return $this->belongsTo(ReplacementCase::class);
    }

    public function childReplacementOrders()
    {
        return $this->hasMany(Order::class, 'parent_order_id');
    }

    public static function findByPublicKey(string $key): ?self
    {
        $order = static::query()->where('order_number', $key)->first();
        if ($order) {
            return $order;
        }

        if (ctype_digit($key)) {
            return static::query()->find((int) $key);
        }

        return null;
    }

    public function isPaymentSuccessful(): bool
    {
        return in_array(
            strtolower((string) ($this->payment_status ?? '')),
            self::PAID_PAYMENT_STATUSES,
            true
        );
    }

    /** Delivered / completed — Telegram actions (status, KHQR, COD) are closed for everyone. */
    public function isSuccessfullyClosed(): bool
    {
        $status = strtolower((string) ($this->status ?? ''));
        if (in_array($status, ['completed', 'delivered'], true)) {
            return true;
        }

        $this->loadMissing('shipment');

        return in_array(strtolower((string) ($this->shipment?->status ?? '')), ['delivered'], true);
    }

    public function isEligibleForTelegramUpdates(): bool
    {
        if (strtolower((string) ($this->status ?? '')) === 'cancelled') {
            return false;
        }

        if ($this->isPaymentSuccessful()) {
            return true;
        }

        return $this->payment_method === 'cod';
    }

    public function scopePaymentSuccessful(Builder $query): Builder
    {
        $column = $query->getModel()->getTable().'.payment_status';

        return $query->where(function (Builder $q) use ($column) {
            foreach (self::PAID_PAYMENT_STATUSES as $status) {
                $q->orWhereRaw('LOWER('.$column.') = ?', [$status]);
            }
        });
    }
}
