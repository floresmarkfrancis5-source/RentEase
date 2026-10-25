# RentEase – security notes

## Lab 6 rules and how they are met
| Rule | How |
|---|---|
| No database passwords in GitHub | `.env` is git-ignored; only `.env.example` (no secrets) is committed |
| Use environment variables for credentials | DB, JWT, PayMongo, Google, SMTP and cron secrets are read with `getenv()` |
| React must not connect to Aiven directly | The frontend only knows `VITE_API_URL`; there is no database code in it |
| All DB operations go through the API | Every query lives in `app/models` and is called from a controller |
| CRUD protected by authentication | `auth` middleware on every private route; `admin`/`tenant` role middleware on top |

## Request pipeline
```
request → security_headers → throttle → json_only → [route middleware: throttle_auth | auth → admin|tenant | paymongo_webhook | cron | dev_only] → controller → model → MySQL
```
Middleware that denies a request sends the JSON error itself and stops the pipeline; the controller never runs.

## Authentication
* `POST /api/auth/login` – bcrypt verify, same error for unknown e-mail and wrong password.
* Access token (short) + refresh token (stored hashed, rotated, revoked on logout / password change).
* `auth` re-reads the account from the database on each request, so a deactivated user is locked out immediately.
* Google sign-in verifies the ID token with Google, checks the audience (our client id) and `email_verified`,
  and only logs in an account the landlord already created (no self-registration).

## Payments
* The checkout amount is calculated on the server from the bill – the client never sends an amount.
* The webhook must carry a valid `Paymongo-Signature` (HMAC-SHA256 of `timestamp.rawbody`, compared in constant
  time, timestamp within 300 s). The paid amount must equal the billed amount.
* Settling a payment is idempotent: a duplicated or late webhook, or the tenant's "verify" call, cannot create a
  second receipt or double-pay a bill.

## Data rules
* One bill per lease per month (unique key); one active lease per unit (generated column + unique key).
* Tenants can read only their own bills, payments, receipts, statements and requests.
* Responses are `Cache-Control: no-store`.

## Image uploads (logo / hero / login picture)
- Admin only, CSRF-free JSON API behind the JWT + role middleware; body limit 4 MB on that one route (1 MB elsewhere).
- Only PNG, JPEG and WebP. The server decodes the real bytes (`getimagesizefromstring`), requires the declared type to match, caps size (400 KB logo, 2.5 MB others) and dimensions (6000 px). SVG is refused (script risk).
- Stored in the `site_assets` table (not on disk, because Render's disk is ephemeral) and served with the right `Content-Type`.
- Image links typed by hand must be `http(s)://` or one of our own `/api/assets/...` paths.

## Known limits (be honest in your report)
* The rate limiter is per server instance (file based) – fine for a single Render instance.
* PayMongo, Google and SMTP were exercised against local mock servers, not the live services; test them once with
  your own test keys after deployment.
