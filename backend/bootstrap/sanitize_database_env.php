<?php

/**
 * Railway/dotenv often leaves a stray quote on DATABASE_URL so Postgres
 * looks for database railway" instead of railway. Run before Laravel boots.
 */
foreach (['DATABASE_URL', 'DATABASE_PRIVATE_URL', 'DB_URL', 'DB_DATABASE'] as $name) {
    $val = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);
    if (! is_string($val) || $val === '') {
        continue;
    }

    $clean = str_replace(["\r", "\n", "\t", "\0", '%22', '%27'], '', $val);
    $clean = str_replace(["\u{201C}", "\u{201D}", "\u{2018}", "\u{2019}", '"', "'"], '', $clean);
    $clean = trim($clean);
    if ($clean === $val) {
        continue;
    }

    putenv($name.'='.$clean);
    $_ENV[$name] = $clean;
    $_SERVER[$name] = $clean;
}
