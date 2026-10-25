# RentEase API reference
Base URL: `https://<your-api>.onrender.com`. JSON in, JSON out. Private routes need `Authorization: Bearer <access_token>`.

## Public
| Method | Route | |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/settings` | site name, colours, hero text, theme defaults, logo/hero/login image links |
| GET | `/api/assets/{logo\|hero\|login}` | the uploaded image (public, ETag + long cache) |
| POST | `/api/auth/login` · `/api/auth/google` · `/api/auth/refresh` | `{email,password}` · `{credential}` · `{refresh_token}` (10/min/IP) |
| POST | `/api/auth/register` | `{username,email,full_name,password}`; creates a landlord (`admin`) account |
| POST | `/api/auth/google/register` | `{credential,username}`; creates a landlord account and starts onboarding |
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
| dashboard | `GET dashboard`, `GET notifications` (email log) |
| onboarding | `GET onboarding`, `POST onboarding`, `POST onboarding/skip` |
| AI assistant | `POST assistant/chat {message,history}` (Gemini drafts only; does not write records) |
| in-app notifications | `GET in-app-notifications`, `GET in-app-notifications/unread-count`, `PATCH in-app-notifications/{id}/read`, `PATCH in-app-notifications/read-all` |
| transfers | `GET transfer-requests`, `PATCH transfer-requests/{id} {status: approved|rejected, admin_note?}` |
| profile (any logged-in user) | `GET/PUT /api/profile`, `GET/PUT/DELETE /api/profile/photo` |
| settings | `PUT settings`, `POST settings/reset`, `GET settings/history`, `PUT settings/image` (body `{key, image: dataURL}`), `DELETE settings/image/{key}` |
| properties | `GET/POST properties`, `GET/PUT/DELETE properties/{id}` |
| units | `GET/POST units`, `GET/PUT/DELETE units/{id}` |
| tenants | `GET/POST tenants`, `GET/PUT/DELETE tenants/{id}`, `POST tenants/{id}/reset-password`; create accepts a vacant good-condition `unit_id` and creates its active lease atomically |
| leases | `GET/POST leases`, `GET/PUT/PATCH/DELETE leases/{id}`, `POST leases/{id}/end`, `POST leases/{id}/renew {end_date,monthly_rent?,deposit?,due_day?}`, `GET leases/{id}/history` |
| lease documents | `GET/POST leases/{id}/documents` (`{name,document:dataURL}`), `GET/DELETE leases/{id}/documents/{document_id}`; private PDF files up to 5 MB, scoped to the landlord |
| bills | `GET bills[?status=&month=&tenant_id=]`, `POST bills/generate {month:"YYYY-MM"}`, `GET/DELETE bills/{id}`, `POST bills/{id}/remind` |
| payments | `GET payments`, `POST payments {bill_id, method: cash|bank_transfer, notes}` |
| maintenance | `GET maintenance`, `PUT maintenance/{id} {status, priority, admin_notes}` |

## Tenant – prefix `/api/my` (role `tenant`)
`GET summary` · `GET bills` · `POST bills/{id}/pay` (returns `checkout_url`) · `GET payments` ·
`POST payments/{id}/verify` · `GET maintenance` · `POST maintenance {title, description, priority}` ·
`GET available-units` · `GET/POST transfer-requests` · `GET notifications` · `GET notifications/unread-count` ·
`PATCH notifications/{id}/read` · `PATCH notifications/read-all`

## Landlord setup and account ownership

Landlord signup remains public and uses the existing `admin` role; platform-wide administration is separately protected by the `superadmin` role. Each landlord-created tenant is associated with that landlord. Admin rental-data endpoints scope results and record lookups to the authenticated landlord.

`POST /api/admin/onboarding` creates the property, units, and any optional tenant accounts/leases in one transaction. The body is `{property:{name,type,address,city,barangay,latitude,longitude,description},units:[{unit_name,monthly_rent,capacity,condition_tag}],tenants:[{username,email,full_name,phone,unit_index,start_date,monthly_rent,deposit,due_day}]}`. It returns generated tenant temporary passwords once. `POST /api/admin/onboarding/skip` marks setup complete without creating records.

Gemini chat accepts no database actions: `POST /api/admin/assistant/chat` receives `{message,history}` and returns a reply plus an optional editable proposal. The landlord must confirm a proposal using the onboarding endpoint before any rental records are saved. Configure `GEMINI_API_KEY` on the API server to enable it.

## Platform superadmin – prefix `/api/superadmin` (role `superadmin`)

`GET landlords` lists landlord accounts and their property/tenant counts. `PATCH landlords/{id} {is_active}` activates or deactivates a landlord; deactivation blocks the landlord and their tenants from authenticated access. `POST landlords/{id}/send-password-reset` emails a one-use reset link to an active landlord.

`GET accounts` lists superadmins. `POST accounts {username,email,full_name,password}` creates another superadmin (password minimum 12 characters). `PATCH accounts/{id} {is_active}` activates or deactivates a superadmin; an active account cannot disable itself and the final active superadmin cannot be disabled.

Migration 018 adds the role and password-reset token table. Before running it, configure `SUPERADMIN_BOOTSTRAP_EMAIL`, `SUPERADMIN_BOOTSTRAP_USERNAME`, `SUPERADMIN_BOOTSTRAP_FULL_NAME`, and `SUPERADMIN_BOOTSTRAP_PASSWORD` privately in the backend environment. The migration creates the first superadmin only when none exists; remove the bootstrap password from the environment after migration. There is no public superadmin signup.

Migration 019 adds lease event history and private PDF attachments. Active lease terms can be edited; renewal extends the same lease record and logs the before/after terms so existing bills remain attached. The printable agreement is a draft template; parties should complete and review any additional terms before signing.

Email password recovery requires SMTP (`SMTP_*`, `MAIL_FROM`) and `FRONTEND_URL`. Reset tokens expire after 30 minutes and can only be used once. Google OAuth is deferred; the frontend currently shows disabled placeholder buttons.

Errors: `{"error":"…","errors":{"field":"…"},"status":422}` – 401 not signed in, 403 wrong role, 404, 409 conflict,
415 not JSON, 422 validation, 429 too many requests.


## Login
`POST /api/auth/login` takes `{login, password}` where `login` is the **email or the username** (`email` is still accepted as an alias).
