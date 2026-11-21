<?php

namespace App\Support;

use Aws\S3\S3Client;
use RuntimeException;

/**
 * Direct R2 PutObject without S3 ACL headers (Flysystem always attaches ACL by default).
 */
final class R2Storage
{
    private static ?S3Client $client = null;

    public static function putObject(string $key, string $contents): void
    {
        $key = ltrim(str_replace('\\', '/', $key), '/');
        if ($key === '') {
            throw new RuntimeException('R2 object key is empty.');
        }

        self::client()->putObject([
            'Bucket' => self::bucket(),
            'Key' => $key,
            'Body' => $contents,
            'ContentType' => self::guessContentType($key),
        ]);
    }

    public static function deleteObject(string $key): void
    {
        $key = ltrim(str_replace('\\', '/', $key), '/');
        if ($key === '') {
            return;
        }

        self::client()->deleteObject([
            'Bucket' => self::bucket(),
            'Key' => $key,
        ]);
    }

    private static function client(): S3Client
    {
        if (self::$client instanceof S3Client) {
            return self::$client;
        }

        $disk = config('filesystems.disks.r2', []);
        $key = trim((string) ($disk['key'] ?? ''));
        $secret = trim((string) ($disk['secret'] ?? ''));
        $endpoint = trim((string) ($disk['endpoint'] ?? ''));

        if ($key === '' || $secret === '' || $endpoint === '') {
            throw new RuntimeException('R2 is not configured.');
        }

        self::$client = new S3Client([
            'version' => 'latest',
            'region' => (string) ($disk['region'] ?? 'auto'),
            'endpoint' => $endpoint,
            'use_path_style_endpoint' => (bool) ($disk['use_path_style_endpoint'] ?? true),
            'credentials' => [
                'key' => $key,
                'secret' => $secret,
            ],
        ]);

        return self::$client;
    }

    private static function bucket(): string
    {
        $bucket = trim((string) config('filesystems.disks.r2.bucket', ''));
        if ($bucket === '') {
            throw new RuntimeException('R2 bucket is not configured.');
        }

        return $bucket;
    }

    private static function guessContentType(string $key): string
    {
        $ext = strtolower(pathinfo($key, PATHINFO_EXTENSION));

        return match ($ext) {
            'jpg', 'jpeg', 'jfif', 'pjpeg' => 'image/jpeg',
            'png', 'apng' => 'image/png',
            'webp' => 'image/webp',
            'gif' => 'image/gif',
            'svg' => 'image/svg+xml',
            default => 'application/octet-stream',
        };
    }
}
