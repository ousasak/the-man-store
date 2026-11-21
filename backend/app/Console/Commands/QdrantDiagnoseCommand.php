<?php

namespace App\Console\Commands;

use App\Models\Product;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class QdrantDiagnoseCommand extends Command
{
    protected $signature = 'qdrant:diagnose';

    protected $description = 'Check The Man Store Vector Space (embed + Qdrant-compatible) connectivity and product indexing stats';

    public function handle(): int
    {
        $vectorBase = rtrim((string) config('services.image_search.vector_base_url', ''), '/');
        $clip = rtrim((string) config('services.image_search.clip_endpoint', ''), '/');
        $qdrant = rtrim((string) config('services.image_search.qdrant_url', ''), '/');
        $collection = (string) config('services.image_search.qdrant_collection', 'products_fitandsleek_512');
        $vectorSize = (int) config('services.image_search.vector_size', 512);
        $timeout = (int) config('services.image_search.timeout', 90);
        $apiKey = (string) (config('services.image_search.qdrant_api_key')
            ?: config('services.image_search.ai_service_key')
            ?: '');
        $hasApiKey = $apiKey !== '';

        $this->info('Resolved configuration');
        $this->line('  FITANDSLEEK_VECTOR_URL → '.($vectorBase !== '' ? $vectorBase : '(empty)'));
        $this->line('  embed endpoint → '.$clip);
        $this->line('  QDRANT_URL → '.$qdrant);
        $this->line('  QDRANT_COLLECTION → '.$collection);
        $this->line('  QDRANT_VECTOR_SIZE → '.$vectorSize);
        $this->line('  IMAGE_SEARCH_TIMEOUT → '.$timeout.' s');
        $this->line('  API key (FITANDSLEEK_VECTOR_API_KEY / QDRANT_API_KEY) → '.($hasApiKey ? 'yes' : 'no'));

        // The Man Store Vector uses /healthz; strip /embed/image or legacy /vectorize.
        $healthBase = preg_replace('#/(embed(/image)?|vectorize)/?$#i', '', $clip) ?: $qdrant ?: $vectorBase;
        $healthUrl = rtrim((string) $healthBase, '/').'/healthz';

        $authHeaders = $hasApiKey
            ? [
                'api-key' => $apiKey,
                'x-api-key' => $apiKey,
            ]
            : [];

        $this->newLine();
        $this->info('Vector Space health');
        $this->line('  GET '.$healthUrl);
        try {
            $h = Http::timeout(min(15, $timeout))->withHeaders($authHeaders)->get($healthUrl);
            if ($h->successful()) {
                $this->line('  OK '.$h->status().' — '.Str::limit(trim($h->body()), 180));
            } else {
                $this->warn('  HTTP '.$h->status().' — '.Str::limit(trim($h->body()), 300));
            }
        } catch (\Throwable $e) {
            $this->error('  Unreachable: '.$e->getMessage());
        }

        if (! $hasApiKey) {
            $this->newLine();
            $this->error('Missing API key. Register on the Space, then set FITANDSLEEK_VECTOR_API_KEY=fsv_…');
            $this->comment('  https://huggingface.co/spaces/Kalapak/fitandsleek-vector');
        }

        $pointsCount = null;

        $this->newLine();
        $this->info('Vector collection (Qdrant-compatible)');
        $metaUrl = $qdrant.'/collections/'.rawurlencode($collection);
        $this->line('  GET '.$metaUrl);
        try {
            $c = Http::timeout(min(15, $timeout))->withHeaders($authHeaders)->get($metaUrl);
            if ($c->successful()) {
                $result = $c->json('result', []);
                $pointsCount = (int) (data_get($result, 'points_count') ?? 0);
                $this->line('  points_count: '.$pointsCount);
                $this->line('  status: '.(string) (data_get($result, 'status') ?? 'n/a'));
                $configuredSize = data_get($result, 'config.params.vectors.size');
                if ($configuredSize !== null) {
                    $this->line('  vector size: '.(string) $configuredSize.(($configuredSize != $vectorSize) ? ' (expected '.$vectorSize.')' : ''));
                }
            } elseif ($c->status() === 404) {
                $this->warn('  Collection missing (404). Run: php artisan qdrant:setup');
            } elseif ($c->status() === 401) {
                $this->warn('  Unauthorized (401). Set FITANDSLEEK_VECTOR_API_KEY (fsv_…)');
            } else {
                $this->warn('  HTTP '.$c->status().' — '.Str::limit(trim($c->body()), 300));
            }
        } catch (\Throwable $e) {
            $this->error('  Unreachable: '.$e->getMessage());
        }

        $this->newLine();
        $this->info('PostgreSQL (products)');
        $indexed = 0;
        try {
            $eligible = Product::query()
                ->where('is_active', true)
                ->whereNotNull('image_url')
                ->where('image_url', '!=', '')
                ->count();
            $indexed = Product::query()->where('is_vector_indexed', true)->count();
            $withErrors = Product::query()
                ->whereNotNull('vector_index_error')
                ->where('is_vector_indexed', false)
                ->count();

            $this->line('  Active with non-empty image_url: '.$eligible);
            $this->line('  is_vector_indexed = true: '.$indexed);
            $this->line('  is_vector_indexed = false with vector_index_error: '.$withErrors);

            $samples = Product::query()
                ->whereNotNull('vector_index_error')
                ->where('is_vector_indexed', false)
                ->orderByDesc('updated_at')
                ->limit(5)
                ->get(['id', 'name', 'vector_index_error']);

            foreach ($samples as $p) {
                $this->warn('  #'.$p->id.' '.$p->name.': '.Str::limit((string) $p->vector_index_error, 240));
            }
        } catch (\Throwable $e) {
            $this->error('  '.$e->getMessage());
        }

        if ($pointsCount === 0 && $indexed > 0) {
            $this->newLine();
            $this->error('Image search returns 0 matches: Qdrant has no vectors but '.$indexed.' product(s) are marked indexed in PostgreSQL.');
            $this->comment('  php artisan qdrant:index-products --force');
        }

        $driver = (string) config('queue.default');
        $this->newLine();
        $this->info('Queue driver: '.$driver);
        try {
            if ($driver === 'database' && Schema::hasTable('jobs')) {
                try {
                    $pending = (int) DB::table('jobs')->count();
                    $this->line('  jobs table rows (pending): '.$pending);
                } catch (\Throwable $e) {
                    $this->warn('  Could not read jobs: '.$e->getMessage());
                }
            } elseif ($driver !== 'database') {
                $this->line('  (Pending job counts are not shown for driver "'.$driver.'".)');
            }

            if (Schema::hasTable('failed_jobs')) {
                try {
                    $failed = (int) DB::table('failed_jobs')->count();
                    if ($failed > 0) {
                        $this->warn('  failed_jobs table rows: '.$failed.' — run: php artisan queue:failed');
                    }
                } catch (\Throwable $e) {
                    // ignore
                }
            }
        } catch (\Throwable $e) {
            $this->warn('  Queue / schema checks skipped (database unreachable): '.Str::limit($e->getMessage(), 200));
        }

        $this->newLine();
        $this->comment('Then set FITANDSLEEK_VECTOR_API_KEY and index products:');
        $this->comment('  php artisan qdrant:setup');
        $this->comment('  php artisan qdrant:index-products --limit=5 -v');
        $this->comment('Docs: docs/ai/huggingface-vector-space.md');

        return self::SUCCESS;
    }
}
