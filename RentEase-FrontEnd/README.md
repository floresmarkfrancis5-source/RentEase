# RentEase – React frontend

React 18 + Vite app for the **RentEase** LavaLust API (separate repo: `RentEase-BackEnd`).
It never connects to the database – every operation goes through the API with a JWT.

* **Landlord (admin):** dashboard, properties (+ Google Maps), units, tenants, leases, bills (generate, remind, PDF statement), payments (manual + receipts), maintenance, e-mail log, **Settings** (site name, colours, hero, liquid-glass look).
* **Tenant:** overview, bills with **Pay now (PayMongo)**, receipts/statement PDFs, repair requests.
* Email/password login, optional **Sign in with Google**, forced password change for temporary passwords.
* Liquid-glass design with a **light/dark toggle**; colours and text come from the admin Settings.

## Run
```bash
npm install
cp .env.example .env      # set VITE_API_URL
npm run dev               # http://localhost:5173
```
| Variable | |
|---|---|
| `VITE_API_URL` | LavaLust API URL, no trailing slash (e.g. `http://localhost:3000`) |
| `VITE_GOOGLE_CLIENT_ID` | optional – shows the Google button (same client id as the API) |
| `VITE_GOOGLE_MAPS_KEY` | optional – embeds a map in the property "Map" dialog; without it a "Open in Google Maps" link is used |

`VITE_*` values are public in the built site – never put secrets in them.

## Deploy (Render Static Site)
Build command `npm install && npm run build`, publish directory `dist`, env `VITE_API_URL=https://<your-api>.onrender.com`.
`public/_redirects` makes page refreshes on `/admin/...` work. Then put the site URL in the API's `CORS_ORIGIN` and `FRONTEND_URL`.

## Structure
```
src/
  lib/api.js          axios instance, token refresh, authenticated PDF download
  context/            Auth, Settings (CSS variables from admin settings), Theme (light/dark)
  components/         Glass, Header, DashLayout, ProtectedRoute (role guard), ui.jsx (tables, modals, forms)
  pages/              Home, Login, ChangePassword, AdminSettings, admin/*, tenant/*
```
