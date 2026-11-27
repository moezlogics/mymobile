# mymobile.pk live deploy (API → CDN → frontend)

| Site | Domain | Port | Folder | PM2 name |
|------|--------|------|--------|----------|
| API (Medusa) | api.mymobile.pk | 3122 | `/home/mymobile-api/htdocs/api.mymobile.pk` | `mymobile-api` |
| CDN | cdnlive.mymobile.pk | 3123 | `/home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk` | `mymobile-cdn` |
| Frontend (Next) | mymobile.pk | 3124 | `/home/mymobilepk/htdocs/mymobile.pk` | `mymobile` |

The ready `.env` for each site is in `deploy/live/{api,cdn,frontend}/.env`.
These files are gitignored and made by `node deploy/make-live-env.cjs`. They use
the same DB user/password, JWT/cookie secrets, CDN key and publishable key as
local. The first admin login comes from `deploy/live/admin.env`, which is also
gitignored.

---

## First deploy of the API: what happens automatically (one time only)

`backend/db/seed/mymobilepkdb.sql.gz` is a full copy of the local database
(273 products, brands, reviews, blog, pages, settings, contacts…).

On the **first** `bash pull.sh`, `deploy-backend.sh`:

1. Runs `db/bootstrap.cjs`, which creates the database from `DATABASE_URL`
   and restores the copy in one transaction. All image URLs are set to
   `https://cdnlive.mymobile.pk`, and the local test admin is deleted.
2. Creates the admin login from `MM_ADMIN_EMAIL` / `MM_ADMIN_PASSWORD`
   (admin panel: https://api.mymobile.pk/app).
3. **Deletes itself:** removes the whole `db/` folder (scripts + database
   copy) from the server and removes `MM_ADMIN_*` and `PG_ADMIN_URL` from
   `.env`. It also writes `.db-bootstrapped`.

Every later `bash pull.sh` skips all of this and never copies `db/` again.
Live data is never overwritten. (Even if run by hand, bootstrap refuses to
touch a database that already has tables.)

The only thing it cannot do by itself is create the PostgreSQL **role**
`mymobile`, because that needs the superuser. Choose one, once:

- **A.** Before the first deploy, add to the API `.env`:
  `PG_ADMIN_URL=postgres://postgres:<superuser-password>@127.0.0.1:5432/postgres`
  It is removed from `.env` automatically after the first deploy. **Or**
- **B.** Run this once as root (password = the one inside `DATABASE_URL`):
  ```bash
  sudo -u postgres psql -c "CREATE ROLE mymobile LOGIN PASSWORD '<password from DATABASE_URL>';" \
                        -c "CREATE DATABASE mymobilepkdb OWNER mymobile;"
  ```

---

## 0. Server prerequisites (once, as root)

```bash
node -v          # 20+ (same as zmobiles)
pm2 -v
rsync --version
psql --version   # PostgreSQL client, needed for the restore (13+)
```
If `psql` is missing, run `apt install postgresql-client`. If it is not on
PATH, set `PSQL_BIN=/usr/lib/postgresql/<ver>/bin/psql` in the API `.env`.

## 1. API (api.mymobile.pk)

SSH in as the site user `mymobile-api`:
```bash
cd /home/mymobile-api/htdocs/api.mymobile.pk
git clone <your GitHub repo URL> .deploy-source
nano .env                       # paste deploy/live/api/.env
cp .deploy-source/backend/pull.sh . && bash pull.sh
```
`pull.sh` runs, in order:
1. git pull
2. rsync
3. npm install
4. **one-time DB restore + admin**
5. db:migrate
6. medusa build (with admin)
7. pm2 start

The first restore takes about 1 minute.

Check:
```bash
pm2 logs mymobile-api --lines 50      # look for "[db-bootstrap] restore OK"
curl -s localhost:3122/health         # → OK
ls -a                                 # .db-bootstrapped present, no db/ folder
```
Then log in at https://api.mymobile.pk/app with the admin email.

Every later update is just `bash pull.sh`.

> If the server runs out of memory during `medusa build`, set
> `MEDUSA_DISABLE_ADMIN=true` in `.env`. The API keeps working without the admin UI.

## 2. CDN (cdnlive.mymobile.pk)

As the site user `mymobile-cdnlive`:
```bash
cd /home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk
git clone <your GitHub repo URL> .deploy-source
nano .env                       # paste deploy/live/cdn/.env
cp .deploy-source/cdn/pull.sh . && bash pull.sh
```
Copy the images once, as **root** (the same files the PHP site serves):
```bash
U=/home/mymobile-cdnlive/htdocs/cdnlive.mymobile.pk/uploads
mkdir -p $U/images $U/cache/img
rsync -a /home/mymobilepk/htdocs/mymobile.pk/images/    $U/images/
rsync -a /home/mymobilepk/htdocs/mymobile.pk/cache/img/ $U/cache/img/
chown -R mymobile-cdnlive:mymobile-cdnlive $U
```
Check: `curl -sI https://cdnlive.mymobile.pk/uploads/images/<any-file>.webp` should return 200.

## 3. Frontend (mymobile.pk). **Not yet**

The PHP site still lives in `/home/mymobilepk/htdocs/mymobile.pk`. The
Next.js frontend replaces it, so it waits until the API and CDN are verified
and the new vhost is ready. When it is time:
```bash
cd /home/mymobilepk/htdocs/mymobile.pk
git clone <your GitHub repo URL> .deploy-source
nano .env                       # paste deploy/live/frontend/.env
cp .deploy-source/frontend/pull.sh . && bash pull.sh
```
The nginx vhost will be prepared separately. It keeps `/marketplace` → 3800
and serves `/images` + `/cache/img` from the CDN uploads folder.

---

## Refreshing the database copy (only before the first live deploy)

If you change local data before going live:
```bash
cd backend && node db/export-seed.cjs     # rewrites db/seed/mymobilepkdb.sql.gz
```
Then commit and push. After the first deploy the copy is never used again.
To start over, drop the live database, delete `.db-bootstrapped` and run
`bash pull.sh`.

**Privacy:** the database copy contains contact-form leads and reviewer
emails. Keep the GitHub repository **private**. After the live deploy works,
you can also delete `backend/db/seed/` from the repo.
