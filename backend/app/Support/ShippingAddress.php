<?php

namespace App\Support;

use App\Models\Address;
use App\Models\User;

/**
 * Single source of truth for reading/writing the orders.shipping_address JSON blob.
 *
 * Checkout clients only have to send `province`, so the blob can arrive with almost
 * nothing in it. Normalizing on write keeps invoices, emails and the Telegram bot
 * from each having to guess how to stitch the pieces together.
 */
class ShippingAddress
{
    /**
     * Street-level keys that make an address actually deliverable.
     */
    private const DETAIL_KEYS = [
        'house_no',
        'street_no',
        'street',
        'sangkat',
        'khan',
        'landmark',
        'line1',
        'address',
        'formatted_address',
    ];

    /**
     * True when the address carries nothing beyond a province/city name.
     *
     * @param  array<string, mixed>  $address
     */
    public static function isDeliverable(array $address): bool
    {
        foreach (self::DETAIL_KEYS as $key) {
            if (filled($address[$key] ?? null)) {
                return true;
            }
        }

        return filled($address['latitude'] ?? null) && filled($address['longitude'] ?? null);
    }

    /**
     * Back-fill missing pieces from the saved address row when the client sent an `id`.
     * Clients only echo the fields they know about, so the DB row stays authoritative
     * (it also carries the legacy street/city/state columns).
     *
     * @param  array<string, mixed>  $address
     * @return array<string, mixed>
     */
    public static function hydrateFromSaved(array $address, ?User $user = null): array
    {
        $id = $address['id'] ?? null;
        if (! $user || ! is_numeric($id)) {
            return $address;
        }

        $saved = Address::query()
            ->where('user_id', $user->id)
            ->find((int) $id);

        if (! $saved) {
            return $address;
        }

        $keys = [
            'receiver_name', 'receiver_phone', 'house_no', 'street_no', 'sangkat',
            'khan', 'province', 'landmark', 'street', 'city', 'state', 'zip',
            'country', 'latitude', 'longitude',
        ];

        foreach ($keys as $key) {
            if (blank($address[$key] ?? null) && filled($saved->{$key})) {
                $address[$key] = $saved->{$key};
            }
        }

        return $address;
    }

    /**
     * Fill in receiver details from the account and store a canonical
     * `formatted_address` so downstream readers never re-derive it.
     *
     * @param  array<string, mixed>  $address
     * @return array<string, mixed>
     */
    public static function normalize(array $address, ?User $user = null): array
    {
        if (blank($address['receiver_name'] ?? null) && filled($user?->name)) {
            $address['receiver_name'] = $user->name;
        }

        if (blank($address['receiver_phone'] ?? null)) {
            $phone = $address['phone'] ?? $address['mobile'] ?? $user?->phone;
            if (filled($phone)) {
                $address['receiver_phone'] = (string) $phone;
            }
        }

        $formatted = self::compose($address);
        if ($formatted !== '') {
            $address['formatted_address'] = $formatted;
        }

        return $address;
    }

    /**
     * Human readable one-line address, or an em dash when there is nothing to show.
     *
     * @param  array<string, mixed>|mixed  $address
     */
    public static function format($address): string
    {
        if (! is_array($address)) {
            return '—';
        }

        $formatted = trim((string) ($address['formatted_address'] ?? ''));
        if ($formatted !== '') {
            return $formatted;
        }

        $composed = self::compose($address);

        return $composed !== '' ? $composed : '—';
    }

    /**
     * Build the address line from granular parts, ignoring `formatted_address`.
     *
     * @param  array<string, mixed>  $address
     */
    private static function compose(array $address): string
    {
        $labelled = function (string $label, string $key) use ($address): ?string {
            $value = trim((string) ($address[$key] ?? ''));

            return $value !== '' ? $label.' '.$value : null;
        };

        $plain = function (string ...$keys) use ($address): ?string {
            foreach ($keys as $key) {
                $value = trim((string) ($address[$key] ?? ''));
                if ($value !== '') {
                    return $value;
                }
            }

            return null;
        };

        $parts = array_filter([
            $labelled('ផ្ទះលេខ', 'house_no'),
            $labelled('ផ្លូវ', 'street_no'),
            $plain('street', 'line1', 'address'),
            $plain('line2'),
            $labelled('សង្កាត់/ឃុំ', 'sangkat'),
            $labelled('ខណ្ឌ/ស្រុក', 'khan'),
            $plain('district'),
            $plain('province', 'city', 'state'),
            $labelled('ចំណុចសម្គាល់', 'landmark'),
            $plain('postal_code', 'zip'),
            $plain('country'),
        ], fn ($part) => filled($part));

        return implode(', ', array_unique($parts));
    }
}
