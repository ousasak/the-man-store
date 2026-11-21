#!/bin/sh
set -e

# Railway Variables often wrap DATABASE_URL in quotes, so Postgres sees
# database name railway" → FATAL: database "railway"" does not exist
# Do this before PHP so Laravel env() never sees the stray quote.
strip_quotes_from_db_url() {
  _name=$1
  eval "_val=\${${_name}-}"
  if [ -z "$_val" ]; then
    return 0
  fi
  _val=$(printf '%s' "$_val" | tr -d '"' | sed 's/%22//g; s/%27//g')
  export "${_name}=${_val}"
}
strip_quotes_from_db_url DATABASE_URL
strip_quotes_from_db_url DATABASE_PRIVATE_URL
strip_quotes_from_db_url DATABASE_PUBLIC_URL
strip_quotes_from_db_url DB_URL

# Unresolved Railway template is not a real URL.
for _k in DATABASE_URL DATABASE_PRIVATE_URL DATABASE_PUBLIC_URL DB_URL; do
  eval "_v=\${${_k}-}"
  case "${_v}" in
    *'${{'*) unset "${_k}" ;;
  esac
done

if [ -z "${DATABASE_URL:-}" ] && [ -n "${DATABASE_PRIVATE_URL:-}" ]; then
  export DATABASE_URL="$DATABASE_PRIVATE_URL"
fi
if [ -z "${DATABASE_URL:-}" ] && [ -n "${DATABASE_PUBLIC_URL:-}" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
fi

cd /var/www/html

# Host-mounted composer.lock can be newer than vendor baked into the image (e.g. after git pull).
if [ -f composer.lock ]; then
  if [ ! -f vendor/composer/installed.json ] || [ composer.lock -nt vendor/composer/installed.json ]; then
    composer install --no-interaction --no-dev --optimize-autoloader --no-scripts \
      || (composer clear-cache \
        && composer install --no-interaction --no-dev --optimize-autoloader --no-scripts) \
      || (composer clear-cache \
        && composer install --no-interaction --no-dev --optimize-autoloader --no-scripts --prefer-source)
  fi
fi

# Laravel writable dirs: .dockerignore intentionally excludes runtime caches,
# so re-create them on every boot before any artisan command needs them.
mkdir -p \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/framework/testing \
  storage/logs \
  bootstrap/cache
chown -R www-data:www-data storage bootstrap/cache 2>/dev/null || true
chmod -R ug+rwx storage bootstrap/cache 2>/dev/null || true

case "$1" in
  web)
    # Render/Railway set PORT; local Docker Compose uses 8000 (see nginx default.conf).
    # Bind this port BEFORE migrate/warm — Railway healthchecks fail with
    # "service unavailable" if nginx is not listening within the retry window.
    PORT="${PORT:-8000}"
    sed -i -E "s/listen \\[::\\]:[0-9]+;/listen [::]:${PORT};/" /etc/nginx/conf.d/default.conf
    sed -i -E "s/listen [0-9]+;/listen ${PORT};/" /etc/nginx/conf.d/default.conf

    rm -rf public/storage
    php artisan storage:link --relative --force || true
    php artisan config:clear || true

    # php-fpm workers sometimes miss Railway DATABASE_URL; Laravel will read .env.
    if [ -n "${DATABASE_URL:-}" ]; then
      _esc=$(printf '%s' "$DATABASE_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')
      printf 'DATABASE_URL="%s"\nDB_CONNECTION=pgsql\n' "$_esc" > /var/www/html/.env.runtime
      if [ -f /var/www/html/.env ]; then
        grep -v -E '^(DATABASE_URL|DB_CONNECTION)=' /var/www/html/.env > /var/www/html/.env.noruntime || true
        cat /var/www/html/.env.noruntime /var/www/html/.env.runtime > /var/www/html/.env
        rm -f /var/www/html/.env.noruntime
      else
        cp /var/www/html/.env.runtime /var/www/html/.env
      fi
    fi

    php-fpm -D
    nginx -t

    # Heavy boot work after the HTTP port is open so /api/health can succeed.
    (
      if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
        php artisan migrate --force || true
      fi

      if [ "${RUN_QUEUE_WORKER:-false}" = "true" ]; then
        php artisan queue:work database --sleep=3 --tries=3 --max-time=3600 --timeout=180 \
          >> storage/logs/queue-worker.log 2>&1 &
      fi

      if [ "${RUN_SCHEDULER:-false}" = "true" ]; then
        (
          while true; do
            php artisan schedule:run --no-interaction
            sleep 60
          done
        ) >> storage/logs/scheduler.log 2>&1 &
      fi

      # KHQR has no browser poller in Telegram — check Bakong every few seconds.
      if [ "${RUN_KHQR_POLLER:-true}" = "true" ]; then
        (
          while true; do
            php artisan payments:poll-khqr --no-interaction || true
            sleep 8
          done
        ) >> storage/logs/khqr-poll.log 2>&1 &
      fi

      if [ "${QDRANT_SETUP_ON_BOOT:-false}" = "true" ]; then
        php artisan qdrant:setup >> storage/logs/qdrant-index.log 2>&1 || true
      fi

      if [ "${QDRANT_INDEX_MISSING_ON_BOOT:-false}" = "true" ]; then
        php artisan qdrant:index-products --only-missing --limit="${QDRANT_INDEX_BATCH_SIZE:-10}" \
          >> storage/logs/qdrant-index.log 2>&1 &
      fi

      if [ "${WARM_STOREFRONT_ON_BOOT:-true}" != "false" ]; then
        php artisan storefront:warm >> storage/logs/storefront-warm.log 2>&1 || true
      fi
    ) >> storage/logs/boot.log 2>&1 &

    exec nginx -g 'daemon off;'
    ;;
  worker)
    shift
    php artisan config:clear
    exec php artisan "$@"
    ;;
  artisan)
    shift
    exec php artisan "$@"
    ;;
  *)
    exec "$@"
    ;;
esac
