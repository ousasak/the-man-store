<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Payment extends Model
{
    use HasFactory;

    /** @var list<string> */
    public const KHQR_PROVIDERS = ['rielpay', 'bakong'];

    public const METHOD_INVOICE_KHQR = 'invoice_khqr';

    protected $fillable = [
        'order_id',
        'provider',
        'amount',
        'currency',
        'bill_number',
        'md5',
        'bakong_ref',
        'khqr_payload',
        'qr_string',
        'qr_image_base64',
        'expires_at',
        'paid_at',
        'raw_response',
        'bakong_data',
        'verified_by',
        'method',
        'status',
        'reference_code',
        'proof_image_path',
        'verified_at',
    ];

    protected function casts(): array
    {
        return [
            'verified_at' => 'datetime',
            'expires_at' => 'datetime',
            'paid_at' => 'datetime',
            'raw_response' => 'array',
            'bakong_data' => 'array',
            'khqr_payload' => 'array',
            'amount' => 'decimal:2',
        ];
    }

    // Relationships
    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function verifiedBy()
    {
        return $this->belongsTo(User::class, 'verified_by');
    }

    // Scopes
    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeSuccess($query)
    {
        return $query->whereIn('status', ['paid', 'success']);
    }

    public function scopeFailed($query)
    {
        return $query->where('status', 'failed');
    }

    public function scopeKhqrProvider($query)
    {
        return $query->whereIn('provider', self::KHQR_PROVIDERS);
    }

    /**
     * Paper invoice KHQR: keep polling until paid; never expire locally.
     */
    public function isLifetimeInvoiceKhqr(): bool
    {
        if (strtolower((string) $this->method) === self::METHOD_INVOICE_KHQR) {
            return true;
        }

        $raw = is_array($this->raw_response) ? $this->raw_response : [];

        return (bool) ($raw['invoice_khqr'] ?? false) || (bool) ($raw['lifetime'] ?? false);
    }
}
