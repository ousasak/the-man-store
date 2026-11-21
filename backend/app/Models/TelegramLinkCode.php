<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TelegramLinkCode extends Model
{
    public const PURPOSE_STAFF = 'staff';

    public const PURPOSE_DRIVER = 'driver';

    public const PURPOSE_CUSTOMER = 'customer';

    protected $fillable = [
        'user_id',
        'code',
        'purpose',
        'created_by',
        'expires_at',
        'used_at',
        'used_by_telegram_user_id',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'used_at' => 'datetime',
            'used_by_telegram_user_id' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isUsed(): bool
    {
        return $this->used_at !== null;
    }

    public function isRedeemable(): bool
    {
        return ! $this->isUsed() && ! $this->isExpired();
    }
}
