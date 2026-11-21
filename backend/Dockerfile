# Neon is Postgres 18; stage matching pg_dump + libpq (path differs by arch).
# Multi-stage avoids BuildKit bind mounts (Railway image builds reject those).
FROM postgres:18-bookworm AS pg18-tools
RUN mkdir -p /out/bin /out/lib \
    && cp /usr/lib/postgresql/18/bin/pg_dump /usr/lib/postgresql/18/bin/pg_restore /out/bin/ \
    && (cp -a /usr/lib/x86_64-linux-gnu/libpq.so.5* /out/lib/ \
        || cp -a /usr/lib/aarch64-linux-gnu/libpq.so.5* /out/lib/) \
    && chmod +x /out/bin/pg_dump /out/bin/pg_restore \
    && test -e /out/lib/libpq.so.5

FROM php:8.2-fpm-bookworm

# Keep Debian libpq-dev for PHP — do NOT add PGDG apt (breaks libldap / libpq resolution).
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        git unzip nginx openssl \
        libpq-dev libzip-dev libpng-dev libjpeg62-turbo-dev libwebp-dev libavif-dev \
    && docker-php-ext-configure gd --with-jpeg --with-webp --with-avif \
    && docker-php-ext-install pdo_pgsql zip gd \
    && rm -f /etc/nginx/sites-enabled/default \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/pg18/bin /opt/pg18/lib
COPY --from=pg18-tools /out/bin/ /opt/pg18/bin/
COPY --from=pg18-tools /out/lib/ /opt/pg18/lib/

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

WORKDIR /var/www/html

# Install PHP deps before copying the full tree (better layer cache).
COPY composer.json composer.lock ./

# GitHub codeload occasionally returns HTTP 400 on Render — retry, then prefer-source.
RUN set -eux; \
    composer install --no-interaction --no-dev --optimize-autoloader --no-scripts \
    || (composer clear-cache \
        && composer install --no-interaction --no-dev --optimize-autoloader --no-scripts) \
    || (composer clear-cache \
        && composer install --no-interaction --no-dev --optimize-autoloader --no-scripts --prefer-source)

COPY . .

RUN composer dump-autoload --optimize \
    && php artisan package:discover --ansi

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY docker/php-fpm/zz-custom.conf /usr/local/etc/php-fpm.d/zz-custom.conf
COPY docker/entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true

EXPOSE 8000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["web"]
