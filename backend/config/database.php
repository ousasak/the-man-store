<?php

use Illuminate\Support\Str;

$envFirst = static function (string ...$keys): ?string {
    foreach ($keys as $key) {
        $candidates = [$_ENV[$key] ?? null, $_SERVER[$key] ?? null, getenv($key)];
        if (function_exists('env')) {
            $candidates[] = env($key);
        }
        foreach ($candidates as $value) {
            if (is_string($value) && trim($value) !== '') {
                return $value;
            }
        }
    }

    return null;
};

$sanitizeDatabaseUrl = static function (mixed $url): ?string {
    if (! is_string($url) || trim($url) === '') {
        return is_string($url) ? $url : null;
    }

    $url = trim(str_replace(["\r", "\n", "\t", "\0"], '', $url));
    $url = trim($url, "\"'");
    // Unresolved Railway reference — treat as missing.
    if (str_contains($url, '${{')) {
        return null;
    }
    // Dashboard paste: …/railway"?sslmode=require or …/railway%22?sslmode=require
    $url = str_replace(['%22', '%27'], '', $url);
    $url = str_replace(
        ["\u{201C}", "\u{201D}", "\u{2018}", "\u{2019}", '"', "'"],
        '',
        $url
    );

    return $url === '' ? null : $url;
};

$sanitizeDbIdent = static function (mixed $value, mixed $fallback = null): mixed {
    if (! is_string($value) || $value === '') {
        return $fallback ?? $value;
    }

    $value = trim($value, " \t\n\r\0\x0B\"'");
    $value = preg_replace('/[^A-Za-z0-9._-]/', '', $value) ?? $value;

    return $value === '' ? ($fallback ?? $value) : $value;
};

// Railway Postgres plugin: DATABASE_*_URL and/or PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
$databaseUrl = $sanitizeDatabaseUrl(
    $envFirst('DB_URL', 'DATABASE_URL', 'DATABASE_PRIVATE_URL', 'DATABASE_PUBLIC_URL')
);

// Do not pass `url` to pgsql. Laravel re-parses it (rawurldecode) and a stray
// quote on the path becomes database name railway" → every API returns 503.
$pgsqlFromUrl = [
    'host' => $envFirst('DB_HOST', 'PGHOST', 'POSTGRES_HOST') ?: '127.0.0.1',
    'port' => $envFirst('DB_PORT', 'PGPORT', 'POSTGRES_PORT') ?: '5432',
    'database' => $sanitizeDbIdent($envFirst('DB_DATABASE', 'PGDATABASE', 'POSTGRES_DB'), 'laravel'),
    'username' => $envFirst('DB_USERNAME', 'PGUSER', 'POSTGRES_USER') ?: 'root',
    'password' => $envFirst('DB_PASSWORD', 'PGPASSWORD', 'POSTGRES_PASSWORD') ?: '',
    'sslmode' => $envFirst('DB_SSLMODE') ?: 'prefer',
];
if (is_string($databaseUrl) && $databaseUrl !== '') {
    $parsed = parse_url(preg_replace('#^postgres(ql)?:#i', 'https:', $databaseUrl) ?? $databaseUrl);
    if (is_array($parsed)) {
        if (! empty($parsed['host'])) {
            $pgsqlFromUrl['host'] = $parsed['host'];
        }
        if (! empty($parsed['port'])) {
            $pgsqlFromUrl['port'] = $parsed['port'];
        }
        if (! empty($parsed['path']) && $parsed['path'] !== '/') {
            $pgsqlFromUrl['database'] = $sanitizeDbIdent(rawurldecode(ltrim($parsed['path'], '/')), $pgsqlFromUrl['database']);
        }
        if (isset($parsed['user'])) {
            $pgsqlFromUrl['username'] = rawurldecode($parsed['user']);
        }
        if (array_key_exists('pass', $parsed)) {
            $pgsqlFromUrl['password'] = rawurldecode((string) $parsed['pass']);
        }
        if (! empty($parsed['query'])) {
            $query = [];
            parse_str($parsed['query'], $query);
            if (! empty($query['sslmode']) && is_string($query['sslmode'])) {
                $pgsqlFromUrl['sslmode'] = $sanitizeDbIdent($query['sslmode'], $pgsqlFromUrl['sslmode']);
            }
        }
    }
}

return [

    /*
    |--------------------------------------------------------------------------
    | Default Database Connection Name
    |--------------------------------------------------------------------------
    |
    | Here you may specify which of the database connections below you wish
    | to use as your default connection for database operations. This is
    | the connection which will be utilized unless another connection
    | is explicitly specified when you execute a query / statement.
    |
    */

    'default' => env('DB_CONNECTION', 'pgsql'),

    /*
    |--------------------------------------------------------------------------
    | Database Connections
    |--------------------------------------------------------------------------
    |
    | Below are all of the database connections defined for your application.
    | An example configuration is provided for each database system which
    | is supported by Laravel. You're free to add / remove connections.
    |
    */

    'connections' => [

        'sqlite' => [
            'driver' => 'sqlite',
            'url' => $databaseUrl,
            'database' => $sanitizeDbIdent(env('DB_DATABASE'), database_path('database.sqlite')),
            'prefix' => '',
            'foreign_key_constraints' => env('DB_FOREIGN_KEYS', true),
            'busy_timeout' => null,
            'journal_mode' => null,
            'synchronous' => null,
            'transaction_mode' => 'DEFERRED',
        ],

        'mysql' => [
            'driver' => 'mysql',
            'url' => $databaseUrl,
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                (PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_SSL_CA : \PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'mariadb' => [
            'driver' => 'mariadb',
            'url' => $databaseUrl,
            'host' => env('DB_HOST', '127.0.0.1'),
            'port' => env('DB_PORT', '3306'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'unix_socket' => env('DB_SOCKET', ''),
            'charset' => env('DB_CHARSET', 'utf8mb4'),
            'collation' => env('DB_COLLATION', 'utf8mb4_unicode_ci'),
            'prefix' => '',
            'prefix_indexes' => true,
            'strict' => true,
            'engine' => null,
            'options' => extension_loaded('pdo_mysql') ? array_filter([
                (PHP_VERSION_ID >= 80500 ? \Pdo\Mysql::ATTR_SSL_CA : \PDO::MYSQL_ATTR_SSL_CA) => env('MYSQL_ATTR_SSL_CA'),
            ]) : [],
        ],

        'pgsql' => [
            'driver' => 'pgsql',
            'host' => $pgsqlFromUrl['host'],
            'port' => $pgsqlFromUrl['port'],
            'database' => $pgsqlFromUrl['database'],
            'username' => $pgsqlFromUrl['username'],
            'password' => $pgsqlFromUrl['password'],
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            'search_path' => 'public',
            'sslmode' => $pgsqlFromUrl['sslmode'],
        ],

        'sqlsrv' => [
            'driver' => 'sqlsrv',
            'url' => $databaseUrl,
            'host' => env('DB_HOST', 'localhost'),
            'port' => env('DB_PORT', '1433'),
            'database' => env('DB_DATABASE', 'laravel'),
            'username' => env('DB_USERNAME', 'root'),
            'password' => env('DB_PASSWORD', ''),
            'charset' => env('DB_CHARSET', 'utf8'),
            'prefix' => '',
            'prefix_indexes' => true,
            // 'encrypt' => env('DB_ENCRYPT', 'yes'),
            // 'trust_server_certificate' => env('DB_TRUST_SERVER_CERTIFICATE', 'false'),
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Migration Repository Table
    |--------------------------------------------------------------------------
    |
    | This table keeps track of all the migrations that have already run for
    | your application. Using this information, we can determine which of
    | the migrations on disk haven't actually been run on the database.
    |
    */

    'migrations' => [
        'table' => 'migrations',
        'update_date_on_publish' => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Redis Databases
    |--------------------------------------------------------------------------
    |
    | Redis is an open source, fast, and advanced key-value store that also
    | provides a richer body of commands than a typical key-value system
    | such as Memcached. You may define your connection settings here.
    |
    */

    'redis' => [

        'client' => env('REDIS_CLIENT', class_exists(\Redis::class) ? 'phpredis' : 'predis'),

        'options' => [
            'cluster' => env('REDIS_CLUSTER', 'redis'),
            'prefix' => env('REDIS_PREFIX', Str::slug((string) env('APP_NAME', 'laravel')).'-database-'),
            'persistent' => env('REDIS_PERSISTENT', false),
        ],

        'default' => [
            'url' => env('REDIS_URL'),
            'scheme' => env('REDIS_SCHEME', env('APP_ENV') === 'production' ? 'tls' : 'tcp'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_DB', '0'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'read_write_timeout' => env('REDIS_READ_WRITE_TIMEOUT', 2),
            'timeout' => env('REDIS_TIMEOUT', 2),
        ],

        'cache' => [
            'url' => env('REDIS_URL'),
            'scheme' => env('REDIS_SCHEME', env('APP_ENV') === 'production' ? 'tls' : 'tcp'),
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'username' => env('REDIS_USERNAME'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', '6379'),
            'database' => env('REDIS_CACHE_DB', '1'),
            'max_retries' => env('REDIS_MAX_RETRIES', 3),
            'backoff_algorithm' => env('REDIS_BACKOFF_ALGORITHM', 'decorrelated_jitter'),
            'backoff_base' => env('REDIS_BACKOFF_BASE', 100),
            'backoff_cap' => env('REDIS_BACKOFF_CAP', 1000),
            'read_write_timeout' => env('REDIS_READ_WRITE_TIMEOUT', 2),
            'timeout' => env('REDIS_TIMEOUT', 2),
        ],

    ],

];
