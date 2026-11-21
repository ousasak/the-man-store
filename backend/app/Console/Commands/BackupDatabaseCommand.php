<?php

namespace App\Console\Commands;

use App\Services\DatabaseBackupService;
use Illuminate\Console\Command;

class BackupDatabaseCommand extends Command
{
    protected $signature = 'backup:database
                            {--force : Backup even when data is unchanged}';

    protected $description = 'Dump, encrypt, and store a PostgreSQL backup (R2 + Telegram)';

    public function handle(DatabaseBackupService $backups): int
    {
        $force = (bool) $this->option('force');
        $this->info($force ? 'Starting database backup (forced)…' : 'Starting database backup…');

        $result = $backups->run($force);

        if (! empty($result['skipped'])) {
            $this->comment($result['message']);

            return self::SUCCESS;
        }

        if ($result['ok']) {
            $this->info($result['message']);

            return self::SUCCESS;
        }

        $this->error($result['message']);

        return self::FAILURE;
    }
}
