# mymobile.pk → Next.js + Medusa (PostgreSQL) — migration runbook

The PHP site (`C:\xampp\htdocs\mymobile`, MySQL `mymobile`) is rebuilt on the
zmobiles.pk stack. **Every public URL stays identical** — the site is indexed
and ranking, so URL/SEO parity is the acceptance criterion.

## What moves where

| PHP (MySQL)                                   | New stack                                        |
|-----------------------------------------------|--------------------------------------------------|
| `devices` (+ `device_spec_values`, variants)  | Medusa products · `metadata.specs` · PKR variants |
| `spec_templates`                              | `spec_template` (same keys/groups)               |
| `brands`                                      | `brand` module (+ `brand_product` links)         |
| `device_categories`                           | product categories (top-level, `/category/x/`)   |
| `device_reviews` (+ replies)                  | `advanced_review` (`owner_reply`, `metadata.replies`) |
| `posts`, `categories`, `tags`, `post_tags`    | `blog_post`, `blog_category`, `blog_tag`         |
| `comments`                                    | `blog_comment`                                   |
| `admin_users` (authors)                       | `blog_author`                                    |
| `pages` + about/contact in `settings`         | `cms_page`                                       |
| `settings`, menus, `home_sections`            | `site_setting` keys                              |
| `contact_queries`                             | `contact_lead`                                   |
| `images/` (948 media × sizes) + `cache/img/`  | CDN `uploads/images/` + `uploads/cache/img/` (same filenames) |

Exact rendered `<title>` / meta description of every legacy page is captured
in `seo/baseline-php.json` and written into the new data, so titles match 1:1.

## URL contract (all verified by `tools/seo-diff.mjs`)

| URL                                   | Behaviour                                  |
|---------------------------------------|--------------------------------------------|
| `/products/{slug}/`                   | device page (canonical)                    |
| `/device/{slug}/`, `/{brand}/{slug}/`, `/{slug}/` | 301/308 → `/products/{slug}/`  |
| `/{brand}/`, `/brands/`               | brand archive / index                      |
| `/category/{slug}/`                   | device category                            |
| `/blog/`, `/blog/{cat}/{post}/`       | blog index / post (canonical)              |
| `/blog/{post}/`, `/{post}/`, `/single.php?id=N` | → `/blog/{cat}/{post}/`          |
| `/blog/category/{x}/`, `/blog/tag/{x}/`, `/blog/author/{x}/` | archives            |
| `/{blog-cat}/`, `/tag/{x}/`, `/author/{x}/` | → canonical archive                  |
| `/about-us/`, `/contact-us/`, `/privacy-policy/`, `/terms-conditions/`, `/disclaimer/` | CMS pages |
| `/mobiles/`, `/products/`, `/index.php` | 301 → `/` (as PHP)                       |
| `/images/*`, `/cache/img/*`           | 200, same files (nginx alias to CDN dir)   |
| `/thumb.php?src=…`                    | 301 → original image                       |
| `/sitemap.xml`, `/robots.txt`, `/llms.txt`, `/ads.txt` | same content/rules          |
| `/api/device/{slug}/`, `/api/compare/?d=` | same JSON contract                     |
| `/marketplace/*`                      | proxied to classifieds (unchanged)         |

## Frontend: PHP look, Next/Medusa engine

The public pages keep the **PHP mymobile.pk design 1:1**. Only the cart,
checkout and account pages use zmobile's storefront UI.

| Where | What |
|-------|------|
| `frontend/public/mm/` | PHP CSS served unchanged: `bundle.min.css` (purged Tailwind v4), `site.css` (all PHP inline/critical styles), `single.css` (blog post), `shop.css` (cart badge, search overlay, buy box). Also PHP `compare.js` and `ads.js` (endpoints point to `/api/mm/*`). |
| `app/layout.tsx` | Loads only `/mm/*.css` (no `globals.css`), the theme colours from `legacy_settings_json`, compare.js and AdSense. |
| `(main)/layout.tsx` | `MmHeader` + `MmFooter` (ports of `header.php` / `footer.php`, menus from `menu_main_json` / `menu_footer_json`). |
| `(main)/(shop)/` and `(checkout)/` | account, cart, order, store, collections, checkout. **Only these** import zmobile `globals.css` and the Phosphor icons. |
| `modules/mm/templates/` | Ports of index.php, device.php, the brand/category archives, the blog index/archives, single.php and 404. |
| `modules/mm/lib/` | Server-side ports of the PHP helpers. `devices.ts` is the in-memory catalog with PHP sort orders and spec facets. `listing.ts` is the devices.php filter engine. The other files cover specs, related devices, blog, compare and the thumbnail manifest. |
| `modules/mm/components/` | DeviceCard, BuyBox (Add to Cart / Buy Now → Medusa cart), `LegacyScript` and `OnClick` (run the PHP inline JS unchanged), and the AdSense slot. |
| `modules/cms/cms-page-view.tsx` | page.php / about.php / contact.php. |
| `app/api/mm/*` | JSON/HTML endpoints the PHP scripts expected: search, listing (load more), home sections, compare modal, review, comment, contact, cart-count. |
| `middleware.ts` | Filtered/search listings (`?q=`, `?min_price=`, `brand[]`, `spec[x][]`, `sort`, `page`…) are rewritten to `/pk/mm-listing/?__path=…` and sent with `X-Robots-Tag: noindex`, as PHP did. `*.php?slug=` and `thumb.php` redirect here. |
| backend `store/legacy/resolve` | Mirrors PHP `router.php` (brand / category / device / post / page / redirect). |
| backend `store/mm-reviews`, `blog/posts/*/comments` | Review and comment APIs with honeypot, rate limit and approval rules from the legacy settings. |

Product `metadata` carries everything the PHP pages read: `specs`, `price*`,
`variants_legacy`, `pros`/`cons`, `ai_score_json`, `views*`, `rating_*`,
`meta_title`/`meta_description`, and `image_alts` (url → alt) plus `image_alt`
from the PHP media library.

**Not ported (intentional):** the live view counter (views stay at the
migrated values) and zmobile's chat/WhatsApp/push widgets. **Not needed
locally:** Meilisearch (loads only when `MEILISEARCH_API_KEY` is set). The
`/marketplace/*` classifieds proxy returns 404 locally.

## Local dev (this machine)

- Postgres 16 portable: `D:\ecomm\_infra` (port 5442) — start:
  `D:\ecomm\_infra\pgsql\bin\pg_ctl.exe -D D:\ecomm\_infra\pgdata -l D:\ecomm\_infra\pgdata\server.log start`
- Ports: frontend 3100 · cdn 3101 · backend 3102
- Fresh DB: `npx medusa db:migrate` then `npx medusa exec ./src/scripts/migrate-mymobile.ts`
  (the script is idempotent; re-running it refreshes `image_alts` on existing products)
- Admin: `http://localhost:3102/app`. The local test login is in `D:\ecomm\_infra\admin-login.txt`.
- The launch configs (`mm-cdn`, `mm-backend`, `mm-frontend`, `mm-frontend-prod`) are in
  `C:\xampp\htdocs\mymobile\.claude\launch.json`.
- Last local check: `next build` OK. In the SEO diff, all 345 URLs return 200 and
  status, canonical, title, h1, robots and JSON-LD show 0 differences. The 3 CMS
  descriptions differ only by `&nbsp;` → space.

## Production cutover

> Current plan: **`deploy/LIVE-DEPLOY.md`**. On the first start the API creates
> the database and restores `backend/db/seed/mymobilepkdb.sql.gz` (full local
> copy) by itself, so steps 4 to 6 below are replaced by that.

1. **Server prep** — create sites `api.mymobile.pk`, `cdn.mymobile.pk` (CloudPanel),
   PostgreSQL DB `mymobilepkdb`, Redis db 3, Meilisearch. Env files from
   `deploy/env.production.example` (fresh secrets).
2. **Code** — deploy backend, cdn, frontend (same scripts as zmobiles: `npm ci`,
   `medusa build`, `next build`, PM2).
3. **Media** — copy PHP `images/` → `$CDN_UPLOADS/images/` and `cache/img/` →
   `$CDN_UPLOADS/cache/img/` (rsync, keep filenames).
4. **Schema** — `npx medusa db:migrate` (fresh DB).
5. **Freeze PHP admin** (no edits during the import), dump/attach live MySQL.
6. **Import** — `LEGACY_IMAGE_BASE=https://cdn.mymobile.pk/uploads npx medusa exec ./src/scripts/migrate-mymobile.ts`
   → put printed publishable key + sales channel in `frontend/.env`, rebuild frontend.
7. **Verify on a staging hostname** (e.g. `new.mymobile.pk` via hosts file):
   ```
   node tools/seo-snapshot.mjs --base https://mymobile.pk --out seo/baseline-live.json
   node tools/seo-snapshot.mjs --base https://new.mymobile.pk --urls seo/baseline-live.json --out seo/new.json
   node tools/seo-diff.mjs seo/baseline-live.json seo/new.json --out seo/diff.md
   ```
   Zero status blockers required.
8. **Switch** — replace the PHP vhost with `deploy/nginx-mymobile.pk.conf`,
   keep the PHP site on `old.mymobile.pk` (noindex) for rollback, purge Cloudflare.
9. **After launch** — resubmit `/sitemap.xml` in Search Console, watch
   Coverage / 404s daily for 2 weeks, compare top queries week over week.

Rollback = restore the PHP vhost (DNS/data untouched).
