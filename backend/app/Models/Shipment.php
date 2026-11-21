<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Shipment extends Model
{
    use HasFactory;

    protected $fillable = [
        'order_id',
        'provider',
        'tracking_code',
        'external_tracking_url',
        'status',
        'shipped_at',
        'delivered_at',
        'delivered_by_name',
        'delivered_by_user_id',
        'picked_up_by_name',
        'picked_up_by_phone',
        'picked_up_at',
        'courier_job_unlocked_at',
        'courier_job_unlocked_by',
    ];

    protected function casts(): array
    {
        return [
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'picked_up_at' => 'datetime',
            'courier_job_unlocked_at' => 'datetime',
        ];
    }

    // Relationships
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function trackingEvents()
    {
        return $this->hasMany(ShipmentTrackingEvent::class);
    }

    public function deliveredByUser()
    {
        return $this->belongsTo(User::class, 'delivered_by_user_id');
    }

    public function courierJobUnlockedBy()
    {
        return $this->belongsTo(User::class, 'courier_job_unlocked_by');
    }

    public function isCourierJobUnlocked(): bool
    {
        return $this->courier_job_unlocked_at !== null;
    }

    public function getTrackingUrlAttribute(): string
    {
        return url('/track-order?shipment_id=' . $this->id . '&tracking_code=' . $this->tracking_code);
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeShipped($query)
    {
        return $query->where('status', 'shipped');
    }

    public function scopeInTransit($query)
    {
        return $query->where('status', 'in_transit');
    }

    public function scopeDelivered($query)
    {
        return $query->where('status', 'delivered');
    }
}
