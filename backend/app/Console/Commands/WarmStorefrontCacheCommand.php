<?php

namespace App\Console\Commands;

use App\Services\HomepageBootstrapService;
use App\Services\StorefrontCacheService;
use Illuminate\Console\Command;

class WarmStorefrontCacheCommand extends Command
{
    protected $signature = 'storefront:warm';

    protected $description = 'Rebuild the homepage bootstrap cache so the first visitor never waits for a cold build';

    public function handle(HomepageBootstrapService $bootstrap): int
    {
        $started = microtime(true);

        try {
            StorefrontCacheService::forget('homepage-bootstrap', 'guest');

            StorefrontCacheService::remember(
                'homepage-bootstrap',
                StorefrontCacheService::TTL_BOOTSTRAP,
                'guest',
                fn (): array => $bootstrap->build('guest'),
            );
        } catch (\Throwable $e) {
            report($e);
            $this->error('Warm failed: '.$e->getMessage());

            return self::FAILURE;
        }

        $this->info(sprintf('Homepage bootstrap cache warmed in %.1fs', microtime(true) - $started));

        return self::SUCCESS;
    }
}
