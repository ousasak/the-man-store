<?php

namespace App\Support;

/**
 * Bakong KHQR EMVCo payload helpers.
 *
 * Dynamic KHQR (point of initiation 12) carries an expiry timestamp and dies
 * at the bank even if our database still treats it as pending. Paper invoices
 * need a QR that stays scannable until the order is paid, so we convert the
 * merchant-bound payload into a static KHQR (point of initiation 11) with no
 * timestamp tag, then recompute CRC-16.
 */
final class KhqrEmv
{
    public static function crc16(string $payload): string
    {
        $crc = 0xFFFF;
        $length = strlen($payload);

        for ($i = 0; $i < $length; $i++) {
            $crc ^= (ord($payload[$i]) << 8);
            for ($bit = 0; $bit < 8; $bit++) {
                $crc = ($crc & 0x8000) ? (($crc << 1) ^ 0x1021) : ($crc << 1);
                $crc &= 0xFFFF;
            }
        }

        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }

    public static function isValid(string $qr): bool
    {
        $qr = trim($qr);
        if (strlen($qr) < 8) {
            return false;
        }

        $provided = strtoupper(substr($qr, -4));

        return $provided === self::crc16(substr($qr, 0, -4));
    }

    /**
     * Convert a dynamic Bakong KHQR into a static (non-expiring) KHQR.
     * Amount, merchant account, and bill number are preserved.
     */
    public static function toStatic(string $qr): string
    {
        $qr = trim($qr);
        $tags = self::parse($qr);
        if ($tags === []) {
            return $qr;
        }

        $out = '';
        foreach ($tags as $tag) {
            $id = $tag['tag'];
            $value = $tag['value'];

            if ($id === '63' || $id === '99') {
                continue;
            }

            if ($id === '01' && $value === '12') {
                $value = '11';
            }

            $out .= $id.self::len($value).$value;
        }

        $out .= '6304';
        $out .= self::crc16($out);

        return $out;
    }

    /**
     * @return list<array{tag: string, value: string}>
     */
    public static function parse(string $qr): array
    {
        $qr = trim($qr);
        $length = strlen($qr);
        $i = 0;
        $tags = [];

        while ($i + 4 <= $length) {
            $tag = substr($qr, $i, 2);
            $len = (int) substr($qr, $i + 2, 2);
            if ($len < 0 || $i + 4 + $len > $length) {
                break;
            }
            $i += 4;
            $value = substr($qr, $i, $len);
            $i += $len;
            $tags[] = ['tag' => $tag, 'value' => $value];
            if ($tag === '63') {
                break;
            }
        }

        return $tags;
    }

    private static function len(string $value): string
    {
        return str_pad((string) strlen($value), 2, '0', STR_PAD_LEFT);
    }
}
