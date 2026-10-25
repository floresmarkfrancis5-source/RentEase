# RentEase API reference
Base URL: `https://<your-api>.onrender.com`. JSON in, JSON out. Private routes need `Authorization: Bearer <access_token>`.

## Public
| Method | Route | |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/settings` | site name, colours, hero text, theme defaults, logo/hero/login image links |
| GET | `/api/assets/{logo\|hero\|login}` | the uploaded image (public, ETag + long cache) |
| POST | `/api/auth/login` · `/api/auth/google` · `/api/auth/refresh` | `{email,password}` · `{credential}` · `{refresh_token}` (10/min/IP) |
| POST | `/api/auth/register` | `{username,email,full_name,password}`; creates a landlord account |
| POST | `/api/auth/google/register` | `{credential,username}`; creates a landlord account using Google |
| POST | `/api/auth/password/forgot` | `{email}`; sends a short-lived reset link without revealing whether an account exists |
| POST | `/api/auth/password/reset` | `{token,password}`; consumes a single-use reset token and revokes refresh sessions |
| POST | `/api/webhooks/paymongo` | signed by PayMongo |
| POST | `/api/cron/reminders` | header `X-Cron-Token` |

## Any signed-in user
`POST /api/auth/logout` · `GET /api/auth/me` · `POST /api/auth/change-password` ·
`GET /api/bills/{id}/statement` (PDF) · `GET /api/payments/{id}/receipt` (PDF) – owner or landlord only.

## Landlord – prefix `/api/admin` (role `admin`)
| Resource | Routes |
|---|---|
| dashboard | `GET dashboard`, `GET notifications` |
| onboarding | `GET onboarding`, `POST onboarding`, `POST onboarding/skip` |
| AI assistant | `POST assistant/chat {message,history}` (Gemini proposes a draft; does not persist rental records) |
| profile (any logged-in user) | `GET/PUT /api/profile`, `GET/PUT/DELETE /api/profile/photo` |
| settings | `PUT settings`, `POST settings/reset`, `GET settings/history`, `PUT settings/image` (body `{key, image: dataURL}`), `DELETE settings/image/{key}` |
| properties | `GET/POST properties`, `GET/PUT/DELETE properties/{id}`; property bodies accept `barangay` (plain text, max 100 characters) as well as `city`, `latitude` and `longitude` |
| units | `GET/POST units`, `GET/PUT/DELETE units/{id}`; unit data exposes computed `occupancy_status` (`vacant`/`occupied`) and editable `condition_tag` (`good_condition`/`under_maintenance`) |
| tenants | `GET/POST tenants`, `GET/PUT/DELETE tenants/{id}`, `POST tenants/{id}/reset-password`; tenant creation includes required `unit_id` and optional lease fields `start_date`, `monthly_rent`, `deposit`, `due_day` |
| leases | `GET/POST leases`, `GET/PUT/PATCH/DELETE leases/{id}`, `POST leases/{id}/end`, `POST leases/{id}/renew {end_date,monthly_rent?,deposit?,due_day?}`, `GET leases/{id}/history` |
| lease documents | `GET/POST leases/{id}/documents` (`{name,document:dataURL}`), `GET/DELETE leases/{id}/documents/{document_id}`; landlord-private PDF files up to 5 MB |
| bills | `GET bills[?status=&month=&tenant_id=]`, `POST bills/generate {month:"YYYY-MM"}`, `GET/DELETE bills/{id}`, `POST bills/{id}/remind` |
| payments | `GET payments`, `POST payments {bill_id, method: cash|bank_transfer, notes}` |
| maintenance | `GET maintenance`, `PUT maintenance/{id} {status, priority, admin_notes}` |
| transfer requests | `GET transfer-requests`; `PATCH transfer-requests/{id} {status: approved|rejected, admin_note?}` |
| in-app notifications | `GET in-app-notifications`, `GET in-app-notifications/unread-count`, `PATCH in-app-notifications/{id}/read`, `PATCH in-app-notifications/read-all` |

## Tenant – prefix `/api/my` (role `tenant`)
`GET summary` · `GET bills` · `POST bills/{id}/pay` (returns `checkout_url`) · `GET payments` ·
`POST payments/{id}/verify` · `GET maintenance` · `POST maintenance {title, description, priority}` ·
`GET available-units` (vacant, good-condition units) · `GET transfer-requests` ·
`POST transfer-requests {requested_unit_id, reason?}` · `GET notifications` ·
`GET notifications/unread-count` · `PATCH notifications/{id}/read` · `PATCH notifications/read-all`

Tenant creation with a unit creates the account and active lease atomically. A selected unit is rechecked in the transaction and must still be vacant and in good condition.
Transfer approval also rechecks availability and moves the tenant to a new active lease; the old lease and its bills remain in the system.

Landlord registration remains public and uses the existing `admin` role; platform-wide administration is separately protected by the `superadmin` role. Each tenant account is linked to its landlord. Landlord endpoints scope rental records to the authenticated landlord.

`POST /api/admin/onboarding` accepts `{property:{name,type,address,city,barangay,latitude,longitude,description},units:[{unit_name,monthly_rent,capacity,condition_tag}],tenants:[{username,email,full_name,phone,unit_index,start_date,monthly_rent,deposit,due_day}]}` and creates all supplied records in one transaction. It returns generated tenant temporary passwords once. `POST /api/admin/onboarding/skip` marks setup complete without adding records. `POST /api/admin/assistant/chat` returns an optional editable proposal; only the landlord's explicit confirmation through onboarding saves it. Configure `GEMINI_API_KEY` on the backend to enable Gemini.

## Platform superadmin

`/api/superadmin/*` requires the `superadmin` role. `GET landlords` lists landlord accounts with property and tenant counts. `PATCH landlords/{id} {is_active}` activates/deactivates a landlord and blocks the landlord’s tenants from authenticated access. `POST landlords/{id}/send-password-reset` emails a single-use reset link. `GET accounts`, `POST accounts {username,email,full_name,password}`, and `PATCH accounts/{id} {is_active}` manage superadmins; an active superadmin cannot deactivate itself or the last active superadmin.

Migration 018 adds the role and reset-token table and creates the first superadmin from private `SUPERADMIN_BOOTSTRAP_EMAIL`, `SUPERADMIN_BOOTSTRAP_USERNAME`, `SUPERADMIN_BOOTSTRAP_FULL_NAME`, and `SUPERADMIN_BOOTSTRAP_PASSWORD` environment values. Configure these only for migration, then remove the bootstrap password. There is no public superadmin signup.

Public password recovery (`POST /api/auth/password/forgot {email}` and `POST /api/auth/password/reset {token,password}`) requires SMTP and `FRONTEND_URL`. Reset links expire after 30 minutes and are single-use. Google OAuth is deferred; the frontend currently shows disabled placeholder buttons.

Errors: `{"error":"…","errors":{"field":"…"},"status":422}` – 401 not signed in, 403 wrong role, 404, 409 conflict,
415 not JSON, 422 validation, 429 too many requests.


## Login
`POST /api/auth/login` takes `{login, password}` where `login` is the **email or the username** (`email` is still accepted as an alias).
