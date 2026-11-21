<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Database backup
    |--------------------------------------------------------------------------
    |
    | Nightly pg_dump → gzip → AES encrypt → optional R2 upload → Telegram.
    | Telegram is the staff inbox; R2 (when configured) is the durable store.
    |
    */

    'enabled' => (bool) env('BACKUP_ENABLED', true),

    'encryption_key' => env('BACKUP_ENCRYPTION_KEY'),

    'retention_days' => max(1, (int) env('BACKUP_RETENTION_DAYS', 14)),

    'timezone' => env('BACKUP_TIMEZONE', 'Asia/Phnom_Penh'),

    'schedule_at' => env('BACKUP_SCHEDULE_AT', '02:00'),

    /*
    | Disk name from config/filesystems.php. Use "backup" (R2) when available.
    | Leave empty / null to skip object-storage upload and rely on Telegram only.
    */
    'disk' => env('BACKUP_DISK', 'backup'),

    'path_prefix' => trim((string) env('BACKUP_PATH_PREFIX', 'database-backups'), '/'),

    'telegram_chat_id' => env('BACKUP_TELEGRAM_CHAT_ID') ?: env('TELEGRAM_ADMIN_CHAT_ID'),

    // Bot API document limit is ~50MB; leave headroom.
    'telegram_max_bytes' => (int) env('BACKUP_TELEGRAM_MAX_BYTES', 45 * 1024 * 1024),

    'filename_prefix' => env('BACKUP_FILENAME_PREFIX', 'themanstore'),

    /*
    | Skip nightly dump/upload when PostgreSQL user-table change counters match
    | the fingerprint stored after the last successful backup (R2 meta file).
    | Manual /backup and `php artisan backup:database --force` always dump.
    */
    'skip_if_unchanged' => filter_var(env('BACKUP_SKIP_IF_UNCHANGED', true), FILTER_VALIDATE_BOOLEAN),

    // When true, Telegram gets a short "skipped" message. Default off to reduce noise.
    'notify_skip' => filter_var(env('BACKUP_NOTIFY_SKIP', false), FILTER_VALIDATE_BOOLEAN),

];
