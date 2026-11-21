# Try Railway Postgres (safe — keep Neon)

Backup dump (local, do not commit):
`backend/storage/backups/themanstore-neon-before-railway.dump`

## A) Get Railway public URL (for restore from your Mac)

1. Open Railway → project → click **Postgres**
2. Open **Variables** (or **Connect** / **Data**)
3. Find one of:
   - `DATABASE_PUBLIC_URL`
   - `DATABASE_URL` that looks like `*.railway.app` / `*.proxy.rlwy.net` (public host)
4. Copy the full URL (starts with `postgresql://…`)

**Internal** (`postgres.railway.internal`) = for Laravel on Railway only — **not** for `pg_restore` from your Mac.

## B) Restore dump → Railway Postgres

```bash
cd backend
/opt/homebrew/opt/postgresql@18/bin/pg_restore \
  --clean --if-exists --no-owner --no-acl \
  -d 'PASTE_RAILWAY_PUBLIC_URL_HERE' \
  storage/backups/themanstore-neon-before-railway.dump
```

Some extension/role warnings are OK if tables restore.

## C) Point Laravel at Railway Postgres

On service **The Man Store-Official** → **Variables**:

1. Save current Neon URL somewhere (Notes) for rollback  
2. Set `DATABASE_URL` = Postgres **internal** URL  
   - Easiest: **Add variable** → **Add reference** → Postgres → `DATABASE_URL`  
3. Redeploy / Restart **The Man Store-Official**

## D) Verify (Railway Console on The Man Store-Official)

```bash
php artisan migrate:status
php artisan storefront:warm
```

Then open the site / admin.

## E) Rollback

Put Neon `DATABASE_URL` back on The Man Store-Official → Redeploy. Neon data unchanged.
