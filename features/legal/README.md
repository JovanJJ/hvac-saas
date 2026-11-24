# UX08 legal publication record

Draft revision: **2026-11-24, local draft 1**. These are implementation drafts, not approved terms or a published privacy notice. The dates in the UI identify the draft edit; they do not establish a commercial effective date.

## Current boundary

`legalPagesAvailable` in `features/public-site/availability.ts` is true only in development. `LegalReadingLayout` enforces the same condition with `notFound()`, independently of navigation. Both routes declare `noindex, nofollow`. Production builds return 404 and omit all legal links from registration/auth, demo, pricing and footer. There is deliberately no environment-variable bypass or automatic approval based on the presence of text fields. Complete and review the document before changing the publication gate in a subsequent authorized change. Preserve anonymous reading when publishing; these notices should not require a staff account.

The local pages explicitly mark themselves as drafts and describe unresolved matters in complete sentences. They contain no bracket placeholders, invented business identity, email, retention period, tax treatment, effective date or cancellation guarantee. No acceptance checkbox, terms receipt, consent record, trial timer or paid-subscription behavior is introduced. Reading a page does not agree to a contract.

## Verified implementation facts

| Area | Evidence and wording boundary |
| --- | --- |
| Demonstration contacts | UX07 stores name/email/company/optional plan, operation UUID and creation time in `hvac_private.demo_requests`. The restricted RPC is write-only for visitors; SQL tooling reads the private inbox. No automatic email/newsletter, account creation or retention purge. See `BACKEND.md`, `DATABASE.md`, `features/demo/` and migration 055. |
| Auth | Self-hosted Supabase Auth owns identity, confirmation, recovery and session. SMTP delivers its messages. The operator configured Gmail SMTP during development; the final production provider, contract and countries still need verification. See `deploy/SMTP.md`; do not copy SMTP settings or private sender addresses into public notices. |
| Operational data | Organization/assignment access, Cloudinary authenticated photos, private Supabase PDF Storage, immutable report revisions and optional name/role/receipt. See `DATABASE.md`, `REPORTS.md` and `ARCHITECTURE.md`. The controller/processor allocation is a contract/legal decision, not something RLS establishes. |
| Cookies | Supabase SSR session/PKCE cookies; 30-day workspace and onboarding operation preferences; 1-hour safe `teren_auth_next` hint; 30-day script-readable offline boundary cookie. Application auth cookies use HttpOnly/SameSite=Lax and HTTPS Secure; the offline boundary is intentionally readable. Supabase cookie/session expiry is SDK/stack-dependent: verify effective production configuration rather than inventing one common lifetime. See `lib/supabase/config.ts`, `features/auth/actions.ts`, `features/workspaces/actions.ts`, `lib/offline/server.ts`. |
| Device storage | IndexedDB visit copies/drafts/outbox/photo Blobs; localStorage boundary/cross-tab markers; versioned service-worker shell cache. Explicit download is needed. Pending data can be lost by browser storage deletion. Active-page replay only, no promise of closed-browser sync. Export/report links are not offline cached. See `FRONTEND.md`, `lib/offline/storage.ts`, `public/sw.js`. |
| Public media | Checked-in fictional report, PDF and images. Current application code has no embedded external video player or marketing analytics integration. Reaudit whenever a player/analytics script is added; this statement does not cover infrastructure logs. |
| Pricing and trial | `pilot-plans.ts` supplies the same proposed RSD 1,290/2,490 prices and seat descriptions to pricing and terms. The FAQ and signup state that trial start/continuation is still agreed manually. No automatic trial start, payment collection, invoicing or cancellation workflow exists. Do not silently adopt the older illustrative first-visit trigger as an implemented/final policy. |

## Required operator decisions before publication

All rows remain **unconfirmed** until the operator supplies explicit evidence/approval. Local implementation and later UX tickets may continue; paid/public launch may not rely on these drafts.

| Required fact/decision | Required detail |
| --- | --- |
| Provider/controller identity | Registered business name, address, registration number, tax ID and applicable business jurisdiction. |
| Public contacts | Selectable verified privacy email, support/cancellation/complaint contact and process. Do not infer these from login, SMTP credentials, customer records or a personal sender address. |
| Processing roles and bases | Controller responsibilities for lead/account/business processing; contractual processor role for service-firm data; legal basis separately for demo response, Auth/security, billing and operational processing. |
| Retention and deletion | Period or justified criterion for leads, Auth identities/sessions, memberships, service records, snapshots/receipts, photos, logs, mutation receipts and backup copies; deletion/anonymization execution, exceptions and restore handling. Preserve immutable report/retry contracts until a reviewed policy defines compatible deletion. |
| Providers and geography | Actual production host, database/object storage regions, Cloudinary and mail contracting entities, subprocessor list, access recipients, international transfers and safeguards, any infrastructure logging/metrics. Local Docker is not evidence of a production location or of zero transfers. |
| Cookies/local storage | Verify effective deployment/session lifetimes, proxy logs and any future analytics/video behavior; review necessary-storage wording against actual purposes. |
| Commercial terms | Confirm prices, seats, additional seats if offered, VAT/tax treatment, payment deadline/method, 30-day trial duration and exact trigger, continuation consent and paid-period start. No card/subscription code currently exists. |
| Exit and support | Cancellation method/effective date, treatment of prepaid periods, access after trial/end of service, export window/formats, deletion schedule, support hours and complaints process; no invented SLA/refund promise. |
| Final review and monitoring | Operator/legal approval of complete dated Serbian wording and controller/processor agreement as applicable; nominate who monitors the real demo inbox and handles rights/support requests. Recheck links and production publication acceptance after lifting the gate. |

## Legal reference used for the draft

The limited rights paragraph follows the official [Commissioner's rights guide](https://poverenik.rs/zastita-podataka/kako-da-ostvarite-svoja-prava/?script=lat), checked 24 November 2026. The [Serbian data protection law, official parliamentary text](https://www.parlament.gov.rs/upload/archive/files/lat/pdf/zakoni/2018/2959-18-lat.pdf) is background for review, not evidence of this operator's legal basis or compliance. No source can supply the missing operator/deployment facts.
