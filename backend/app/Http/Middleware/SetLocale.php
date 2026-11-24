<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetLocale
{
    /**
     * Handle an incoming request and set the application locale based on the Accept-Language header.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $acceptLang = $request->header('Accept-Language');
        if ($acceptLang) {
            $lang = strtolower(substr(trim($acceptLang), 0, 2));
            if ($lang === 'km' || $lang === 'kh') {
                app()->setLocale('km');
            } elseif ($lang === 'en') {
                app()->setLocale('en');
            }
        }

        return $next($request);
    }
}
