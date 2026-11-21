<?php

namespace App\Services;

use Illuminate\Support\ConfigurationUrlParser;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class DatabaseBackupService
{
    public function __construct(private TelegramService $telegram)
    {
    }

    /**
     * @return array{
     *     ok: bool,
     *     skipped?: bool,
     *     message: string,
     *     filename?: string,
     *     bytes?: int,
     *     r2_path?: string|null,
     *     telegram_sent?: bool
     * }
     */
    public function run(bool $force = false): array
    {
        if (! config('backup.enabled')) {
            return ['ok' => false, 'message' => 'Backups are disabled (BACKUP_ENABLED=false).'];
        }

        $key = trim((string) config('backup.encryption_key'));
        if ($key === '') {
            return ['ok' => false, 'message' => 'BACKUP_ENCRYPTION_KEY is not set.'];
        }

        $chatId = trim((string) config('backup.telegram_chat_id'));
        if ($chatId === '') {
            return ['ok' => false, 'message' => 'BACKUP_TELEGRAM_CHAT_ID (or TELEGRAM_ADMIN_CHAT_ID) is not set.'];
        }

        if (config('database.default') !== 'pgsql') {
            return ['ok' => false, 'message' => 'Only PostgreSQL backups are supported.'];
        }

        $fingerprint = null;
        if (! $force && (bool) config('backup.skip_if_unchanged', true)) {
            try {
                $fingerprint = $this->contentFingerprint();
                $previous = $this->readStoredFingerprint();
                if ($fingerprint !== '' && $previous !== null && hash_equals($previous, $fingerprint)) {
                    $message = '⏭️ Database backup skipped — no data changes since the last backup.';
                    Log::info('Database backup skipped (unchanged fingerprint).');

                    if ((bool) config('backup.notify_skip', false)) {
                        try {
                            $this->telegram->sendMessage($chatId, $message, null, null);
                        } catch (Throwable) {
                            // ignore notify failure
                        }
                    }

                    return [
                        'ok' => true,
                        'skipped' => true,
                        'message' => $message,
                    ];
                }
            } catch (Throwable $e) {
                // Fingerprint failures must not block backups.
                Log::warning('Backup fingerprint check failed; continuing with dump.', [
                    'error' => $e->getMessage(),
                ]);
                $fingerprint = null;
            }
        }

        $workDir = storage_path('app/private/backups/tmp');
        if (! is_dir($workDir) && ! mkdir($workDir, 0750, true) && ! is_dir($workDir)) {
            return ['ok' => false, 'message' => 'Could not create backup temp directory.'];
        }

        $stamp = now(config('backup.timezone'))->format('Y-m-d_His');
        $prefix = (string) config('backup.filename_prefix', 'themanstore');
        $baseName = "{$prefix}-{$stamp}";
        $sqlPath = "{$workDir}/{$baseName}.sql";
        $gzPath = "{$sqlPath}.gz";
        $encPath = "{$gzPath}.enc";
        $filename = basename($encPath);

        try {
            $this->dumpDatabase($sqlPath);
            $this->gzipFile($sqlPath, $gzPath);
            @unlink($sqlPath);

            $this->encryptFile($gzPath, $encPath, $key);
            @unlink($gzPath);

            $bytes = (int) filesize($encPath);
            $r2Path = $this->uploadToDisk($encPath, $filename);
            $telegramSent = $this->deliverToTelegram($chatId, $encPath, $filename, $bytes, $r2Path);
            $this->pruneRemoteBackups();

            if ($fingerprint === null) {
                try {
                    $fingerprint = $this->contentFingerprint();
                } catch (Throwable) {
                    $fingerprint = null;
                }
            }
            if (is_string($fingerprint) && $fingerprint !== '') {
                $this->storeFingerprint($fingerprint);
            }

            $sizeLabel = $this->humanBytes($bytes);
            $message = "✅ Database backup completed\n"
                ."📅 {$stamp}\n"
                ."📦 {$filename}\n"
                ."💾 {$sizeLabel}\n"
                .'🔒 Encrypted AES-256';

            if ($r2Path) {
                $message .= "\n🗄 R2: {$r2Path}";
            }
            if (! $telegramSent) {
                $message .= "\n⚠️ Telegram file not sent (see logs) — R2 path above if present.";
            }

            $this->telegram->sendMessage($chatId, $message, null, null);

            return [
                'ok' => true,
                'skipped' => false,
                'message' => $message,
                'filename' => $filename,
                'bytes' => $bytes,
                'r2_path' => $r2Path,
                'telegram_sent' => $telegramSent,
            ];
        } catch (Throwable $e) {
            Log::error('Database backup failed', ['error' => $e->getMessage()]);

            $fail = "❌ Database backup FAILED\n🛠 ".$e->getMessage();
            try {
                $this->telegram->sendMessage($chatId, $fail, null, null);
            } catch (Throwable) {
                // ignore notify failure
            }

            return ['ok' => false, 'message' => $fail];
        } finally {
            foreach ([$sqlPath, $gzPath, $encPath] as $path) {
                if (is_file($path)) {
                    @unlink($path);
                }
            }
        }
    }

    private function dumpDatabase(string $sqlPath): void
    {
        // Eloquent parses DATABASE_URL when connecting; pg_dump must do the same.
        // Raw config keeps DB_HOST=127.0.0.1 even when only DATABASE_URL is set (Railway).
        $db = $this->resolvedPgsqlConfig();
        $host = (string) ($db['host'] ?? '');
        $port = (string) ($db['port'] ?? '5432');
        $database = (string) ($db['database'] ?? '');
        $username = (string) ($db['username'] ?? '');
        $password = (string) ($db['password'] ?? '');
        $sslmode = (string) ($db['sslmode'] ?? 'prefer');

        if ($host === '' || $database === '' || $username === '') {
            throw new RuntimeException('PostgreSQL connection settings are incomplete.');
        }

        $pgDump = $this->resolveBinary('pg_dump');
        $ldPath = '/opt/pg18/lib';
        if ($existing = getenv('LD_LIBRARY_PATH')) {
            $ldPath .= ':'.$existing;
        }

        $result = Process::env($this->processEnv([
            'PGPASSWORD' => $password,
            'PGSSLMODE' => $sslmode,
            'LD_LIBRARY_PATH' => $ldPath,
        ]))
            ->timeout(600)
            ->run([
                $pgDump,
                '-h', $host,
                '-p', $port,
                '-U', $username,
                '-d', $database,
                '--no-owner',
                '--no-acl',
                '-F', 'p',
                '-f', $sqlPath,
            ]);

        if (! $result->successful() || ! is_file($sqlPath) || filesize($sqlPath) < 1) {
            throw new RuntimeException(trim($result->errorOutput() ?: $result->output()) ?: 'pg_dump failed.');
        }
    }

    private function gzipFile(string $sqlPath, string $gzPath): void
    {
        $in = fopen($sqlPath, 'rb');
        if ($in === false) {
            throw new RuntimeException('Could not read SQL dump for compression.');
        }

        $out = gzopen($gzPath, 'wb9');
        if ($out === false) {
            fclose($in);
            throw new RuntimeException('Could not open gzip target.');
        }

        try {
            while (! feof($in)) {
                $chunk = fread($in, 1024 * 1024);
                if ($chunk === false) {
                    throw new RuntimeException('Failed reading SQL dump during gzip.');
                }
                if ($chunk !== '' && gzwrite($out, $chunk) === false) {
                    throw new RuntimeException('Failed writing gzipped backup.');
                }
            }
        } finally {
            fclose($in);
            gzclose($out);
        }

        if (! is_file($gzPath) || filesize($gzPath) < 1) {
            throw new RuntimeException('Gzip produced an empty file.');
        }
    }

    private function encryptFile(string $inputPath, string $outputPath, string $password): void
    {
        $openssl = $this->resolveBinary('openssl');

        $result = Process::env($this->processEnv([
            'BACKUP_ENCRYPTION_KEY' => $password,
        ]))
            ->timeout(300)
            ->run([
                $openssl, 'enc',
                '-aes-256-cbc',
                '-pbkdf2',
                '-iter', '100000',
                '-salt',
                '-in', $inputPath,
                '-out', $outputPath,
                '-pass', 'env:BACKUP_ENCRYPTION_KEY',
            ]);

        if (! $result->successful() || ! is_file($outputPath) || filesize($outputPath) < 1) {
            throw new RuntimeException(trim($result->errorOutput()) ?: 'openssl encrypt failed.');
        }
    }

    private function uploadToDisk(string $localPath, string $filename): ?string
    {
        $diskName = trim((string) config('backup.disk'));
        if ($diskName === '' || $diskName === 'null' || $diskName === 'false') {
            return null;
        }

        $diskConfig = config("filesystems.disks.{$diskName}");
        if (! is_array($diskConfig)) {
            Log::warning('Backup disk not defined; skipping object storage.', ['disk' => $diskName]);

            return null;
        }

        if (blank($diskConfig['key'] ?? null) || blank($diskConfig['secret'] ?? null) || blank($diskConfig['bucket'] ?? null) || blank($diskConfig['endpoint'] ?? null)) {
            Log::info('Backup disk credentials incomplete; Telegram-only backup.');

            return null;
        }

        $prefix = trim((string) config('backup.path_prefix'), '/');
        $datePath = now(config('backup.timezone'))->format('Y/m/d');
        $remotePath = ($prefix !== '' ? $prefix.'/' : '')."{$datePath}/{$filename}";

        Storage::disk($diskName)->put($remotePath, fopen($localPath, 'r'), [
            'visibility' => 'private',
            'ContentType' => 'application/octet-stream',
        ]);

        return $remotePath;
    }

    private function deliverToTelegram(string $chatId, string $localPath, string $filename, int $bytes, ?string $r2Path): bool
    {
        $max = (int) config('backup.telegram_max_bytes');
        if ($bytes > $max) {
            $this->telegram->sendMessage(
                $chatId,
                "⚠️ Backup file is larger than Telegram limit ({$this->humanBytes($bytes)}).\n"
                .'File kept on object storage only'
                .($r2Path ? ": {$r2Path}" : ' (configure BACKUP_DISK / R2).'),
                null,
                null
            );

            return false;
        }

        $caption = "📦 {$filename}\n💾 {$this->humanBytes($bytes)}\n🔒 Encrypted database backup";

        return $this->telegram->sendDocument($chatId, $localPath, $filename, $caption);
    }

    private function pruneRemoteBackups(): void
    {
        $diskName = trim((string) config('backup.disk'));
        if ($diskName === '' || $diskName === 'null' || $diskName === 'false') {
            return;
        }

        $diskConfig = config("filesystems.disks.{$diskName}");
        if (! is_array($diskConfig) || blank($diskConfig['bucket'] ?? null) || blank($diskConfig['key'] ?? null)) {
            return;
        }

        $days = (int) config('backup.retention_days', 14);
        $cutoff = now(config('backup.timezone'))->subDays($days)->getTimestamp();
        $prefix = trim((string) config('backup.path_prefix'), '/');
        $prefix = $prefix !== '' ? $prefix.'/' : '';

        try {
            $disk = Storage::disk($diskName);
            foreach ($disk->allFiles($prefix === '' ? '' : rtrim($prefix, '/')) as $path) {
                if (! str_ends_with($path, '.sql.gz.enc')) {
                    continue;
                }
                $lastModified = $disk->lastModified($path);
                if ($lastModified !== false && $lastModified < $cutoff) {
                    $disk->delete($path);
                }
            }
        } catch (Throwable $e) {
            Log::warning('Backup prune failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * Lightweight change detector: insert/update/delete counters per user table.
     * Survives app redeploys; stored fingerprint lives on R2 (or local meta file).
     */
    private function contentFingerprint(): string
    {
        $row = DB::selectOne(
            "SELECT md5(COALESCE(string_agg(
                format('%s.%s:%s:%s:%s', schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del),
                '|' ORDER BY schemaname, relname
            ), '')) AS fingerprint
            FROM pg_stat_user_tables"
        );

        return trim((string) ($row->fingerprint ?? ''));
    }

    private function fingerprintMetaPath(): string
    {
        $prefix = trim((string) config('backup.path_prefix'), '/');

        return ($prefix !== '' ? $prefix.'/' : '').'.last-content-fingerprint';
    }

    private function localFingerprintPath(): string
    {
        return storage_path('app/private/backups/last-content-fingerprint');
    }

    private function readStoredFingerprint(): ?string
    {
        $disk = $this->backupDiskOrNull();
        if ($disk !== null) {
            try {
                $path = $this->fingerprintMetaPath();
                if ($disk->exists($path)) {
                    $value = trim((string) $disk->get($path));
                    if ($value !== '') {
                        return $value;
                    }
                }
            } catch (Throwable $e) {
                Log::warning('Could not read backup fingerprint from object storage.', [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $local = $this->localFingerprintPath();
        if (is_file($local)) {
            $value = trim((string) file_get_contents($local));
            if ($value !== '') {
                return $value;
            }
        }

        return null;
    }

    private function storeFingerprint(string $fingerprint): void
    {
        $disk = $this->backupDiskOrNull();
        if ($disk !== null) {
            try {
                $disk->put($this->fingerprintMetaPath(), $fingerprint, [
                    'visibility' => 'private',
                    'ContentType' => 'text/plain',
                ]);
            } catch (Throwable $e) {
                Log::warning('Could not store backup fingerprint on object storage.', [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $local = $this->localFingerprintPath();
        $dir = dirname($local);
        if (! is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        @file_put_contents($local, $fingerprint);
    }

    private function backupDiskOrNull(): ?\Illuminate\Contracts\Filesystem\Filesystem
    {
        $diskName = trim((string) config('backup.disk'));
        if ($diskName === '' || $diskName === 'null' || $diskName === 'false') {
            return null;
        }

        $diskConfig = config("filesystems.disks.{$diskName}");
        if (! is_array($diskConfig)) {
            return null;
        }

        if (blank($diskConfig['key'] ?? null) || blank($diskConfig['secret'] ?? null) || blank($diskConfig['bucket'] ?? null) || blank($diskConfig['endpoint'] ?? null)) {
            return null;
        }

        return Storage::disk($diskName);
    }

    /**
     * @return array<string, mixed>
     */
    private function resolvedPgsqlConfig(): array
    {
        $config = config('database.connections.pgsql');
        if (! is_array($config)) {
            return [];
        }

        return (new ConfigurationUrlParser)->parseConfiguration($config);
    }

    private function resolveBinary(string $name): string
    {
        // Prefer a client at least as new as Neon (PG 18+).
        $candidates = [
            "/opt/pg18/bin/{$name}",
            "/opt/homebrew/opt/postgresql@18/bin/{$name}",
            "/usr/local/opt/postgresql@18/bin/{$name}",
            "/usr/lib/postgresql/18/bin/{$name}",
            "/opt/homebrew/opt/postgresql@17/bin/{$name}",
            "/usr/lib/postgresql/17/bin/{$name}",
            "/opt/homebrew/opt/postgresql@16/bin/{$name}",
            "/usr/local/opt/postgresql@16/bin/{$name}",
            "/usr/lib/postgresql/16/bin/{$name}",
            "/usr/bin/{$name}",
        ];
        foreach ($candidates as $candidate) {
            if (is_executable($candidate)) {
                return $candidate;
            }
        }

        $result = Process::run(['which', $name]);
        $path = trim($result->output());
        if ($result->successful() && $path !== '' && is_executable($path)) {
            return $path;
        }

        throw new RuntimeException("Required binary not found: {$name}");
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function processEnv(array $overrides): array
    {
        $base = [];
        foreach (array_merge($_ENV, $_SERVER) as $key => $value) {
            if (is_string($key) && is_string($value)) {
                $base[$key] = $value;
            }
        }

        $base['PATH'] = $base['PATH']
            ?? getenv('PATH')
            ?: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

        return array_merge($base, $overrides);
    }

    private function humanBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $value = (float) max(0, $bytes);
        $i = 0;
        while ($value >= 1024 && $i < count($units) - 1) {
            $value /= 1024;
            $i++;
        }

        return ($i === 0 ? (string) (int) $value : number_format($value, 1)).' '.$units[$i];
    }
}
