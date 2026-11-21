<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RewriteMediaPublicUrlCommand extends Command
{
    protected $signature = 'media:rewrite-public-url
                            {--from= : Comma-separated old public media origins (default: cdn.fitandsleek.online + media.phuemnorng-kalapakteam.space)}
                            {--to=https://media.fitandsleek.online : New public media origin (no trailing slash)}
                            {--dry-run : Show changes without saving}';

    protected $description = 'Replace old R2/CDN hosts in stored image URLs (products, banners, categories, etc.)';

    /** @var list<string> */
    private const DEFAULT_FROM_HOSTS = [
        'https://cdn.fitandsleek.online',
        'https://media.phuemnorng-kalapakteam.space',
    ];

    public function handle(): int
    {
        $to = rtrim(trim((string) $this->option('to')), '/');
        $dryRun = (bool) $this->option('dry-run');
        $fromRaw = trim((string) $this->option('from'));
        $fromHosts = $fromRaw !== ''
            ? array_values(array_filter(array_map(
                fn (string $h) => rtrim(trim($h), '/'),
                explode(',', $fromRaw)
            )))
            : self::DEFAULT_FROM_HOSTS;

        if ($to === '') {
            $this->error('--to is required (e.g. --to=https://media.fitandsleek.online).');

            return self::FAILURE;
        }

        $total = 0;
        foreach ($fromHosts as $from) {
            if ($from === '' || $from === $to) {
                continue;
            }
            $this->info(($dryRun ? '[dry-run] ' : '')."Rewriting {$from} → {$to}");
            $total += $this->rewriteAllTables($from, $to, $dryRun);
        }

        $this->newLine();
        $this->info("Done. Rows/fields updated: {$total}");

        return self::SUCCESS;
    }

    private function rewriteAllTables(string $from, string $to, bool $dryRun): int
    {
        $total = 0;

        $total += $this->rewriteColumn('products', 'image_url', $from, $to, $dryRun);
        $total += $this->rewriteJsonColumn('products', 'gallery', $from, $to, $dryRun);
        $total += $this->rewriteJsonColumn('products', 'colors', $from, $to, $dryRun);

        foreach (['banners', 'categories', 'collections'] as $table) {
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'image_url')) {
                $total += $this->rewriteColumn($table, 'image_url', $from, $to, $dryRun);
            }
            if (Schema::hasTable($table) && Schema::hasColumn($table, 'gallery')) {
                $total += $this->rewriteTextColumn($table, 'gallery', $from, $to, $dryRun);
            }
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'profile_image_path')) {
            $total += $this->rewriteColumn('users', 'profile_image_path', $from, $to, $dryRun);
        }

        return $total;
    }

    private function rewriteColumn(string $table, string $column, string $from, string $to, bool $dryRun): int
    {
        $rows = DB::table($table)->where($column, 'like', $from.'%')->get(['id', $column]);
        if ($rows->isEmpty()) {
            return 0;
        }

        $this->line("  {$table}.{$column}: {$rows->count()} row(s)");
        if ($dryRun) {
            return $rows->count();
        }

        foreach ($rows as $row) {
            $value = $row->{$column};
            if (! is_string($value) || ! str_starts_with($value, $from)) {
                continue;
            }
            DB::table($table)->where('id', $row->id)->update([
                $column => $to.substr($value, strlen($from)),
            ]);
        }

        return $rows->count();
    }

    private function rewriteTextColumn(string $table, string $column, string $from, string $to, bool $dryRun): int
    {
        return $this->rewriteColumn($table, $column, $from, $to, $dryRun);
    }

    private function rewriteJsonColumn(string $table, string $column, string $from, string $to, bool $dryRun): int
    {
        if (! Schema::hasColumn($table, $column)) {
            return 0;
        }

        $rows = DB::table($table)->whereNotNull($column)->get(['id', $column]);
        $updated = 0;

        foreach ($rows as $row) {
            $raw = $row->{$column};
            if ($raw === null || $raw === '' || $raw === '[]') {
                continue;
            }

            $encoded = is_string($raw) ? $raw : json_encode($raw);
            if (! is_string($encoded) || ! str_contains($encoded, $from)) {
                continue;
            }

            $newEncoded = str_replace($from, $to, $encoded);
            if ($newEncoded === $encoded) {
                continue;
            }

            $updated++;
            $this->line("  {$table}.{$column} #{$row->id}");
            if (! $dryRun) {
                DB::table($table)->where('id', $row->id)->update([$column => $newEncoded]);
            }
        }

        return $updated;
    }
}
