# RentEase – LavaLust API (BackEnd)

Rental billing system for landlords and tenants of apartments and boarding houses.
**LavaLust (PHP MVC) API → Aiven MySQL → deployed on Render.** The React app lives in the separate
`RentEase-FrontEnd` repository and only ever talks to this API.

## Features
| Module | What it does |
|---|---|
| Authentication & roles | Landlord self-registration (email/password or Google), email/username login, JWT + refresh tokens, roles `superadmin`, `admin` (landlord), and `tenant`; email password reset |
| Property management | Properties (with map coordinates), units, tenants, leases (one active lease per unit) |
| First-run setup & AI | Skippable property/unit/tenant setup wizard; optional Gemini assistant creates editable drafts that require landlord confirmation |
| Billing & payments | Monthly bills (no duplicates), overdue tracking, manual payments, **PayMongo** checkout + webhook |
| Maintenance | Tenants file repair requests, landlord updates status |
| Tenant communications | Landlord announcements, General group chat, direct tenant chats, reactions, and Cloudinary image sharing |
| Notifications & receipts | SMTP e-mails (PHPMailer), PDF receipts and statements (Dompdf), due-date reminders (cron) |
| Dashboard & reports | Collected / outstanding / overdue, occupancy, 6-month billed vs collected |
| Site settings | Each landlord has private colours, theme, tenant welcome page and sidebar logo. These settings are shared only with that landlord's tenants (`GET /api/my/settings`); public RentEase branding stays fixed. |
| Login | Email **or** username + password |

## MVC layout (LavaLust)
```
app/
  config/        routes.php, middleware.php, config.php, database.php, api.php, plus mailer/paymongo/google_auth/notifier configs
  controllers/   Controllers – thin HTTP layer, one per module (BaseApiController, AuthController, PropertyController, …)
  models/        Models – every SQL query lives here (User_model, Bill_model, Payment_model, …)
  views/         Views – e-mail template, PDF receipt/statement, API landing page
  middlewares/   Security middleware (see below)
  libraries/     Mailer, Pdf, Paymongo, Google_auth, Notifier
  migrations/    000–038 – authoritative database schema, created with `php lava migration run`
docs/            SECURITY.md, API.md
```
The React app is the "view" of the system for users; the API views render e-mails and PDFs.
In this monorepo, the root-level `database/` directory contains optional demo data and an older schema snapshot;
do not use `database/schema.sql` to initialize the current app.

### API and database conventions
Controllers inherit from `BaseApiController`, which loads LavaLust's `api` library; use `$this->api` for
request parsing, method checks, token handling, and JSON responses. Keep database access in models through
LavaLust's `$this->db` connection and query builder. Use its parameterized `raw()` method only for queries
that need SQL features the builder cannot express. Do not create a separate PDO connection or replacement API
library. The frontend's shared HTTP client only sends requests to these LavaLust routes.

## Security middleware (`app/middlewares/`, registered in `app/config/middleware.php`)
| Middleware | Applies to | Protects against |
|---|---|---|
| `security_headers` | every route | sniffing, clickjacking, caching of private data (nosniff, frame deny, CSP, HSTS, no-store) |
| `throttle` | every route | abuse – 120 requests / min / IP |
| `json_only` | every route | unexpected body types (415), oversized bodies (413 over 1 MB) |
| `throttle_auth` | login, Google, refresh | brute force – 10 / min / IP |
| `auth` | all private routes | missing/invalid/expired JWT, deactivated accounts (401) |
| `admin` / `tenant` | `/api/admin/*`, `/api/my/*` | role escalation (403) |
| `paymongo_webhook` | `/api/webhooks/paymongo` | forged webhooks – HMAC-SHA256 signature + 5-minute replay window |
| `cron` | `/api/cron/reminders` | anyone triggering reminders – `X-Cron-Token` header |
| `dev_only` | migration URLs | running migrations on a deployed server (404 in production) |

Also: bcrypt passwords, prepared statements everywhere, input validation per field, tenants can only read
their own data, the temporary password for a new tenant is shown once and must be changed at first login.
See `docs/SECURITY.md`.

## Run locally
```bash
composer install                     # dompdf + phpmailer
cp .env.example .env                 # set DB_* (create the database first, utf8mb4)
php lava jwt:generate                # fills JWT_SECRET and REFRESH_TOKEN_KEY
php lava migration run               # fresh databases require private SUPERADMIN_BOOTSTRAP_* values before migration 018
mysql -u root rentease_db < ../database/seed.sql  # optional demo data only; never use on a public deployment
php lava serve --port=3000           # http://localhost:3000/api/health
```
LavaLust loads `vendor/autoload.php` through `app/config/config.php`; integration settings are mapped from `.env` in their corresponding `app/config` files and accessed with `config_item()`.
Demo logins from `seed.sql` (**change or delete before real use**):
landlord `admin@rentease.test` / `Admin@12345`, tenant `juan@rentease.test` / `Tenant@12345`.

### First real landlord (no demo data)
```bash
php -r "echo password_hash('YourStrongPassword1', PASSWORD_BCRYPT);"
```
```sql
INSERT INTO users (username, email, password, full_name, role, is_active)
VALUES ('admin', 'you@example.com', '<paste hash>', 'Your Name', 'admin', 1);
```

## Deploy (Render + Aiven)
Follow `docs/RENTEASE_SUBMISSION_GUIDE.md` (in the package root). Environment variables are listed in
`.env.example`; **never commit `.env`** – it is git-ignored. The `Dockerfile` runs `composer install`.

### Dashboard performance diagnostics
The landlord dashboard combines its two monthly chart queries into one database round-trip. Its
authenticated response includes a `Server-Timing` header with per-query and total dashboard durations;
the header contains no SQL statements, parameter values, or landlord identifiers. Browser developer
tools show this header on the `/api/admin/dashboard` request. The query durations exclude API startup,
authentication, and database connection setup. The global throttle remains enabled and uses the file
cache; it no longer opens a database connection for routes that do not otherwise need one. Private
requests also avoid a redundant user lookup: `AuthMiddleware` performs the live role, account-status,
and tenant-landlord checks in one database query. If the `Server-Timing` response header is unavailable,
temporarily set `DASHBOARD_QUERY_TIMING=true` in Render and inspect the service logs for the same
per-query durations. Turn the setting off after collecting them.

## First superadmin
Before applying migration 018, set `SUPERADMIN_BOOTSTRAP_EMAIL`, `SUPERADMIN_BOOTSTRAP_USERNAME`,
`SUPERADMIN_BOOTSTRAP_FULL_NAME`, and a unique `SUPERADMIN_BOOTSTRAP_PASSWORD` (12+ characters) privately
in the backend `.env` when running the migrations against a fresh database. Migration 018 fails safely if these
values are missing or invalid, and creates the first account only if none exists. Remove the bootstrap password
from the environment after success. There is no public superadmin registration route. Superadmins manage landlords
at `/superadmin` and can create additional superadmins.

Password recovery links require working SMTP settings and `FRONTEND_URL`; links are single-use and expire in 30 minutes.

## Environment variables
`.env.example` documents every variable: database (+ Aiven SSL), `JWT_SECRET`, `REFRESH_TOKEN_KEY`, `CORS_ORIGIN`,
`FRONTEND_URL`, PayMongo, Google, Gemini, superadmin bootstrap, SMTP, `CRON_TOKEN`, `MIGRATION_ENABLED`. These values are loaded into
LavaLust's library-specific configs in `app/config/` (except database and framework settings, which use their existing config files).

## Updating an existing database (e.g. Aiven)
Back up the database, point the local backend `.env` at the target, enable `MIGRATION_ENABLED=true` for the CLI run,
and execute `php lava migration run`; verify with `php lava migration status`. Keep migrations disabled/unset on the
deployed web service. Migration 030 stops with the tenant ID if existing duplicate active leases would violate the
new one-current-lease rule; resolve those records before retrying. Migration 038 adds reversible property and unit
archiving without deleting related history. For a progress-check walkthrough, see `docs/PROGRESS_CHECK_GUIDE.md`.
