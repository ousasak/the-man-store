<?php

namespace App\Console\Commands;

use App\Support\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProbeR2MediaCommand extends Command
{
    protected $signature = 'media:probe-r2';

    protected $description = 'Upload a test image to R2 and verify the public URL returns HTTP 200';

    public function handle(): int
    {
        if (Media::disk() !== 'r2') {
            $this->error('FILESYSTEM_DISK is not r2 (current: '.Media::disk().').');

            return self::FAILURE;
        }

        if (! Media::r2IsConfigured()) {
            $this->error('R2 is not configured. Check AWS_/R2_ env vars on this server.');

            return self::FAILURE;
        }

        $disk = 'r2';
        $key = 'product-gallery/probe-'.Str::uuid().'.jpg';
        $bytes = base64_decode(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCfAA//2Q==',
            true
        );

        if ($bytes === false || $bytes === '') {
            $this->error('Could not build probe JPEG bytes.');

            return self::FAILURE;
        }

        $this->info('Disk: '.$disk);
        $this->line('Bucket: '.config('filesystems.disks.r2.bucket'));
        $this->line('Endpoint: '.config('filesystems.disks.r2.endpoint'));
        $this->line('Public URL base: '.config('filesystems.disks.r2.url'));

        try {
            $url = Media::put($key, $bytes, $disk);
        } catch (\Throwable $e) {
            $this->error('R2 upload failed: '.$e->getMessage());
            $this->comment('Common causes: wrong AWS_ENDPOINT/account, bucket name, or API token permissions.');

            return self::FAILURE;
        }

        $this->info('Uploaded. Canonical URL: '.$url);

        if (! Media::isExternalUrl($url)) {
            $url = Storage::disk($disk)->url($key);
            $this->line('Resolved public URL: '.$url);
        }

        try {
            $response = Http::timeout(20)->get($url);
            $this->line('HTTP '.$response->status());
            if (! $response->successful()) {
                $this->error('Public URL did not return 200. Enable R2 Public Development URL or custom domain for this bucket.');
                $this->line('Then set AWS_URL and R2_PUBLIC_URL to that exact origin on Render.');

                return self::FAILURE;
            }
        } catch (\Throwable $e) {
            $this->error('Could not fetch public URL: '.$e->getMessage());

            return self::FAILURE;
        }

        Storage::disk($disk)->delete($key);
        $this->info('R2 media pipeline OK (probe object deleted).');

        return self::SUCCESS;
    }
}
