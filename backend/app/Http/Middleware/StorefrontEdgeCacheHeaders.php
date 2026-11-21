<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class StorefrontEdgeCacheHeaders
{
    private const CACHE_CONTROL = 'public, max-age=60, s-maxage=120, stale-while-revalidate=300';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if (! $this->shouldApply($request, $response)) {
            return $response;
        }

        $response->headers->set('Cache-Control', self::CACHE_CONTROL);

        return $response;
    }

    private function shouldApply(Request $request, Response $response): bool
    {
        if (! $request->isMethod('GET') || ! $request->is('api/*')) {
            return false;
        }

        if ($response->getStatusCode() !== 200) {
            return false;
        }

        if ($request->user() || $request->bearerToken()) {
            return false;
        }

        $path = trim($request->path(), '/');

        if (in_array($path, [
            'api/homepage/bootstrap',
            'api/categories',
            'api/collections',
            'api/brands',
            'api/homepage-settings',
            'api/products/discounts',
            'api/faq',
            'api/contact-page',
            'api/privacy-page',
            'api/terms-page',
            'api/cookies-page',
            'api/delivery-fees',
            'api/legal-content',
            'api/footer-header',
        ], true)) {
            return true;
        }

        if (preg_match('#^api/banners(/|$)#', $path) === 1) {
            return true;
        }

        if ($path === 'api/products') {
            return true;
        }

        return false;
    }
}
