# RentEase – Run, deploy and submit (Laboratory Exercise No. 6 format)

Stack: **React (Vite) → LavaLust API (Render) → Aiven MySQL**

```
 Browser (React, Render Static Site)
        |  HTTPS + JWT
        v
 LavaLust API  (Render Web Service, Docker)  ──►  PayMongo / Google / SMTP
        |  MySQL over SSL
        v
 Aiven MySQL
```
The React app never talks to the database. Every operation goes through the API, and every CRUD route sits behind
the `auth` middleware (plus `admin` / `tenant` role middleware).

---
## Step 1 – Aiven MySQL
1. Aiven → **Create service → MySQL** (free plan). Wait until *Running*.
2. Copy `Host`, `Port`, `User` (avnadmin), `Password`, `Database name` (defaultdb) and download `ca.pem`.
3. *Allowed IP addresses* → `0.0.0.0/0` so Render can connect.

## Step 2 – Initialize Aiven with the current schema
Use the LavaLust migrations; they are the authoritative schema for this version (000–038). The root-level
`database/schema.sql` is an older snapshot through migration 032 and is not a valid setup path for the current app.
From the `RentEase-BackEnd` directory, temporarily point `.env` at Aiven and set:
```
DB_HOST=<aiven host>  DB_PORT=<aiven port>  DB_USER=avnadmin  DB_PASSWORD=<password>
DB_NAME=defaultdb     DB_SSL=true           DB_SSL_CA=C:/path/to/ca.pem
MIGRATION_ENABLED=true
SUPERADMIN_BOOTSTRAP_EMAIL=<your private admin email>
SUPERADMIN_BOOTSTRAP_USERNAME=<your private admin username>
SUPERADMIN_BOOTSTRAP_FULL_NAME=<your name>
SUPERADMIN_BOOTSTRAP_PASSWORD=<private 12+ character password with letters and numbers>
```
Replace every placeholder with private values; do not commit `.env`. Run `composer install`, then
`php lava migration run` and `php lava migration status`. Confirm migrations 000–038 show `APPLIED`
before deploying the API. Migration 018 intentionally stops if the bootstrap values are missing or invalid.
After the migrations succeed, remove `SUPERADMIN_BOOTSTRAP_PASSWORD` and restore your local database settings.
Render does not run migrations automatically; keep `MIGRATION_ENABLED` unset on the deployed web service.

The migration creates the initial platform superadmin. For a clean deployment, create landlord accounts through
the app after it is live. The root-level `database/seed.sql` is optional demo data only; it creates known demo
accounts and must not be run against a public deployment.

**Screenshot:** Show the Aiven tables and a query such as
`SELECT id, username, email, role FROM users ORDER BY id;` to verify the bootstrap superadmin.

## Step 3 – Two GitHub repositories
| Folder | GitHub repo |
|---|---|
| `RentEase-BackEnd/` | `RentEase-BackEnd` |
| `RentEase-FrontEnd/` | `RentEase-FrontEnd` |

```bash
cd RentEase-BackEnd
git init && git add . && git commit -m "RentEase LavaLust API"
git branch -M main
git remote add origin https://github.com/<you>/RentEase-BackEnd.git
git push -u origin main
```
(same for the FrontEnd). Before pushing run `git status` – **no `.env` and no `vendor/` must be staged**
(both are in `.gitignore`).

## Step 4 – Deploy the API on Render
1. **New + → Web Service** → the BackEnd repo → **Runtime: Docker** (or use `render.yaml`).
2. Environment variables:

| Key | Value |
|---|---|
| `APP_ENV` | `production` |
| `DB_DRIVER` / `DB_CHARSET` | `mysql` / `utf8mb4` |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | from Aiven |
| `DB_SSL` | `true` |
| `DB_SSL_CA_CONTENT` | whole contents of `ca.pem` |
| `DB_CONNECT_TIMEOUT` | `5` seconds (fail fast if Aiven cannot be reached) |
| `DASHBOARD_QUERY_TIMING` | normally `false`; temporarily set to `true` to log safe dashboard timings |
| `JWT_SECRET`, `REFRESH_TOKEN_KEY` | two different 64-character random strings (`php -r "echo bin2hex(random_bytes(32));"`) |
| `CORS_ORIGIN` | the frontend URL (after step 5) |
| `FRONTEND_URL` | the frontend URL (PayMongo return links and e-mail buttons) |
| `CRON_TOKEN` | long random string |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` | PayMongo **test** keys (step 7) |
| `GOOGLE_CLIENT_ID` | optional (step 8) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional Gemini landlord assistant; keep the key on the API server only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | optional; Render Free blocks SMTP ports 25, 465, and 587, so use a paid API service or an HTTPS email provider there |

Do **not** set `MIGRATION_ENABLED` on Render (the `dev_only` middleware also returns 404 for migration URLs in production).
3. Open `https://<api>.onrender.com/api/health` → `{"status":"ok"…}`. That URL (without `/api/health`) is the **Render API URL**.
   To check the Aiven connection too, open `https://<api>.onrender.com/api/health/ready`; it reports API/database readiness and database-check duration.
   To profile a signed-in landlord dashboard, open the browser developer tools Network panel, reload the dashboard,
   select `/api/admin/dashboard`, and inspect its `Server-Timing` response header. It reports per-query and total
   dashboard durations without SQL or parameter values; timings exclude authentication and database connection setup.
   If the header is unavailable, temporarily set `DASHBOARD_QUERY_TIMING=true` and inspect the Render service logs
   for `RentEase dashboard timings`. Turn the setting off after testing.

## Step 5 – Deploy the React app on Render
**New + → Static Site** → FrontEnd repo. Build `npm install && npm run build`, publish `dist`.
Env `VITE_API_URL=https://<api>.onrender.com` (and optionally `VITE_GOOGLE_CLIENT_ID`; no Google Maps key is required for property location picking).
Copy the site URL into the API's `CORS_ORIGIN` and `FRONTEND_URL`, then redeploy the API.

## Step 6 – Test the flow (and take the screenshots)
Register a landlord from `/register`, or create one with Google sign-in. On first login, exercise the skippable setup wizard; to test its AI draft, configure `GEMINI_API_KEY` on the API. Confirm that the AI preview is editable and that nothing is saved before the landlord confirms.
| # | Screenshot | What to show |
|---|---|---|
| 1 | Login | login page and successful landlord login |
| 2 | Landlord dashboard | stats + chart |
| 3 | Properties / Units / Tenants / Leases | list + add form (CRUD) |
| 4 | Edit and Delete | edit dialog; delete confirmation / row gone |
| 5 | Bills | generated monthly bills; PDF statement |
| 6 | Payment + receipt | manual payment recorded; receipt PDF |
| 7 | Tenant portal | tenant login, “Pay now”, PayMongo checkout |
| 8 | Maintenance | tenant request and landlord update |
| 9 | Settings | admin Settings page, then the homepage with the new name/colours, light and dark mode |
| 10 | Aiven database | tables and rows |
| 11 | Authentication proof | `https://<api>/api/admin/properties` in the browser → `{"error":"Unauthorized","status":401}` |

Suggested demo order: **Login → Dashboard → Property → Unit → Tenant → Lease → Generate bills → Tenant pays → Receipt → Maintenance → Settings → Logout.**

## Step 7 – PayMongo (online payments)
1. PayMongo dashboard (test mode) → **Developers → API keys** → copy the secret key into `PAYMONGO_SECRET_KEY`.
2. **Developers → Webhooks → Add**: URL `https://<api>.onrender.com/api/webhooks/paymongo`, event
   `checkout_session.payment.paid`. Copy the signing secret into `PAYMONGO_WEBHOOK_SECRET`.
3. As tenant: Bills → **Pay now**, pay with a PayMongo test card/e-wallet. You return to the app and the bill turns **Paid**
   (the webhook does it; if it is late, the return page asks PayMongo directly).

## Step 8 – Google sign-in (optional)
Google Cloud Console → *APIs & Services → Credentials → OAuth client ID → Web application*. Add your frontend URL and
`http://localhost:5173` as **Authorized JavaScript origins**. Use the client id as `GOOGLE_CLIENT_ID` (API) and
`VITE_GOOGLE_CLIENT_ID` (frontend). Landlords may register with Google and choose a username. A tenant can use Google only if the landlord created an account with the same e-mail.

## Step 9 – E-mail and reminders (optional)
Use any SMTP account (e.g. Gmail with an *app password*, Brevo, Mailtrap). Leave `SMTP_HOST` empty to skip sending – attempts
are then logged as “skipped” in **Notifications**. For due-date reminders create a **Render Cron Job** (daily) running:
```
curl -fsS -X POST -H "X-Cron-Token: $CRON_TOKEN" -H "Content-Type: application/json" -d '{}' https://<api>.onrender.com/api/cron/reminders
```
The same daily endpoint also activates scheduled leases on their move-in date and expires contract offers that were not accepted by that date.

## Submission checklist
- [ ] GitHub repo – LavaLust API (`RentEase-BackEnd`)
- [ ] GitHub repo – React app (`RentEase-FrontEnd`)
- [ ] Render API URL
- [ ] Frontend URL
- [ ] Screenshots (table above)
- [ ] Working demonstration
- [ ] No passwords in GitHub (only `.env.example`); environment variables used on Render
- [ ] React app does not connect to Aiven directly
- [ ] Demo passwords from `seed.sql` changed or removed

## Presentation connectivity checklist
The live demo depends on internet access from the presentation device to the frontend, LavaLust API, Aiven
database, and any third-party services used in the demo.
- [ ] Use a reliable high-speed connection; prefer wired Ethernet or a strong, tested Wi-Fi network.
- [ ] Keep a phone hotspot or other independent connection ready as a backup.
- [ ] Before presenting, open the frontend and `https://<api>.onrender.com/api/health` from the presentation network.
- [ ] Sign in and test the exact demo flow in advance. Wake the Render API shortly before the presentation to avoid a cold-start delay.
- [ ] Choose the same (or nearest available) region for the Render API and Aiven MySQL to reduce database network latency.
- [ ] Confirm any integrations you plan to demonstrate (such as PayMongo, Google sign-in, or email) are reachable and configured.

## Troubleshooting
| Symptom | Fix |
|---|---|
| Request times out after roughly 45 seconds | The frontend gives up after 45 seconds. Render Free services sleep after 15 minutes idle and can take about a minute to wake, so the first request can time out. Use an always-on API service for a demo; open `/api/health` before presenting to warm it. |
| “Cannot contact the API” immediately | check the deployed frontend's `VITE_API_URL`, Render API availability, browser network errors, and that the frontend origin is in `CORS_ORIGIN`; rebuild/redeploy the frontend after changing `VITE_API_URL`. |
| `/api/health` works but `/api/health/ready` is slow or unavailable | the API process is reachable but its Aiven connection is slow/down. Check `DB_*`, `DB_SSL=true`, `DB_SSL_CA_CONTENT`, Aiven service status/connection limits/allowed IPs, and keep Render and Aiven in nearby regions. |
| Only email-related actions are slow or email is missing | SMTP runs in a background worker, so Gmail should not stall unrelated API requests. Render Free blocks outbound SMTP ports `25`, `465`, and `587`, so Gmail SMTP cannot deliver from a Free API service even with correct credentials. Use a paid Render service for Gmail SMTP (`smtp.gmail.com`, port `465`/SSL or `587`/TLS, Gmail App Password), or integrate an email provider's HTTPS API. |
| API database error | check `DB_*`, `DB_SSL=true`, `DB_SSL_CA_CONTENT`, `DB_CONNECT_TIMEOUT`, Aiven allowed IPs |
| `Middleware config not found` | `app/config/config.php` must `require_once APP_DIR . 'config/middleware.php'` (already included) |
| Secret too short / Api disabled | `JWT_SECRET` / `REFRESH_TOKEN_KEY` missing, under 32 chars, or identical |
| `Migrations are disabled` | `MIGRATION_ENABLED=true` in your local `.env` |
| `429 Too many requests` | login limit is 10/min/IP – wait a minute |
| Payment stays “pending” | webhook URL/secret wrong; open My bills again – it re-verifies with PayMongo |
| Refreshing `/admin/...` gives 404 on Render | `public/_redirects` (`/* /index.html 200`) must be in the repo |
| PDF buttons fail | `composer install` did not run (Docker build log) – dompdf missing |
