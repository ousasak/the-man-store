<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// PostgreSQL → Qdrant: index active products that have image_url but no vector yet (no manual artisan needed).
Schedule::command('qdrant:index-products --only-missing --limit=10')
    ->everyTenMinutes()
    ->withoutOverlapping(25);

Schedule::command('backup:database')
    ->dailyAt((string) config('backup.schedule_at', '02:00'))
    ->timezone((string) config('backup.timezone', 'Asia/Phnom_Penh'))
    ->withoutOverlapping(120)
    ->when(fn () => (bool) config('backup.enabled', true));

Schedule::command('payments:poll-khqr')
    ->everyFifteenSeconds()
    ->withoutOverlapping(1)
    ->name('poll-khqr-payments');

Schedule::call(function () {
    $base = rtrim((string) config('app.url'), '/');
    if ($base === '') {
        return;
    }

    Http::timeout(15)->get("{$base}/api/health");
})->everyFiveMinutes()->name('storefront-keep-warm');
