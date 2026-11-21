<?php

namespace App\Support;

use Illuminate\Support\Str;

/** Resolves the storefront logo for emails, PDFs, and Blade views. */
final class BrandLogo
{
    /** Raster logo for PDFs and data-uri embeds (DomPDF-safe). */
    public static function url(): string
    {
        return self::resolveRasterUrl((string) config('app.logo_png_url', '/logo.png'));
    }

    /** Wide wordmark (`public/logo.png`) for invoice and dashboard-report PDFs only. */
    public static function invoiceLogoUrl(): string
    {
        $bannerPath = public_path('logo.png');
        if (is_file($bannerPath)) {
            return self::resolveRasterUrl('/logo.png');
        }

        return self::url();
    }

    /** SVG logo for web and admin UI. */
    public static function svgUrl(): string
    {
        return self::emailAssetUrl((string) config('app.logo_url', '/logo.svg'));
    }

    /** SVG circular mark for web. */
    public static function svgCircleUrl(): ?string
    {
        return self::optionalAssetUrl((string) config('app.logo_circle_url', '/logo-circle.svg'));
    }

    /** Absolute raster banner URL for email HTML — never inline base64 (Gmail clips >102KB). */
    public static function emailUrl(): string
    {
        $bannerUrl = (string) config('app.logo_email_url', '/logo.png');

        if ($bannerUrl === '') {
            $bannerUrl = (string) config('app.logo_png_url', '/logo.png');
        }

        return self::emailAssetUrl($bannerUrl);
    }

    /** Circular raster mark (legacy). Prefer {@see bimiLogoUrl()} for inbox avatar. */
    public static function emailCircleUrl(): ?string
    {
        return self::optionalAssetUrl((string) config('app.logo_circle_png_url', '/logo-circle.png'));
    }

    /** Circle SVG for BIMI / Gmail sender avatar — never embed in email HTML body. */
    public static function bimiLogoUrl(): ?string
    {
        return self::optionalAssetUrl((string) config('app.logo_circle_url', '/logo-circle.svg'));
    }

    private static function resolveRasterUrl(string $logoUrl): string
    {
        if (! Str::startsWith($logoUrl, ['http://', 'https://'])) {
            return self::dataUriFromPath($logoUrl) ?? asset($logoUrl);
        }

        $appHost = parse_url((string) config('app.url', ''), PHP_URL_HOST);
        $logoHost = parse_url($logoUrl, PHP_URL_HOST);
        $logoPath = (string) parse_url($logoUrl, PHP_URL_PATH);

        if (! empty($appHost) && ! empty($logoHost) && strcasecmp($appHost, $logoHost) === 0) {
            return self::dataUriFromPath($logoPath) ?? $logoUrl;
        }

        return $logoUrl;
    }

    private static function optionalAssetUrl(string $logoUrl): ?string
    {
        if ($logoUrl === '') {
            return null;
        }

        if (! Str::startsWith($logoUrl, ['http://', 'https://'])) {
            $fullPath = public_path(ltrim($logoUrl, '/'));
            if (! is_file($fullPath)) {
                return null;
            }
        }

        return self::emailAssetUrl($logoUrl);
    }

    private static function emailAssetUrl(string $logoUrl): string
    {
        if (Str::startsWith($logoUrl, ['http://', 'https://'])) {
            return $logoUrl;
        }

        return asset(ltrim($logoUrl, '/'));
    }

    public static function dataUriFromPath(string $path): ?string
    {
        $relativePath = ltrim($path, '/');

        if ($relativePath === '') {
            return null;
        }

        $fullPath = public_path($relativePath);

        if (! is_file($fullPath) || ! is_readable($fullPath)) {
            return null;
        }

        $mimeType = mime_content_type($fullPath) ?: 'image/png';
        $contents = file_get_contents($fullPath);

        if ($contents === false) {
            return null;
        }

        return 'data:'.$mimeType.';base64,'.base64_encode($contents);
    }
}
