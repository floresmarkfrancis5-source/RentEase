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

## Step 2 – Create the tables in Aiven (pick ONE)
**A. Migrations from your PC (recommended).** In the BackEnd `.env` temporarily set
```
DB_HOST=<aiven host>  DB_PORT=<aiven port>  DB_USER=avnadmin  DB_PASSWORD=<password>
DB_NAME=defaultdb     DB_SSL=true           DB_SSL_CA=C:/path/to/ca.pem
MIGRATION_ENABLED=true
```
then `composer install` and `php lava migration run`. Restore `.env` to your local DB afterwards.

**B. Manual SQL:** run `database/schema.sql` in Aiven's query tool / Workbench / DBeaver.

**First landlord account:** run `database/seed.sql` for demo data (landlord `admin@rentease.test` / `Admin@12345`,
tenant `juan@rentease.test` / `Tenant@12345`) – **log in and change those passwords, or delete the demo users**.
For a clean start insert your own admin (see the BackEnd README, “First real admin”).

📸 **Screenshot:** Aiven showing the tables (`users, properties, units, leases, bills, payments, maintenance_requests,
notifications_log, site_settings…`) and `SELECT * FROM users;` from `database/useful_queries.sql`.

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
| `JWT_SECRET`, `REFRESH_TOKEN_KEY` | two different 64-character random strings (`php -r "echo bin2hex(random_bytes(32));"`) |
| `CORS_ORIGIN` | the frontend URL (after step 5) |
| `FRONTEND_URL` | the frontend URL (PayMongo return links and e-mail buttons) |
| `CRON_TOKEN` | long random string |
| `PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET` | PayMongo **test** keys (step 7) |
| `GOOGLE_CLIENT_ID` | optional (step 8) |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | optional Gemini landlord assistant; keep the key on the API server only |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM` | optional (step 9) |

Do **not** set `MIGRATION_ENABLED` on Render (the `dev_only` middleware also returns 404 for migration URLs in production).
3. Open `https://<api>.onrender.com/api/health` → `{"status":"ok"…}`. That URL (without `/api/health`) is the **Render API URL**.

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

## Troubleshooting
| Symptom | Fix |
|---|---|
| “Cannot reach the server” | wrong `VITE_API_URL`, API asleep (free Render ~50 s), or frontend URL missing in `CORS_ORIGIN` |
| API database error | check `DB_*`, `DB_SSL=true`, `DB_SSL_CA_CONTENT`, Aiven allowed IPs |
| `Middleware config not found` | `app/config/config.php` must `require_once APP_DIR . 'config/middleware.php'` (already included) |
| Secret too short / Api disabled | `JWT_SECRET` / `REFRESH_TOKEN_KEY` missing, under 32 chars, or identical |
| `Migrations are disabled` | `MIGRATION_ENABLED=true` in your local `.env` |
| `429 Too many requests` | login limit is 10/min/IP – wait a minute |
| Payment stays “pending” | webhook URL/secret wrong; open My bills again – it re-verifies with PayMongo |
| Refreshing `/admin/...` gives 404 on Render | `public/_redirects` (`/* /index.html 200`) must be in the repo |
| PDF buttons fail | `composer install` did not run (Docker build log) – dompdf missing |
