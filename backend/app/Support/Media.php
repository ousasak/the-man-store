<?php

namespace App\Support;

use Cloudinary\Cloudinary as CloudinarySdk;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

class Media
{
    public static function disk(): string
    {
        return (string) config('filesystems.default', 'public');
    }

    /**
     * Cloudinary disk is configured in .env but credentials are missing (common in local dev).
     */
    public static function cloudinaryIsConfigured(): bool
    {
        $creds = self::cloudinaryCredentials();

        if ($creds['cloudName'] === '') {
            return false;
        }

        if ($creds['preset'] !== '') {
            return true;
        }

        return $creds['apiKey'] !== '' && $creds['apiSecret'] !== '';
    }

    public static function r2IsConfigured(): bool
    {
        $key = trim((string) env('R2_ACCESS_KEY_ID', env('AWS_ACCESS_KEY_ID', '')));
        $secret = trim((string) env('R2_SECRET_ACCESS_KEY', env('AWS_SECRET_ACCESS_KEY', '')));
        $bucket = trim((string) env('R2_BUCKET', env('AWS_BUCKET', '')));
        $endpoint = trim((string) env('R2_ENDPOINT', env('AWS_ENDPOINT', '')));

        return $key !== '' && $secret !== '' && $bucket !== '' && $endpoint !== '';
    }

    /**
     * Whether the configured FILESYSTEM_DISK can accept uploads (not broken / missing credentials).
     */
    public static function mediaDiskIsConfigured(?string $disk = null): bool
    {
        $disk = $disk ?? self::disk();

        return match ($disk) {
            'public', 'local' => true,
            'cloudinary' => self::cloudinaryIsConfigured(),
            'r2' => self::r2IsConfigured(),
            default => true,
        };
    }

    /**
     * Disk used for URL resolution and uploads — never a broken cloudinary driver.
     */
    public static function effectiveDisk(?string $preferred = null): string
    {
        $disk = $preferred ?? self::disk();

        if ($disk === 'cloudinary' && ! self::cloudinaryIsConfigured()) {
            return 'public';
        }

        return $disk;
    }

    public static function fallbackToPublic(): bool
    {
        return filter_var(
            env('MEDIA_FALLBACK_TO_PUBLIC', env('ADMIN_PROFILE_IMAGE_FALLBACK_TO_PUBLIC', env('APP_ENV') !== 'production')),
            FILTER_VALIDATE_BOOL
        );
    }

    public static function isExternalUrl(?string $value): bool
    {
        return is_string($value) && preg_match('#^https?://#i', $value) === 1;
    }

    /**
     * Whether an absolute URL may be fetched by /api/media/proxy (Flutter web CORS).
     */
    public static function isAllowedProxyUrl(?string $url): bool
    {
        if (! self::isExternalUrl($url)) {
            return false;
        }

        $host = strtolower((string) parse_url($url, PHP_URL_HOST));
        if ($host === '') {
            return false;
        }

        if (preg_match('/\.r2\.dev$/i', $host) === 1) {
            return true;
        }

        if (preg_match('/\.r2\.cloudflarestorage\.com$/i', $host) === 1) {
            return true;
        }

        if (str_ends_with($host, 'cloudinary.com') || str_ends_with($host, 'res.cloudinary.com')) {
            return true;
        }

        foreach ([env('R2_PUBLIC_URL'), env('AWS_URL')] as $configured) {
            $configured = trim((string) $configured);
            if ($configured === '') {
                continue;
            }
            $configuredHost = strtolower((string) parse_url($configured, PHP_URL_HOST));
            if ($configuredHost !== '' && $host === $configuredHost) {
                return true;
            }
        }

        $appHost = strtolower((string) parse_url((string) config('app.url'), PHP_URL_HOST));
        if ($appHost !== '' && $host === $appHost) {
            return true;
        }

        $storefrontHost = strtolower((string) parse_url((string) env('FRONTEND_URL', ''), PHP_URL_HOST));
        if ($storefrontHost !== '' && $host === $storefrontHost) {
            return true;
        }

        return false;
    }

    /**
     * Strip /storage/ prefix and return a disk-relative key when possible.
     */
    public static function storageKey(?string $reference): ?string
    {
        $reference = trim((string) $reference);
        if ($reference === '') {
            return null;
        }

        if (self::isExternalUrl($reference)) {
            return null;
        }

        if (str_starts_with($reference, '/storage/')) {
            return ltrim(substr($reference, 9), '/');
        }

        if (str_starts_with($reference, 'storage/')) {
            return ltrim(substr($reference, 8), '/');
        }

        return ltrim($reference, '/');
    }

    private static function isPrivateHost(string $host): bool
    {
        $host = strtolower($host);
        if (in_array($host, ['localhost', '127.0.0.1', 'host.docker.internal', 'backend'], true)) {
            return true;
        }

        return preg_match('/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/', $host) === 1;
    }

    private static function placeholderUrl(): string
    {
        $url = (string) \asset('placeholder.svg');

        if (str_starts_with(strtolower($url), 'http://')) {
            return 'https://'.substr($url, 7);
        }

        return $url;
    }

    public static function url(?string $path): ?string
    {
        if (! $path) {
            return null;
        }

        $path = trim($path);

        if (preg_match('#^https?://#i', $path)) {
            $parts = parse_url($path);
            $host = strtolower((string) ($parts['host'] ?? ''));
            if ($host !== '' && self::isPrivateHost($host)) {
                $normalizedPath = '/'.ltrim((string) ($parts['path'] ?? ''), '/');

                return $normalizedPath !== '/' ? $normalizedPath : null;
            }

            return $path;
        }

        if (str_starts_with($path, '/storage/')) {
            return $path;
        }

        if (str_starts_with($path, 'storage/')) {
            return '/'.$path;
        }

        if (! str_contains($path, '/')) {
            return '/storage/banners/'.ltrim($path, '/');
        }

        $normalized = self::storageKey($path);
        if ($normalized === null || $normalized === '') {
            return self::placeholderUrl();
        }

        try {
            if (Storage::disk('public')->exists($normalized)) {
                return '/storage/'.$normalized;
            }
        } catch (\Throwable) {
            // ignore
        }

        $disk = self::effectiveDisk();

        if ($disk !== 'public') {
            try {
                $remoteUrl = Storage::disk($disk)->url($normalized);
                if (is_string($remoteUrl) && $remoteUrl !== '') {
                    return $remoteUrl;
                }
            } catch (\Throwable) {
                // Continue to placeholder for legacy paths.
            }
        }

        return self::placeholderUrl();
    }

    public static function publicUrl(?string $path): ?string
    {
        return self::url($path);
    }

    public static function galleryUploadFailureMessage(\Throwable $e): string
    {
        $msg = strtolower($e->getMessage());

        if (str_contains($msg, 'accesscontrollistnotsupported') || str_contains($msg, 'x-amz-acl')) {
            return 'R2 rejected an object ACL. Redeploy the latest backend (ACL stripping fix) and retry the upload.';
        }
        if (str_contains($msg, 'invalidaccesskeyid') || str_contains($msg, 'signaturedoesnotmatch')) {
            return 'R2 credentials are invalid. On Render, set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from a new R2 API token (Object Read & Write).';
        }
        if (str_contains($msg, 'nosuchbucket')) {
            return 'R2 bucket not found. Set AWS_BUCKET=fitandsleek on the same Cloudflare account as AWS_ENDPOINT.';
        }
        if (str_contains($msg, 'accessdenied') || str_contains($msg, '403')) {
            return 'R2 token cannot write to this bucket. Create an Account API token with Object Read & Write for bucket fitandsleek.';
        }
        if (str_contains($msg, 'not configured')) {
            return 'Media storage is not configured. Set FILESYSTEM_DISK=r2 and all AWS_/R2_ variables on Render, then redeploy.';
        }
        if (str_contains($msg, 'object is missing on disk')) {
            return 'Upload did not persist to R2. Check AWS_ENDPOINT uses account 29531ec21763c961814bc2de1cf2aa75 and matches your API token account.';
        }

        return 'Could not upload to R2. Verify Render env (FILESYSTEM_DISK=r2, bucket, endpoint, pub URL, API token) and redeploy the backend.';
    }

    /**
     * @return array<string, mixed>
     */
    public static function diagnostics(): array
    {
        $disk = self::disk();

        return [
            'filesystem_disk' => $disk,
            'media_disk_configured' => self::mediaDiskIsConfigured($disk),
            'r2_configured' => self::r2IsConfigured(),
            'bucket' => config('filesystems.disks.r2.bucket'),
            'endpoint' => config('filesystems.disks.r2.endpoint'),
            'public_url' => config('filesystems.disks.r2.url'),
            'fallback_to_public' => self::fallbackToPublic(),
        ];
    }

    /**
     * @return array{ok: bool, error?: string}
     */
    public static function probeR2Write(): array
    {
        if (self::disk() !== 'r2' || ! self::r2IsConfigured()) {
            return ['ok' => false, 'error' => 'R2 is not configured on this server.'];
        }

        $key = 'product-gallery/probe-'.Str::uuid().'.jpg';
        $bytes = base64_decode(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCfAA//2Q==',
            true
        );

        if ($bytes === false || $bytes === '') {
            return ['ok' => false, 'error' => 'Could not build probe image bytes.'];
        }

        try {
            self::put($key, $bytes, 'r2');
            R2Storage::deleteObject($key);

            return ['ok' => true];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'error' => self::galleryUploadFailureMessage($e),
                'detail' => $e->getMessage(),
            ];
        }
    }

    private static function usesCloudinaryDisk(?string $disk): bool
    {
        return ($disk ?? self::disk()) === 'cloudinary';
    }

    private static function usesR2OrS3Disk(?string $disk): bool
    {
        $disk = $disk ?? self::disk();

        return $disk === 'r2' || $disk === 's3';
    }

    /**
     * @return array{cloudName: string, apiKey: string, apiSecret: string, cloudinaryUrl: string, preset: string}
     */
    private static function cloudinaryCredentials(): array
    {
        $cloudName = trim((string) env('CLOUDINARY_CLOUD_NAME', ''));
        $apiKey = trim((string) env('CLOUDINARY_API_KEY', ''));
        $apiSecret = trim((string) env('CLOUDINARY_API_SECRET', ''));
        $cloudinaryUrl = trim((string) env('CLOUDINARY_URL', ''));
        $preset = trim((string) env('CLOUDINARY_UPLOAD_PRESET', ''));

        if ($cloudinaryUrl !== '') {
            $parts = parse_url($cloudinaryUrl);
            if ($cloudName === '') {
                $cloudName = trim((string) ($parts['host'] ?? ''));
            }
            if ($apiKey === '') {
                $apiKey = trim((string) ($parts['user'] ?? ''));
            }
            if ($apiSecret === '') {
                $apiSecret = trim((string) ($parts['pass'] ?? ''));
            }
        }

        return compact('cloudName', 'apiKey', 'apiSecret', 'cloudinaryUrl', 'preset');
    }

    /**
     * Reliable Cloudinary upload (unsigned preset or signed API). Returns secure HTTPS URL.
     */
    public static function uploadToCloudinary(UploadedFile $file, string $folder): string
    {
        $creds = self::cloudinaryCredentials();
        $folder = trim($folder, '/');

        if ($creds['cloudName'] === '') {
            throw new RuntimeException('Cloudinary cloud name is not configured.');
        }

        $uploadOptions = [
            'folder' => $folder,
            'resource_type' => 'image',
        ];

        $realPath = $file->getRealPath();
        if ($realPath === false || ! is_readable($realPath)) {
            throw new RuntimeException('Uploaded file is not readable.');
        }

        if ($creds['preset'] !== '') {
            $sdk = $creds['cloudinaryUrl'] !== ''
                ? new CloudinarySdk($creds['cloudinaryUrl'])
                : new CloudinarySdk([
                    'cloud' => ['cloud_name' => $creds['cloudName']],
                    'url' => ['secure' => true],
                ]);
            $result = $sdk->uploadApi()->unsignedUpload($realPath, $creds['preset'], $uploadOptions);
        } else {
            if ($creds['apiKey'] === '' || $creds['apiSecret'] === '') {
                throw new RuntimeException('Cloudinary API key/secret or CLOUDINARY_UPLOAD_PRESET is required.');
            }
            $sdk = new CloudinarySdk([
                'cloud' => ['cloud_name' => $creds['cloudName']],
                'api' => ['api_key' => $creds['apiKey'], 'api_secret' => $creds['apiSecret']],
                'url' => ['secure' => true],
            ]);
            $uploadOptions['public_id'] = $folder.'/'.Str::uuid();
            $result = $sdk->uploadApi()->upload($realPath, $uploadOptions);
        }

        $url = (string) ($result['secure_url'] ?? '');
        if ($url === '') {
            throw new RuntimeException('Cloudinary upload did not return secure_url.');
        }

        return $url;
    }

    private static function persistUploadedFile(
        UploadedFile $file,
        string $directory,
        ?string $filename,
        ?string $disk
    ): string {
        $disk = self::effectiveDisk($disk);
        $directory = trim($directory, '/');

        if (self::usesCloudinaryDisk($disk)) {
            return self::uploadToCloudinary($file, $directory);
        }

        if (self::usesR2OrS3Disk($disk)) {
            $ext = strtolower((string) $file->getClientOriginalExtension());
            if ($ext === '') {
                $ext = 'jpg';
            }
            $name = $filename ?? (Str::uuid().'.'.$ext);
            $relative = trim($directory, '/').'/'.$name;
            $realPath = $file->getRealPath();
            if ($realPath === false) {
                throw new RuntimeException('Uploaded file is not readable.');
            }
            $bytes = file_get_contents($realPath);
            if ($bytes === false || $bytes === '') {
                throw new RuntimeException('Uploaded file is empty.');
            }

            return self::put($relative, $bytes, $disk);
        }

        $path = $filename !== null
            ? $file->storeAs($directory, $filename, $disk)
            : $file->store($directory, $disk);

        if (! is_string($path) || trim($path) === '') {
            throw new RuntimeException('Storage did not return a file path.');
        }

        self::assertObjectStored($disk, $path);

        return self::canonicalStoredReference($path, $disk);
    }

    private static function assertObjectStored(string $disk, string $key): void
    {
        if ($disk === 'public' || $disk === 'local' || $disk === 'r2') {
            return;
        }

        $key = ltrim(str_replace('\\', '/', $key), '/');
        if (! Storage::disk($disk)->exists($key)) {
            throw new RuntimeException("Upload reported success but object is missing on disk [{$disk}]: {$key}");
        }
    }

    /**
     * Store an uploaded file on the configured media disk (Cloudinary when FILESYSTEM_DISK=cloudinary).
     * Returns a disk key or absolute CDN URL suitable for persisting in the database.
     */
    public static function storeUploaded(UploadedFile $file, string $directory, ?string $disk = null): string
    {
        $disk = $disk ?? self::disk();

        try {
            return self::persistUploadedFile($file, $directory, null, $disk);
        } catch (\Throwable $e) {
            if (! self::fallbackToPublic() || $disk === 'public') {
                throw $e;
            }

            Log::warning('Media upload failed on preferred disk, falling back to public.', [
                'preferred_disk' => $disk,
                'directory' => $directory,
                'error' => $e->getMessage(),
            ]);

            return self::persistUploadedFile($file, $directory, null, 'public');
        }
    }

    public static function storeUploadedAs(
        UploadedFile $file,
        string $directory,
        string $filename,
        ?string $disk = null
    ): string {
        $disk = $disk ?? self::disk();

        try {
            return self::persistUploadedFile($file, $directory, $filename, $disk);
        } catch (\Throwable $e) {
            if (! self::fallbackToPublic() || $disk === 'public') {
                throw $e;
            }

            Log::warning('Media upload failed on preferred disk, falling back to public.', [
                'preferred_disk' => $disk,
                'directory' => $directory,
                'filename' => $filename,
                'error' => $e->getMessage(),
            ]);

            return self::persistUploadedFile($file, $directory, $filename, 'public');
        }
    }

    public static function put(string $relativePath, string $contents, ?string $disk = null): string
    {
        $disk = $disk ?? self::disk();
        $relativePath = ltrim(str_replace('\\', '/', $relativePath), '/');

        try {
            if (self::usesCloudinaryDisk($disk)) {
                $ext = pathinfo($relativePath, PATHINFO_EXTENSION) ?: 'jpg';
                $folder = pathinfo($relativePath, PATHINFO_DIRNAME);
                $folder = $folder === '.' ? '' : $folder;
                $tmp = tempnam(sys_get_temp_dir(), 'cld_');
                if ($tmp === false) {
                    throw new RuntimeException('Could not create temporary file for Cloudinary upload.');
                }
                try {
                    file_put_contents($tmp, $contents);
                    $upload = new UploadedFile($tmp, basename($relativePath) ?: 'upload.'.$ext, null, null, true);

                    return self::uploadToCloudinary($upload, $folder);
                } finally {
                    @unlink($tmp);
                }
            }

            // Cloudflare R2: bypass Flysystem S3 adapter (it always sends ACL headers).
            if ($disk === 'r2') {
                R2Storage::putObject($relativePath, $contents);

                return self::canonicalStoredReference($relativePath, $disk);
            }

            // Other S3-compatible disks may still use visibility/ACL.
            $written = self::usesR2OrS3Disk($disk)
                ? Storage::disk($disk)->put($relativePath, $contents)
                : Storage::disk($disk)->put($relativePath, $contents, ['visibility' => 'public']);
            if ($written === false) {
                throw new RuntimeException("Storage put failed on disk [{$disk}].");
            }

            self::assertObjectStored($disk, $relativePath);

            return self::canonicalStoredReference($relativePath, $disk);
        } catch (\Throwable $e) {
            if (! self::fallbackToPublic() || $disk === 'public') {
                throw $e;
            }

            Storage::disk('public')->put($relativePath, $contents);

            return self::canonicalStoredReference($relativePath, 'public');
        }
    }

    /**
     * For remote disks, persist the HTTPS URL when available so clients never see /storage paths.
     */
    public static function canonicalStoredReference(string $path, ?string $disk = null): string
    {
        $path = trim(str_replace('\\', '/', $path));
        if ($path === '') {
            return $path;
        }

        if (self::isExternalUrl($path)) {
            return $path;
        }

        $disk = $disk ?? self::disk();
        if ($disk === 'public') {
            return $path;
        }

        $key = self::storageKey($path) ?? $path;

        try {
            $url = Storage::disk($disk)->url($key);
            if (is_string($url) && $url !== '' && self::isExternalUrl($url)) {
                return $url;
            }
        } catch (\Throwable) {
            // Keep disk-relative key.
        }

        return $path;
    }

    public static function delete(?string $reference): void
    {
        $reference = trim((string) $reference);
        if ($reference === '') {
            return;
        }

        if (self::isExternalUrl($reference)) {
            return;
        }

        $key = self::storageKey($reference);
        if ($key === null || $key === '') {
            return;
        }

        foreach (array_unique([self::disk(), 'cloudinary', 'public']) as $disk) {
            try {
                Storage::disk($disk)->delete($key);
            } catch (\Throwable) {
                // Best-effort cleanup across old/new storage backends.
            }
        }
    }

    /**
     * Read raw bytes for a stored reference (path, /storage URL, or remote CDN URL).
     */
    public static function readBytes(?string $reference): ?string
    {
        $reference = trim((string) $reference);
        if ($reference === '') {
            return null;
        }

        if (str_starts_with($reference, 'data:image/')) {
            if (! preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s', $reference, $matches)) {
                return null;
            }
            $decoded = base64_decode($matches[2], true);

            return $decoded === false ? null : $decoded;
        }

        if (self::isExternalUrl($reference)) {
            try {
                $response = \Illuminate\Support\Facades\Http::timeout(30)->get($reference);
                if ($response->successful()) {
                    return $response->body();
                }
            } catch (\Throwable) {
                return null;
            }

            return null;
        }

        $key = self::storageKey($reference);
        if ($key === null || $key === '') {
            return null;
        }

        foreach (array_unique([self::disk(), 'public']) as $disk) {
            try {
                if (Storage::disk($disk)->exists($key)) {
                    return Storage::disk($disk)->get($key);
                }
            } catch (\Throwable) {
                continue;
            }
        }

        $local = self::resolveLocalPath($reference);

        return ($local && file_exists($local)) ? (file_get_contents($local) ?: null) : null;
    }

    public static function resolveLocalPath(?string $reference): ?string
    {
        $path = trim((string) $reference);
        if ($path === '') {
            return null;
        }

        if (str_starts_with($path, '/storage/')) {
            return storage_path('app/public/'.ltrim(substr($path, 9), '/'));
        }

        if (str_starts_with($path, 'storage/')) {
            return storage_path('app/public/'.ltrim(substr($path, 8), '/'));
        }

        if (str_starts_with($path, '/')) {
            $publicPath = public_path(ltrim($path, '/'));
            if (file_exists($publicPath)) {
                return $publicPath;
            }
        }

        $key = self::storageKey($path);
        if ($key !== null && $key !== '') {
            $diskPath = Storage::disk('public')->path($key);
            if (file_exists($diskPath)) {
                return $diskPath;
            }
        }

        if (file_exists($path)) {
            return $path;
        }

        return null;
    }
}
