<?php

namespace App\Support;

/** Embed TTF files for DomPDF (remote CDNs are Latin-only and skip Khmer glyphs). */
final class PdfFonts
{
    public static function khmerFamily(): string
    {
        return 'Battambang';
    }

    public static function regularDataUri(): ?string
    {
        return self::dataUri('Battambang-Regular.ttf');
    }

    public static function boldDataUri(): ?string
    {
        return self::dataUri('Battambang-Bold.ttf');
    }

    public static function dataUri(string $filename): ?string
    {
        $candidates = [
            public_path('fonts/'.$filename),
            resource_path('fonts/'.$filename),
        ];

        $path = null;
        foreach ($candidates as $candidate) {
            if (is_file($candidate) && is_readable($candidate)) {
                $path = $candidate;
                break;
            }
        }

        if ($path === null) {
            return null;
        }

        $contents = file_get_contents($path);
        if ($contents === false) {
            return null;
        }

        return 'data:font/truetype;base64,'.base64_encode($contents);
    }
}
