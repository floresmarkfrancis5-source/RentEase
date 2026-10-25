# RentEase Progress Check Guide

Use a local database and the seeded demo accounts for the assessment. Do not demonstrate against a live tenant database or expose `.env`, tokens, or temporary passwords in screenshots.

## Start the application

1. In `RentEase-BackEnd`, install Composer dependencies, copy `.env.example` to `.env`, configure a local MySQL database and generate the JWT secrets:

   ```powershell
   composer install
   Copy-Item .env.example .env
   php lava jwt:generate
   php lava migration run
   Get-Content database/seed.sql | mysql -u root rentease_db
   php lava serve --port=3000
   ```

2. In `RentEase-FrontEnd`, install npm dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

3. Open the Vite URL printed in the terminal. Confirm the API responds at `http://localhost:3000/api/health`.

Demo accounts from `database/seed.sql`:

- Landlord: `admin@rentease.test` / `Admin@12345`
- Tenant: `juan@rentease.test` / `Tenant@12345`

Change these credentials for any environment that is accessible outside a local demonstration.
To demonstrate landlord self-registration and onboarding, register a separate test landlord rather than using the seeded account. To demonstrate platform administration, apply migration 018 with private bootstrap superadmin settings and log in to `/superadmin`. For email recovery, configure SMTP and test the emailed one-time reset link. Google OAuth is deferred: Login and Register currently show a disabled “Coming soon” placeholder, so do not present Google sign-in as a working feature. To demonstrate the AI assistant, configure `GEMINI_API_KEY` in the BackEnd `.env`; manual setup works without it.

## Demonstration sequence

### Frontend and LavaLust API integration

1. Sign in as the landlord and show the dashboard, property, unit, tenant, lease, billing, maintenance, transfer-request, and notification views.
   - Show `/register` and create a test landlord account. Landlords use the existing `admin` role; the separate `superadmin` role manages platform accounts.
   - Show `/superadmin`: landlord listing/status controls, a landlord password-reset email, and the protected create-superadmin form.
   - Show the disabled Google buttons as a planned enhancement; complete email/password login and registration instead.
   - Show the first-run setup wizard, add a property and units, and optionally assign tenants and leases. Also demonstrate that the wizard can be skipped.
   - If Gemini is configured, ask the assistant for a setup draft, edit the preview, then confirm it. Show that a draft is not written until confirmation.
2. Add or edit a property. Demonstrate the map pin, address search, city/barangay selectors, and the manual-entry fallback. Confirm the saved map link opens at the selected coordinates.
3. Add a vacant unit and show occupancy and condition as distinct values. Change the condition while occupied to demonstrate that condition is independent from occupancy.
4. Add a tenant while assigning a vacant unit in good condition. Show the created lease and the tenant's first-login password-change requirement. In Leases, search/filter records, inspect a lease's history, edit its active terms, renew it while keeping its lease/bill history, print the draft agreement, and upload/download a private PDF.
5. Generate a bill for a month with an active lease. Show that regenerating the same month does not create a duplicate bill.
6. Sign out and sign in as the tenant. Demonstrate the bill/payment view, maintenance request, in-app notifications, and transfer request. Sign in as the landlord again to review and decide the maintenance and transfer requests.

Use records created specifically for the demonstration. Avoid completing a real PayMongo checkout; use the documented local/test integration setup if payment-provider behavior must be shown.

### Database and Query Builder

- Show `RentEase-BackEnd/database/schema.sql` and the migrations, including 014–019, for the database structure and incremental schema changes. Migration 017 adds landlord ownership for tenant accounts/onboarding state; migration 018 adds superadmin access and password-reset tokens; migration 019 adds lease history and private PDF documents.
- Explain that rental records are isolated by landlord: tenants are linked to their landlord, and admin list/detail endpoints scope properties, units, leases, bills, payments, maintenance, and transfer requests to the signed-in landlord.
- In `app/models/User_model.php`, `app/models/Unit_model.php`, `app/models/Lease_model.php`, `app/models/Bill_model.php`, `app/models/Inapp_notification_model.php`, and `app/models/Site_setting_model.php`, point out LavaLust Query Builder reads (`table`, `select`, `where`, `limit`, `get`, `get_all`, `count`) and writes (`insert`, `update`, `delete`).
- Explain that parameterized raw SQL is retained for joined reporting/list queries, aggregate queries, row locking, and MySQL-specific transaction or idempotency operations where the builder would obscure or fail to express the required semantics. These statements still use bound parameters where values are supplied.
- Show representative create/read/update/delete flows in the landlord interface and the corresponding endpoints in `app/config/routes.php`. Payments intentionally have no edit/delete operation so a settled financial record cannot be silently rewritten.

### Framework, libraries, and configuration

- Show that LavaLust routes dispatch to controllers, controllers validate input and enforce role middleware, and models own persistence logic.
- Show `app/config/config.php` for Composer autoload and `app/config/autoload.php` plus the library-specific config files for integration configuration.
- Show `composer.json` for PHPMailer and Dompdf, and demonstrate a generated receipt or statement if time permits.
- Show the frontend API client in `RentEase-FrontEnd/src/lib/api.js` and the role-protected routes/components that consume the API.

## Before presenting

Run the checks from their respective project folders:

```powershell
# RentEase-FrontEnd
npm run build

# RentEase-BackEnd
Get-ChildItem app -Recurse -Filter *.php | ForEach-Object { php -l $_.FullName }
```

The frontend currently defines a production build script but no automated test script. For the presentation, prepare screenshots of the main CRUD, signup/onboarding, and role-specific flows, and be ready to show the relevant database rows and API responses without revealing credentials. Never include tenant temporary passwords or Gemini credentials in screenshots.
