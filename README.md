# RentEase – LavaLust Laboratory Package (Lab 6 format)

Rental billing system: **React (Vite) + LavaLust API + Aiven MySQL, deployed on Render.**

| Folder | What it is |
|---|---|
| `RentEase-BackEnd/` | LavaLust project (the API, MVC + security middleware). Push as its own GitHub repo. |
| `RentEase-FrontEnd/` | React (Vite) app – landlord and tenant portals, liquid-glass UI, light/dark mode. Own GitHub repo. |
| `database/` | `schema.sql`, `seed.sql` (demo data), `useful_queries.sql` (also inside the BackEnd repo) |
| `docs/` | `RENTEASE_SUBMISSION_GUIDE.md` (Aiven → GitHub → Render → PayMongo → screenshots), plus `SECURITY.md` and `API.md` |

## Fastest way to see it working
```bash
# 1. API
cd RentEase-BackEnd
composer install
cp .env.example .env            # edit DB_* (create the database first)
php lava jwt:generate
php lava migration run
mysql -u root rentease_db < database/seed.sql     # optional demo data
php lava serve --port=3000

# 2. Frontend (new terminal)
cd RentEase-FrontEnd
npm install
cp .env.example .env
npm run dev                     # http://localhost:5173
```
Demo logins (seed.sql): landlord `admin@rentease.test` / `Admin@12345`, tenant `juan@rentease.test` / `Tenant@12345`.
**Change or delete them before real use.**


## Setting up payment, PDF, reminders and map
See `docs/SETUP_INTEGRATIONS.md` (PayMongo **test mode** only - no real money, email reminders, cron, map, Google sign-in).
