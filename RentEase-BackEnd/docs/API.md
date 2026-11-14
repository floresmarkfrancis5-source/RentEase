# RentEase API reference
Base URL: `https://<your-api>.onrender.com`. JSON in, JSON out. Private routes need `Authorization: Bearer <access_token>`.

## Public
| Method | Route | |
|---|---|---|
| GET | `/api/health` | API process liveness |
| GET | `/api/health/ready` | Aiven database readiness and connection-check duration |
| GET | `/api/settings` | fixed RentEase defaults for public pages |
| GET | `/api/assets/{logo\|hero}?owner={landlord_id}` | landlord-specific public sidebar logo or tenant homepage image (ETag + long cache) |
| POST | `/api/auth/login` · `/api/auth/google` · `/api/auth/refresh` | `{email,password}` · `{credential}` · `{refresh_token}` (10/min/IP) |
| POST | `/api/auth/register` | `{username,email,full_name,password}`; creates a landlord (`admin`) account |
| POST | `/api/auth/google/register` | `{credential,username}`; creates a landlord account and starts onboarding |
| POST | `/api/auth/password/forgot` | `{email}`; sends a short-lived reset link without revealing whether an account exists |
| POST | `/api/auth/password/reset` | `{token,password}`; consumes a single-use reset token and revokes refresh sessions |
| POST | `/api/webhooks/paymongo` | signed by PayMongo |
| POST | `/api/cron/reminders` | header `X-Cron-Token` |

## Any signed-in user
`POST /api/auth/logout` · `GET /api/auth/me` · `GET /api/my/settings` · `POST /api/auth/change-password` ·
`GET /api/bills/{id}/statement` (PDF) · `GET /api/payments/{id}/receipt` (PDF) – owner or landlord only.

## Chats (landlord and tenant)
`GET /api/chats` lists the signed-in user's conversations. `GET /api/chats/{conversation_id}/messages[?before={message_id}]` returns recent messages (30 by default, maximum 50); `POST /api/chats/{conversation_id}/messages {content?,image?,reply_to_message_id?}` sends text and/or a PNG/JPG/WebP data URL (image limit 650 KB), optionally replying to a message in that conversation. `DELETE /api/chats/{conversation_id}/clear` clears messages only for the signed-in user; for landlords, removing a direct conversation also hides it from their list until a new message arrives or they reopen it from Tenants. `DELETE /api/chat-messages/{message_id} {conversation_id}` unsends the sender's own message for both participants. `PUT /api/chat-messages/{message_id}/reaction {conversation_id,reaction:like|dislike|haha|null}` changes or removes that user's reaction.

Landlords can create a direct conversation with one of their tenants using `POST /api/chats/direct/{tenant_id}`. Tenants' first message creates their direct conversation automatically. The General room is available only to the landlord and tenants with a current active lease. Chat image uploads require Cloudinary credentials or an upload preset.

## Landlord – prefix `/api/admin` (role `admin`)
| Resource | Routes |
|---|---|
| dashboard and reports | `GET dashboard`, `GET reports/landlord` (current portfolio and last 30 days of dated activity), `GET reports/landlord/summary` (Gemini summary from aggregate metrics only), `GET notifications` (email log) |
| onboarding | `GET onboarding`, `POST onboarding`, `POST onboarding/skip` |
| AI assistant | `GET assistant/conversations`, `POST assistant/conversations`, `GET/DELETE assistant/conversations/{id}`, `POST assistant/conversations/{id}/confirmation`; `POST assistant/chat {message,conversation_id?,edit_message_id?}` (read-only landlord record lookups and editable setup/contract drafts); `POST assistant/insights {action: overdue|income|repairs}` (read-only, landlord-scoped); `POST assistant/units {property_id,units:[...]}` (adds 1–100 reviewed units atomically to a landlord-owned property) |
| in-app notifications | `GET in-app-notifications`, `GET in-app-notifications/unread-count`, `GET in-app-notifications/sidebar-counts`, `PATCH in-app-notifications/sections/{section}/read`, `PATCH in-app-notifications/{id}/read`, `PATCH in-app-notifications/read-all` |
| transfers and early move-in | `GET transfer-requests`, `PATCH/DELETE transfer-requests/{id}`; `GET early-move-requests`, `PATCH early-move-requests/{id} {status: approved|rejected, admin_note?}`, `DELETE early-move-requests/{id}` |
| profile (any logged-in user) | `GET/PUT /api/profile`, `GET/PUT/DELETE /api/profile/photo` |
| settings | `PUT settings`, `POST settings/reset`, `GET settings/history`, `PUT settings/image` (body `{key, image: dataURL}`), `DELETE settings/image/{key}`; appearance and billing defaults are scoped to the signed-in landlord |
| announcements | `GET/POST announcements`, `PUT/DELETE announcements/{id}`; published announcements are shown on that landlord's tenants' homepages |
| properties | `GET/POST properties`, `GET/PUT properties/{id}`, `DELETE properties/{id}` (archive), `POST properties/{id}/restore`; `GET properties?archived=1` lists archived properties |
| units | `GET/POST units`, `GET/PUT units/{id}`, `DELETE units/{id}` (archive), `POST units/{id}/restore`; `GET units?archived=1` lists archived units and units hidden by an archived property |
| tenants | `GET/POST tenants`, `GET/PUT/DELETE tenants/{id}`, `POST tenants/{id}/reset-password`; new tenant leases may be offered or scheduled to start on a future move-in date |
| leases | `GET/POST leases`, `GET/PUT/PATCH/DELETE leases/{id}`, `POST leases/{id}/end`, `POST leases/{id}/renew {end_date,monthly_rent?,deposit?,due_day?}`, `GET leases/{id}/history`; each lease snapshots its billing style, first-month proration, grace period, and late fee |
| lease documents | `GET/POST leases/{id}/documents` (`{name,document:dataURL}`), `GET/DELETE leases/{id}/documents/{document_id}`; private PDF files up to 5 MB, scoped to the landlord |
| bills | `GET bills[?status=&month=&tenant_id=]`, `POST bills/generate {month:"YYYY-MM"}`, `GET/DELETE bills/{id}`, `POST bills/{id}/remind` |
| payments | `GET payments`, `POST payments {bill_id, method: cash|bank_transfer, notes}`; only one pending attempt can settle an unpaid/overdue bill, and stale or duplicate attempts do not issue another receipt |
| maintenance | `GET maintenance`, `PUT maintenance/{id} {status, admin_notes}`; the tenant's selected category sets urgency, except tenants choose urgency for `Other`; unit records include counts of open repair requests |

## Tenant – prefix `/api/my` (role `tenant`)
`GET summary` · `GET announcements` (published announcements for the current lease) · `POST leases/{id}/accept {agree:true}` · `GET/POST early-move-requests` · `DELETE early-move-requests/{id}` (cancel a pending request) · `GET bills` · `POST bills/{id}/pay` (returns `checkout_url`) · `GET payments` ·
`POST payments/{id}/verify` · `GET maintenance` · `POST maintenance {category, title?, description, priority?, images?}` (requires an active lease; priority is category-assigned except for `Other`, where `priority` may be `low`, `medium`, or `high`) ·
`GET available-units` · `GET/POST transfer-requests` · `GET notifications` · `GET notifications/unread-count` ·
`PATCH notifications/{id}/read` · `PATCH notifications/read-all`

## Landlord setup and account ownership

Landlord signup remains public and uses the existing `admin` role; platform-wide administration is separately protected by the `superadmin` role. Each landlord-created tenant is associated with that landlord. Admin rental-data endpoints scope results and record lookups to the authenticated landlord.

`POST /api/admin/onboarding` creates the property, units, and any optional tenant accounts/leases in one transaction. It accepts optional property/unit contract templates and unit rent/deposit/due-day defaults; move-in defaults to five days ahead and annual lease end dates are calculated by the API. Billing defaults are copied onto each new lease; a tenant may request an earlier date for a scheduled lease, which the landlord must approve. It returns generated tenant temporary passwords once. `POST /api/admin/onboarding/skip` marks setup complete without creating records.

`POST /api/admin/assistant/chat` uses Gemini for conversational responses and function calling. The backend sends only the current user message; Gemini may call `get_chat_history` to resolve a follow-up, and the server binds history to the authenticated landlord and current conversation. Typed read tools cover properties, units, tenants, bills, payments, balances, overdue items, maintenance, move requests, leases, and chat history. Each query is landlord-scoped and returns at most 50 records; arbitrary SQL and unrestricted database access are not exposed. Before changing, archiving, or deleting a record, the assistant must find it through a read tool and the backend verifies the ID belongs to those results and the authenticated landlord. Gemini can suggest contextual reply chips and prepare editable property/unit or contract drafts, which remain unsaved until reviewed through the existing UI. Creating a tenant lease, bill/payment/unit money changes, archiving a unit, and bill deletions create a pending action; the backend executes only the latest unexpired action after a separate explicit confirmation in a later user message. Manual assistant payments are limited to cash and bank transfer and use the existing payment model; PayMongo is not used. Pending actions and assistant write audits use migrations 036 and 037; migration 038 adds reversible property and unit archiving. Set `ASSISTANT_DEBUG=true` only while diagnosing; truncated assistant request/tool events are written to `app/logs/assistant-debug.log`, never including the Gemini API key. Normal replies are plain conversational text, not a required JSON envelope. Assistant insights remain read-only. Configure `GEMINI_API_KEY` on the API server to enable Gemini responses and drafting.

Property and unit DELETE routes are reversible archive actions and preserve all associated lease, bill, payment, receipt, maintenance, and transfer history. Active, scheduled, or offered leases must be ended or cancelled before archiving the property or unit. Active list routes omit archived records; restore a property to reveal its non-archived units, and restore an individually archived unit only after its parent property is active.

## Platform superadmin – prefix `/api/superadmin` (role `superadmin`)

`GET landlords` lists landlord accounts and their property/tenant counts. `PATCH landlords/{id} {is_active}` activates or deactivates a landlord; deactivation blocks the landlord and their tenants from authenticated access. `POST landlords/{id}/send-password-reset` emails a one-use reset link to an active landlord.

`GET accounts` lists superadmins. `POST accounts {username,email,full_name,password}` creates another superadmin (password minimum 12 characters). `PATCH accounts/{id} {is_active}` activates or deactivates a superadmin; an active account cannot disable itself and the final active superadmin cannot be disabled.

Migration 018 adds the role and password-reset token table. Before running it, configure `SUPERADMIN_BOOTSTRAP_EMAIL`, `SUPERADMIN_BOOTSTRAP_USERNAME`, `SUPERADMIN_BOOTSTRAP_FULL_NAME`, and `SUPERADMIN_BOOTSTRAP_PASSWORD` privately in the backend environment. The migration creates the first superadmin only when none exists; remove the bootstrap password from the environment after migration. There is no public superadmin signup.

Migration 019 adds lease event history and private PDF attachments. Migration 030 adds landlord contract templates, unit defaults, scheduled/offered leases, and tenant acceptance; migration 031 adds repair categories with server-assigned urgency; migration 032 adds per-lease billing snapshots, late-fee tracking, and early move-in requests; migration 033 adds announcements and chats; migration 034 adds reply references to chat messages; migration 035 adds the Haha chat reaction. Active lease terms can be edited; renewal extends the same lease record and logs the before/after terms so existing bills remain attached. Printed contracts are drafts; parties should review them and applicable requirements before signing.

Email password recovery requires SMTP (`SMTP_*`, `MAIL_FROM`) and `FRONTEND_URL`. Reset tokens expire after 30 minutes and can only be used once. Google OAuth is deferred; the frontend currently shows disabled placeholder buttons.

Errors: `{"error":"…","errors":{"field":"…"},"status":422}` – 401 not signed in, 403 wrong role, 404, 409 conflict,
415 not JSON, 422 validation, 429 too many requests.


## Login
`POST /api/auth/login` takes `{login, password}` where `login` is the **email or the username** (`email` is still accepted as an alias).
