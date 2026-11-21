<?php

namespace App\Services;

use App\Http\Controllers\Api\Admin\HomepageSettingsController;
use App\Http\Controllers\Api\Storefront\BannerController;
use App\Http\Controllers\Api\Storefront\BrandController;
use App\Http\Controllers\Api\Storefront\CategoryController;
use App\Http\Controllers\Api\Storefront\CollectionController;
use App\Http\Controllers\Api\Storefront\ProductController;
use Illuminate\Http\Request;

class HomepageBootstrapService
{
    private const PARENT_SECTION_KEYS = ['women', 'men', 'boys', 'girls'];

    private const TAB_SECTION_MAP = ['newIn' => 'new'];

    private const PARENT_LINK_MAP = [
        'women' => 'Women',
        'men' => 'Men',
        'boys' => 'Boys',
        'girls' => 'Girls',
    ];

    public function __construct(
        private ProductRecommendationService $recommendations,
    ) {
    }

    public function build(string $segment = 'guest'): array
    {
        $settings = $this->decodeJson(app(HomepageSettingsController::class)->getSettings());
        $categories = $this->decodeJson(app(CategoryController::class)->index());
        $categoryList = is_array($categories) ? $categories : [];

        $sectionsConfig = $this->enabledSections($settings);
        // Sequential on Free-tier: Concurrency::run forks workers and exhausts PHP-FPM → 504 via Netlify.
        $sectionProducts = $this->loadAllSectionProducts($sectionsConfig, $categoryList);
        $heroBanners = $this->bannerPayload('hero');
        $promoBanners = $this->bannerPayload('promo');
        $collections = $this->decodeJson(app(CollectionController::class)->index())['data'] ?? [];
        $brands = $this->decodeJson(app(BrandController::class)->index())['data'] ?? [];
        $recommendedPayload = $this->recommendations->recommendations(null, null, 8)->toArray();

        return [
            'settings' => $settings,
            'categories' => $categoryList,
            'hero_banners' => $heroBanners,
            'promo_banners' => $promoBanners,
            'collections' => $collections,
            'brands' => $brands,
            'sections' => $sectionProducts,
            'recommended' => $recommendedPayload['data'] ?? [],
            'segment' => $segment,
        ];
    }

    /**
     * @param  list<array{key: string, title: string, enabled: bool, order: int}>  $sectionsConfig
     * @param  list<array<string, mixed>>  $categoryList
     * @return array<string, list<array<string, mixed>>>
     */
    private function loadAllSectionProducts(array $sectionsConfig, array $categoryList): array
    {
        $sectionProducts = [];
        foreach ($sectionsConfig as $section) {
            $sectionProducts[$section['key']] = $this->loadSectionProducts(
                $section['key'],
                $section['title'],
                $categoryList
            );
        }

        return $sectionProducts;
    }

    /**
     * @return list<array{key: string, title: string, enabled: bool, order: int}>
     */
    private function enabledSections(array $settings): array
    {
        $sections = $settings['sections'] ?? null;
        if (! is_array($sections) || $sections === []) {
            return [
                ['key' => 'discounts', 'title' => 'Discounts', 'enabled' => true, 'order' => 1],
                ['key' => 'clothes', 'title' => 'Clothes', 'enabled' => true, 'order' => 2],
                ['key' => 'shoes', 'title' => 'Shoes', 'enabled' => true, 'order' => 3],
                ['key' => 'belts', 'title' => 'Belts', 'enabled' => true, 'order' => 4],
            ];
        }

        $enabled = [];
        foreach ($sections as $key => $section) {
            if (! is_array($section) || empty($section['enabled'])) {
                continue;
            }
            $enabled[] = [
                'key' => (string) $key,
                'title' => (string) ($section['title'] ?? $key),
                'enabled' => true,
                'order' => (int) ($section['order'] ?? 0),
            ];
        }

        usort($enabled, fn (array $a, array $b) => $a['order'] <=> $b['order']);

        return $enabled;
    }

    /**
     * @param  list<array<string, mixed>>  $categories
     * @return list<array<string, mixed>>
     */
    private function loadSectionProducts(string $key, string $title, array $categories): array
    {
        if ($key === 'discounts') {
            return $this->productSlice('/api/products/discounts', ['per_page' => 8]);
        }

        if (isset(self::TAB_SECTION_MAP[$key])) {
            return $this->productSlice('/api/products', [
                'tab' => self::TAB_SECTION_MAP[$key],
                'per_page' => 8,
            ]);
        }

        if (in_array($key, self::PARENT_SECTION_KEYS, true)) {
            $parent = self::PARENT_LINK_MAP[$key] ?? $key;

            return $this->productSlice('/api/products', [
                'parent_category' => $parent,
                'per_page' => 8,
            ]);
        }

        $matched = $this->pickCategories($categories, $this->sectionSearchTokens($key, $title));
        if ($matched === []) {
            return [];
        }

        $groups = [];
        foreach ($matched as $category) {
            $params = ! empty($category['slug'])
                ? ['category' => $category['slug'], 'per_page' => 24]
                : ['category_id' => $category['id'], 'per_page' => 24];
            $groups[] = $this->productSlice('/api/products', $params);
        }

        return array_slice($this->interleaveProductGroups($groups), 0, 8);
    }

    /**
     * @param  list<array<string, mixed>>  $categories
     * @return list<array<string, mixed>>
     */
    private function pickCategories(array $categories, array $names): array
    {
        $tokens = array_values(array_filter(array_map([$this, 'normalizeToken'], $names)));
        if ($tokens === []) {
            return [];
        }

        $exact = [];
        foreach ($categories as $category) {
            $name = $this->normalizeToken($category['name'] ?? '');
            $slug = $this->normalizeToken($category['slug'] ?? '');
            $type = $this->normalizeToken($category['type'] ?? '');
            foreach ($tokens as $token) {
                if ($token === $name || $token === $slug || $token === $type) {
                    $exact[] = $category;
                    break;
                }
            }
        }

        if ($exact !== []) {
            return $exact;
        }

        $partial = [];
        foreach ($categories as $category) {
            $name = $this->normalizeToken($category['name'] ?? '');
            $slug = $this->normalizeToken($category['slug'] ?? '');
            $type = $this->normalizeToken($category['type'] ?? '');
            foreach ($tokens as $token) {
                if (
                    str_contains($name, $token)
                    || str_contains($slug, $token)
                    || str_contains($type, $token)
                ) {
                    $partial[] = $category;
                    break;
                }
            }
        }

        return $partial;
    }

    /**
     * @return list<string>
     */
    private function sectionSearchTokens(string $key, string $title): array
    {
        $tokens = array_values(array_filter([
            $this->normalizeToken($key),
            $this->normalizeToken($title),
        ]));

        if (str_contains($this->normalizeToken($key), 'belt') || str_contains($this->normalizeToken($title), 'belt')) {
            $tokens[] = 'belts';
            $tokens[] = 'belt';
        }

        return array_values(array_unique($tokens));
    }

    private function normalizeToken(mixed $value): string
    {
        $normalized = strtolower(trim((string) $value));
        $normalized = preg_replace('/[_-]+/', ' ', $normalized) ?? $normalized;

        return preg_replace('/\s+/', ' ', $normalized) ?? $normalized;
    }

    /**
     * @param  list<list<array<string, mixed>>>  $groups
     * @return list<array<string, mixed>>
     */
    private function interleaveProductGroups(array $groups): array
    {
        $lists = array_map(fn (array $items) => array_values($items), $groups);
        $output = [];

        $hasRemaining = true;
        while ($hasRemaining) {
            $hasRemaining = false;
            foreach ($lists as &$list) {
                if ($list !== []) {
                    $output[] = array_shift($list);
                    $hasRemaining = true;
                }
            }
            unset($list);
        }

        $unique = [];
        foreach ($output as $product) {
            $id = $product['id'] ?? null;
            if ($id !== null && ! isset($unique[$id])) {
                $unique[$id] = $product;
            }
        }

        return array_values($unique);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function productSlice(string $uri, array $params): array
    {
        $request = Request::create($uri, 'GET', $params);
        $controller = app(ProductController::class);

        $response = str_contains($uri, 'discounts')
            ? $controller->discounts($request)
            : $controller->index($request);

        $payload = $this->decodeJson($response);
        $items = $payload['data'] ?? [];

        return is_array($items) ? array_slice($items, 0, 8) : [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function bannerPayload(string $position): array
    {
        return $this->decodeJson(app(BannerController::class)->index($position))['data'] ?? [];
    }

    private function decodeJson(mixed $response): array
    {
        if (is_array($response)) {
            return $response;
        }

        $content = method_exists($response, 'getContent') ? $response->getContent() : '';
        $decoded = json_decode((string) $content, true);

        return is_array($decoded) ? $decoded : [];
    }
}
