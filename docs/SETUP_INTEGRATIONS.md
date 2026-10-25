# Making Payment, PDF, Reminders, Map and Google sign-in work

All of this goes in the BackEnd `.env` (never commit it) except the map, which is a FrontEnd setting.
After changing `.env`, **stop and start the BackEnd server** so it re-reads the file.

---
## 0. Landlord signup, onboarding and AI assistant

Landlords can create their own account from the frontend registration page. Landlords keep the existing `admin` role and manage their own tenants; the separate `superadmin` role handles platform-wide landlord accounts. On first sign-in, the optional setup wizard can add a property, units, and existing tenants/leases together, or be skipped in favor of the regular pages.

To enable the optional rental setup assistant, set `GEMINI_API_KEY` on the BackEnd server (the default model is `gemini-3.5-flash-lite`; override it with `GEMINI_MODEL` if needed). Never put this key in a `VITE_*` variable or frontend code. The assistant sends the chat text to Gemini and returns a draft; the landlord reviews and explicitly confirms before the API writes anything. A missing key produces an explicit “not configured” response while all manual setup remains available.

Before deploying landlord registration, apply migration 017 using the normal migration runner and take a database backup. It adds tenant-to-landlord ownership and onboarding state; existing tenants are associated using their latest active lease, then their most recent lease history, with a fallback to the oldest existing landlord for legacy accounts without lease history.

### First superadmin and password recovery

Migration 018 creates the `superadmin` role, password-reset token table, and initial superadmin account. Before running it, set these values privately in the backend `.env` or deployment environment. Do not commit them or share the password:

```
SUPERADMIN_BOOTSTRAP_EMAIL=your-admin-email@example.com
SUPERADMIN_BOOTSTRAP_USERNAME=your-superadmin-username
SUPERADMIN_BOOTSTRAP_FULL_NAME=Your Name
SUPERADMIN_BOOTSTRAP_PASSWORD=a-unique-strong-password-at-least-12-characters
```

Back up the database, then run `php lava migration run`. Migration 018 validates the bootstrap settings before altering the schema, and creates the first superadmin only if none exists. After it succeeds, remove `SUPERADMIN_BOOTSTRAP_PASSWORD` from the environment. A superadmin can manage landlord accounts, send reset links, and create other superadmins from `/superadmin`; there is no public superadmin signup.

Email reset links require working SMTP configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `MAIL_FROM`) and `FRONTEND_URL`. Links expire after 30 minutes and are single-use.

---
## 1. Online payment with NO real money (PayMongo TEST mode)

1. Create a free account at paymongo.com and open the **Dashboard**. Keep the switch on **Test mode** (top of the dashboard).
2. Developers → **API Keys** → copy the **Secret key**. It starts with `sk_test_`.
3. BackEnd `.env`:
   ```
   PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
   PAYMONGO_METHODS=card,gcash,paymaya
   FRONTEND_URL=http://localhost:5173
   ```
   `FRONTEND_URL` must match the address of your React app (PayMongo sends the tenant back there).
4. **Safety lock:** the API refuses any `sk_live_` key unless you also write `PAYMONGO_ALLOW_LIVE=true`. Never set that for the school project, so real money cannot be charged by accident.
5. Try it: log in as a tenant → **My bills** → **Pay now** → you land on PayMongo's checkout page (it shows a *test mode* notice).
   - **Card:** `4343 4343 4343 4345`, any future expiry date, any 3-digit CVC.
   - **GCash / Maya:** choose it, then press the *success* option on PayMongo's simulated page. No account or money is involved.
6. After paying you are sent back to RentEase, the bill turns **Paid**, and a receipt PDF becomes available.

**Webhook (only after you deploy; not needed on localhost).** A webhook lets PayMongo tell your server a payment succeeded even if the tenant closes the tab. Localhost is not reachable from the internet, so locally the app confirms the payment when the tenant returns to the site instead, and that works fine.
After deploying the API on Render: PayMongo Dashboard → Developers → **Webhooks** → add
`https://YOUR-API.onrender.com/api/webhooks/paymongo`, event `checkout_session.payment.paid`, then copy the `whsec_...` secret into `PAYMONGO_WEBHOOK_SECRET`.

Note: "Test mode" amounts are fake. Only your **sk_test_** key is ever used, and no card or e-wallet is really charged.

---
## 2. PDF receipts and statements

PDFs are made by the **Dompdf** library. They only need the BackEnd's `vendor` folder:
```
cd BackEnd
composer install
```
Needs PHP extensions `gd`, `mbstring`, `curl` (all on by default in XAMPP; in `php.ini` make sure `extension=gd` has no `;` in front).
- Landlord: **Bills** → statement PDF, **Payments** → receipt PDF.
- Tenant: **My bills** → statement / receipt.
If the download button says "failed", run `composer install` again and check the `runtime` folder is writable.

---
## 3. Email reminders and receipts

The app sends mail through any SMTP server. Easiest options:

**A. Gmail (real emails to your own inbox).** Turn on 2-Step Verification on your Google account, then create an **App password** (Google Account → Security → App passwords). Use it, not your normal password:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=tls
SMTP_USER=yourname@gmail.com
SMTP_PASS=the-16-letter-app-password
MAIL_FROM=yourname@gmail.com
MAIL_FROM_NAME=RentEase
```
**B. Mailtrap (fake inbox, nothing is really sent).** Make a free Mailtrap account and copy the SMTP host, port, username and password it shows into the same variables.

With `SMTP_HOST` empty the app does not crash. It records the email as *skipped* in **Notifications**, which is handy for showing the log to your professor.

Try it: landlord → **Bills** → on an unpaid bill press **Send reminder**. Then open **Notifications** to see sent / skipped / failed.

### Automatic reminders (cron)
`POST /api/cron/reminders` sends reminders for bills that are due soon or overdue. It needs a secret header so strangers cannot trigger it.
1. In `.env` set `CRON_TOKEN=` to a long random text.
2. Test by hand (PowerShell shown; replace the token):
   ```
   curl.exe -X POST http://localhost:3000/api/cron/reminders -H "X-Cron-Token: YOUR_TOKEN"
   ```
   Running it twice does not send duplicates.
3. On Render, add a **Cron Job** that runs the same request once a day.

---
## 4. Property map

The property form uses **Leaflet** and free **OpenStreetMap** tiles; no map key or `.env` setting is required. Search an address/place, use the browser's current location, or tap/drag the map pin. The pin supplies latitude and longitude automatically. City/municipality and barangay lists come from the PSGC API and are cached in the browser; each field also supports manual text entry when the official list has no match.

Address search and pin reverse-geocoding use **Nominatim**. Requests are serialized at a minimum interval of 1.1 seconds, and the map displays OpenStreetMap attribution. Keep this low-volume interactive use; do not bulk-geocode or build a large-scale geocoding service on the public Nominatim endpoint. If address search is unavailable, the map pin and manual city/barangay fields remain usable.

The Properties table's **Map** action remains a Google Maps view/open-in-Google-Maps link using the saved coordinates when available. `VITE_GOOGLE_MAPS_KEY` is not needed for property location picking.

---
## 5. Google sign-in (optional)
Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (Web application). Add `http://localhost:5173` and your deployed frontend origin under **Authorized JavaScript origins**. Configure the OAuth consent screen for the intended users.

Set the same client ID in both places:

- BackEnd `.env`: `GOOGLE_CLIENT_ID=...`
- FrontEnd `.env`: `VITE_GOOGLE_CLIENT_ID=...`

Google OAuth setup is deferred. The Login and Register pages currently display disabled “Coming soon” buttons, so OAuth sign-in and Google registration are not available to users yet. When this feature is enabled, configure the OAuth web client ID as shown above; never put a client secret in frontend code. The first superadmin is created by migration 018, not public signup.

---
## Quick check list for the demo
| Feature | How to show it works |
|---|---|
| Payment | Tenant pays with test card `4343 4343 4343 4345` → bill becomes Paid |
| PDF | Download the receipt and the statement |
| Reminder | Bills → Send reminder → entry appears in Notifications |
| Cron | Run the curl command → Notifications shows the batch |
| Location | Properties → Add property → search/place a pin; city and barangay can be selected or typed |
| Map | Properties → Map or Open in Google Maps |
