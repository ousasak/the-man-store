<?php

namespace App\Services;

use App\Models\Product;
use App\Support\Media;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Reads product image URLs from PostgreSQL-backed models, vectorizes them,
 * and upserts vectors into Qdrant for image similarity search.
 */
class ProductQdrantIndexer
{
    public function __construct(
        private readonly ImageSearchService $imageSearchService
    ) {}

    /**
     * @throws \Throwable
     */
    public function index(Product $product): void
    {
        $imageUrl = $product->image_url;
        if ($imageUrl === null || trim((string) $imageUrl) === '') {
            throw new \InvalidArgumentException('Product has no image_url to index.');
        }

        $tempPath = null;

        try {
            [$uploadedFile, $tempPath] = $this->toUploadedImage((string) $imageUrl);

            $this->imageSearchService->indexProductImage(
                $product->id,
                $uploadedFile,
                [
                    'name' => $product->name,
                    'slug' => $product->slug,
                    'category_id' => $product->category_id,
                    'brand_id' => $product->brand_id,
                ]
            );

            $product->forceFill([
                'is_vector_indexed' => true,
                'vector_indexed_at' => now(),
                'vector_index_error' => null,
            ])->saveQuietly();
        } catch (\Throwable $e) {
            $message = Str::limit($e->getMessage(), 1000, '...');

            $product->forceFill([
                'is_vector_indexed' => false,
                'vector_index_error' => $message,
            ])->saveQuietly();

            throw $e;
        } finally {
            if ($tempPath && file_exists($tempPath)) {
                @unlink($tempPath);
            }
        }
    }

    public function remove(Product $product): void
    {
        $this->imageSearchService->deletePoint($product->id);

        if ($product->exists) {
            $product->forceFill([
                'is_vector_indexed' => false,
                'vector_indexed_at' => null,
                'vector_index_error' => null,
            ])->saveQuietly();
        }
    }

    public function removeById(int $productId): void
    {
        $this->imageSearchService->deletePoint($productId);
    }

    /**
     * @return array{0: UploadedFile, 1: string} file and temp path for cleanup
     */
    private function toUploadedImage(string $imageUrl): array
    {
        $content = null;
        $mime = null;
        $filename = 'image.jpg';

        if (str_starts_with($imageUrl, 'data:image/')) {
            [$content, $mime, $filename] = $this->decodeDataUrl($imageUrl);
        } elseif (str_starts_with($imageUrl, 'http://') || str_starts_with($imageUrl, 'https://')) {
            $filename = basename(parse_url($imageUrl, PHP_URL_PATH) ?: 'image.jpg');
            $downloadTimeout = max(30, (int) config('services.image_search.timeout', 90));

            $response = Http::timeout($downloadTimeout)
                ->withOptions(['connect_timeout' => 15])
                ->get($imageUrl);
            if ($response->failed()) {
                throw new \RuntimeException('Cannot download image: '.$imageUrl);
            }

            $content = $response->body();
            $mime = $response->header('Content-Type');
        } else {
            $filename = basename(parse_url($imageUrl, PHP_URL_PATH) ?: 'image.jpg');
            $content = Media::readBytes($imageUrl);

            if ($content === null) {
                $localPath = Media::resolveLocalPath($imageUrl);
                if (! $localPath || ! file_exists($localPath)) {
                    throw new \RuntimeException('Image file not found: '.$imageUrl);
                }

                $content = file_get_contents($localPath);
                $mime = mime_content_type($localPath) ?: 'image/jpeg';
                $filename = basename($localPath);
            } else {
                $mime = 'image/jpeg';
            }
        }

        if ($content === false || $content === null) {
            throw new \RuntimeException('Failed reading image bytes for: '.$imageUrl);
        }

        $ext = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));
        if ($ext === '') {
            $ext = $this->extensionFromMime((string) $mime);
            $filename .= '.'.$ext;
        }

        $tempDir = storage_path('app/tmp/qdrant-index');
        if (! is_dir($tempDir)) {
            mkdir($tempDir, 0775, true);
        }

        // The Man Store Vector embed accepts common raster formats; AVIF often 500s on the Space.
        if ($this->needsJpegConversion($ext, (string) $mime)) {
            [$content, $mime, $filename, $ext] = $this->convertToJpeg(
                $content,
                $filename,
                str_starts_with($imageUrl, 'http') ? $imageUrl : null,
            );
        }

        $tempPath = $tempDir.'/'.uniqid('img_', true).'.'.$ext;
        file_put_contents($tempPath, $content);

        return [
            new UploadedFile($tempPath, $filename, $mime ?: 'image/jpeg', null, true),
            $tempPath,
        ];
    }

    private function needsJpegConversion(string $ext, string $mime): bool
    {
        $mime = strtolower(trim(explode(';', $mime)[0]));

        return in_array($ext, ['avif', 'heic', 'heif'], true)
            || in_array($mime, ['image/avif', 'image/heic', 'image/heif'], true);
    }

    /**
     * @return array{0: string, 1: string, 2: string, 3: string} content, mime, filename, ext
     */
    private function convertToJpeg(string $content, string $filename, ?string $sourceUrl = null): array
    {
        $base = pathinfo($filename, PATHINFO_FILENAME) ?: 'image';
        $errors = [];

        try {
            return $this->gdBytesToJpeg($content, $base);
        } catch (\Throwable $e) {
            $errors[] = 'GD: '.$e->getMessage();
        }

        try {
            return $this->imagickBytesToJpeg($content, $base);
        } catch (\Throwable $e) {
            $errors[] = 'Imagick: '.$e->getMessage();
        }

        if ($sourceUrl !== null) {
            try {
                return $this->cloudinaryFetchToJpeg($sourceUrl, $base);
            } catch (\Throwable $e) {
                $errors[] = 'Cloudinary: '.$e->getMessage();
            }
        }

        throw new \RuntimeException(
            'Cannot decode image for JPEG conversion ('.$filename.'). '.implode(' | ', $errors)
        );
    }

    /**
     * @return array{0: string, 1: string, 2: string, 3: string}
     */
    private function gdBytesToJpeg(string $content, string $base): array
    {
        if (! function_exists('imagecreatefromstring') || ! function_exists('imagejpeg')) {
            throw new \RuntimeException('GD JPEG support missing.');
        }

        // PHP GD without --with-avif returns false for AVIF (common on older Docker images).
        $info = function_exists('gd_info') ? gd_info() : [];
        $avifSupported = (bool) ($info['AVIF Support'] ?? $info['Avif Support'] ?? false);

        $image = @imagecreatefromstring($content);
        if ($image === false) {
            throw new \RuntimeException(
                $avifSupported
                    ? 'imagecreatefromstring failed.'
                    : 'GD built without AVIF support.'
            );
        }

        if (function_exists('imagepalettetotruecolor')) {
            @imagepalettetotruecolor($image);
        }
        if (function_exists('imagealphablending')) {
            @imagealphablending($image, true);
        }
        if (function_exists('imagesavealpha')) {
            @imagesavealpha($image, false);
        }

        ob_start();
        $ok = imagejpeg($image, null, 90);
        imagedestroy($image);
        $jpeg = ob_get_clean();

        if (! $ok || $jpeg === false || $jpeg === '') {
            throw new \RuntimeException('imagejpeg failed.');
        }

        return [$jpeg, 'image/jpeg', $base.'.jpg', 'jpg'];
    }

    /**
     * @return array{0: string, 1: string, 2: string, 3: string}
     */
    private function imagickBytesToJpeg(string $content, string $base): array
    {
        if (! class_exists(\Imagick::class)) {
            throw new \RuntimeException('extension not installed.');
        }

        $imagick = new \Imagick;
        $imagick->readImageBlob($content);
        $imagick->setImageFormat('jpeg');
        $imagick->setImageCompressionQuality(90);
        $jpeg = $imagick->getImageBlob();
        $imagick->clear();
        $imagick->destroy();

        if ($jpeg === '' || $jpeg === false) {
            throw new \RuntimeException('empty JPEG blob.');
        }

        return [$jpeg, 'image/jpeg', $base.'.jpg', 'jpg'];
    }

    /**
     * Last resort for public http(s) AVIF/HEIC when the PHP image stack cannot decode.
     *
     * @return array{0: string, 1: string, 2: string, 3: string}
     */
    private function cloudinaryFetchToJpeg(string $sourceUrl, string $base): array
    {
        $cloudName = trim((string) (
            config('filesystems.disks.cloudinary.cloud')
            ?? config('filesystems.disks.cloudinary.cloud_name')
            ?? env('CLOUDINARY_CLOUD_NAME', '')
        ));

        if ($cloudName === '' && preg_match('#cloudinary://[^@]+@([^/\s]+)#', (string) env('CLOUDINARY_URL', ''), $m)) {
            $cloudName = $m[1];
        }

        if ($cloudName === '') {
            throw new \RuntimeException('CLOUDINARY_CLOUD_NAME not set.');
        }

        $fetchUrl = 'https://res.cloudinary.com/'.$cloudName.'/image/fetch/f_jpg,q_auto/'
            .rawurlencode($sourceUrl);

        $timeout = max(30, (int) config('services.image_search.timeout', 90));
        $response = Http::timeout($timeout)->withOptions(['connect_timeout' => 15])->get($fetchUrl);

        if ($response->failed()) {
            throw new \RuntimeException('fetch HTTP '.$response->status());
        }

        $jpeg = $response->body();
        if ($jpeg === '') {
            throw new \RuntimeException('empty fetch body.');
        }

        // Sanity: JPEG magic bytes
        if (! str_starts_with($jpeg, "\xFF\xD8")) {
            throw new \RuntimeException('fetch did not return JPEG.');
        }

        return [$jpeg, 'image/jpeg', $base.'.jpg', 'jpg'];
    }

    private function extensionFromMime(string $mime): string
    {
        return match (strtolower(trim(explode(';', $mime)[0]))) {
            'image/png' => 'png',
            'image/avif' => 'avif',
            'image/gif' => 'gif',
            'image/jpeg' => 'jpg',
            'image/jpg' => 'jpg',
            'image/webp' => 'webp',
            default => 'jpg',
        };
    }

    private function decodeDataUrl(string $dataUrl): array
    {
        if (! preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s', $dataUrl, $matches)) {
            throw new \RuntimeException('Invalid data URL format for image');
        }

        $mime = strtolower(trim($matches[1]));
        $raw = preg_replace('/\s+/', '', $matches[2]);
        $content = base64_decode($raw, true);

        if ($content === false) {
            throw new \RuntimeException('Invalid base64 image data');
        }

        $ext = $this->extensionFromMime($mime);
        $filename = 'image.'.$ext;

        return [$content, $mime, $filename];
    }
}
