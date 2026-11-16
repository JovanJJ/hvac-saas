# HVAC field service

The app implements the M0 field prototype and M1 workspace/access foundation. The pilot UI uses Serbian Latin. See [SPEC.md](SPEC.md), [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for scope and completion gates.

## Local setup

Use Node **22.23.1** (`.nvmrc`) and the existing Docker-hosted Supabase stack. Keep its data; do not initialize a second stack or run a database reset.

```sh
npm ci
npm run db:migrate
npm run dev
```

Configure the ignored `.env` using [.env.example](.env.example). Required for auth: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or the supported `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / legacy anon key), and `APP_URL` (the application origin). `DATABASE_URL` is for migration/seed/test tooling only. Do not use a service-role key as the client key. The client key must also be registered in the running gateway; a differently configured publishable key returns 401 even if it has the correct format. Cloudinary credentials remain server-only; image uploads are implemented in M3, not M1a.

Open `http://localhost:3000`. Signed-out users land at `/sign-in`; a verified owner/coordinator lands at `/office` and a technician at `/today`. Accounts without memberships land at `/onboarding`. `/account` lists only the user's active organizations and lets them choose a workspace or start another. Registration, email confirmation, recovery and sign-out remain available.

## Local registration and confirmation inbox

The development Auth service uses the local Inbucket inbox, bound only to `http://localhost:9000`. Start/repair it with:

```sh
npm run mail:start
npm run dev
```

Register through `/sign-up`, then open the local inbox and find the message for the email address you entered. Follow its confirmation link **in the same browser** to complete sign-in, create a workspace and open **Tim i pozivi**. Local confirmation messages are captured here; they are not delivered to Gmail or another external mailbox. Signup/recovery screens show the inbox link in development when `LOCAL_AUTH_INBOX_URL` is configured.

`mail:start` discovers the existing Supabase Compose project, adds `deploy/supabase-mail.local.yml`, and updates only Auth and mail. It preserves the database and keeps email confirmation required. Do not use Supabase's broad `dev/docker-compose.dev.yml` override: it also changes database/storage mounts. Rerun `mail:start` if you later recreate the stack using only its original Compose file. This local overlay is for development; configure a real SMTP provider for pilot/production delivery.

If `npm run dev` is already running on port 3000, use `PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:signup` to reuse it without starting a second Next.js server.

`npm run test:signup` exercises the actual registration form, captured confirmation email, PKCE callback and M1b workspace/team entry at phone and desktop widths. It removes only its own temporary fictional accounts, workspaces and emails. Signup preserves the PKCE verifier while confirmation is pending; signing out an unconfirmed registration would clear it and break the standard callback.

## Supabase Auth email configuration

Keep the stack's SMTP credentials outside git. Set its `GOTRUE_SITE_URL` to the app's `APP_URL` and allow the exact redirect addresses:

- `APP_URL/auth/callback`
- `APP_URL/auth/callback?next=/reset-password`

For server-side verification across devices, use these links in the stack's confirmation and recovery email templates (for self-hosted Auth, configure the corresponding `GOTRUE_MAILER_TEMPLATES_CONFIRMATION` and `GOTRUE_MAILER_TEMPLATES_RECOVERY` template sources):

```html
<!-- Confirm registration -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Potvrdi email adresu</a>
<!-- Recover password -->
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Promeni lozinku</a>
```

The standard PKCE callback is also supported for templates using the provider's confirmation URL, with the original browser's verifier cookie. Do not forward arbitrary `next` destinations. The app accepts only known staff routes and syntactically valid invitation paths; each destination independently checks access. Invalid, expired and consumed verification links give a recoverable message. Password update requires a server-verified account and signs out its Supabase sessions. Configure Auth throttling on the stack. External SMTP delivery and the production public-origin configuration still need a target-environment check. The local-inbox regression test verifies actual signup email delivery and confirmation using fictional `.invalid` recipients; other token tests use isolated fixtures.

Session cookies are HTTP-only, SameSite=Lax and Secure with HTTPS. Auth responses are private/no-store. Server Function argument logging is disabled; token-bearing auth URLs are excluded from Next.js development access logs. Apply equivalent log redaction at the production reverse proxy.

## Development fixtures

Set a local, random `SEED_PASSWORD` (12–72 UTF-8 bytes) in the ignored `.env`, then explicitly opt in:

```sh
ALLOW_DEVELOPMENT_SEED=true npm run db:seed
npm run test:db
```

The seed creates **Primer servis A** and **Primer servis B**, with these fictional identities sharing the local seed password:

| Email | Access |
| --- | --- |
| `owner.a@hvac.example.invalid` | Owner of A |
| `technician.a@hvac.example.invalid` | Technician in A |
| `owner.b@hvac.example.invalid` | Owner of B |
| `unassigned@hvac.example.invalid` | Verified account without membership |
| `unconfirmed@hvac.example.invalid` | Unconfirmed account; app access denied |

Repeat seeds preserve existing accounts, passwords and memberships. They never reset the stack. ID/email collisions fail atomically. Do not seed a production database. The migration runner applies ordered SQL under a transaction lock and verifies checksums on retries. Add migrations rather than editing applied files. Direct table policies grant authenticated reads only; M1b mutations run through narrow, authorized RPCs.

## M1b workspaces and invitations

1. Sign in or confirm a new account. On `/onboarding`, enter a company name and a valid IANA time zone (default `Europe/Belgrade`). The initial attempt is keyed to the verified identity; explicit additional-workspace attempts have a persistent per-account operation cookie. Replaying the same request returns the existing workspace and rejects different data under the same operation ID.
2. Owners open **Tim i pozivi** (`/settings/team`), enter the intended email and role, and create a seven-day invite. **Kopiraj link** provides manual pilot delivery; the app does not send invitation email. A new invitation for the same address revokes the previous pending link. The private database stores only a SHA-256 token digest. Existing links cannot be recovered; reissue a link when necessary.
3. The recipient opens `/invite/[token]`, signs in or registers with the intended address, verifies it, and explicitly accepts. Sign-in and same-browser email verification preserve the invitation destination. When verification happens on a different device, reopen the original invitation after confirming the account. Email mismatch offers **Promeni nalog**. Expired/revoked links disclose no workspace metadata. Reopening a valid accepted invite reuses membership; it cannot reactivate membership that was subsequently revoked. A fresh owner-issued invitation can reactivate a revoked staff member.
4. Owners may change roles, revoke/reactivate staff, and update company identity/time zone. Optimistic versions reject stale writes. Organization-level locking prevents concurrent changes from removing the last active owner. Existing active staff accepting another invitation retain their current role.
5. Switch workspace from the staff header or `/account`. The HTTP-only workspace cookie is partitioned by user and treated only as a preference; every server read/mutation checks live membership. Owners/coordinators may open `/office`; all active members may open `/today`. Team/company settings are owner-only. Coordinator roster access for future scheduling is available through an authorized RPC, with no membership-management authority.

The office/Today screens currently show empty states; real equipment, visits and assignments are M2. Authentication and workspace access are enforced independently of navigation controls. The default UI hides inaccessible routes and denied deep links reveal no other workspace's details. Visit/file isolation remains part of their later milestones.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:api
npx playwright install --with-deps chromium
npm run test:e2e
npm run build
```

Browser tests start a development server on port 3001 with the matching test `APP_URL`, or reuse an existing server. They cover 390 × 844 and 1440 × 1000 layouts. Auth tests require the API settings, `SEED_PASSWORD`, `DATABASE_URL` and seeded fixtures. They create/remove only temporary `.invalid` users to exercise actual confirmation, password recovery, token expiry and replay. Direct policy tests roll back temporary revocation and all workspace/invitation changes. M1b browser/API tests create and remove only their own temporary fictional workspaces and identities, including simultaneous invitation acceptance, workspace retries, and owner demotions. `test:api` also signs in through the actual Supabase gateway to verify direct API reads and denied writes for both organizations, a technician and an unassigned user. M0 tests exercise the four-system journey and expected **4 / 3 / 2** totals. Screenshots go to ignored `test-results/`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` optionally selects an installed Chromium.

## Production image

```sh
docker build -t hvac-saas:m1b .
```

The image uses pinned Node, `npm ci`, standalone output and a non-root user. `.env` files, Git metadata and test artifacts are excluded from the build context. M1 uses only server Supabase clients, with runtime environment lookup, so this image needs no credentials or API build arguments. Inject only the runtime `APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and client key settings into the app container. `SUPABASE_PUBLISHABLE_KEY` takes precedence over the `NEXT_PUBLIC_*` key aliases. Use the Supabase gateway's reachable private-network address for server requests; `localhost` inside the container refers to that container. `DATABASE_URL`, seed passwords and Cloudinary credentials are not needed by the M1 app runtime.

With the image built and development fixtures present:

```sh
npm run test:container
```

This runs a temporary container bound to `127.0.0.1:3002`, verifies non-root execution, absence of `.env`, signed-in account scoping, sign-out and production `/preview` denial, then stops it. It defaults to `host.docker.internal:8000` for the existing host gateway; override with `SMOKE_SUPABASE_URL` and `SMOKE_PORT` when needed. Container tests also need the installed Chromium/browser dependencies.

## M0 prototype

Open `/preview` under `next dev` (also linked from sign-in). Start on **Danas**, open `RN-2026-0142`, enter all four outcomes, review and submit, then open office review and the customer preview. **Počni ponovo** or a refresh clears all data. The prototype uses React memory and never writes to Supabase, uploads files, sends messages or issues reports.

Service KL-01 and KL-02, record a measured zero for KL-02, request a quote for KL-03's damaged deflector, and record the locked archive and return action for KL-04. Expected totals: **4 planned / 3 inspected / 2 open actions**. Pending items and missing follow-up owners block submission. Internal notes are excluded from the customer preview.

The six views share `/preview` and local navigation. The role switch is a prototype control, not authorization. The customer view is an HTML layout, not an issued PDF. The production route returns 404 and production module resolution excludes the fixture's client code. Technician/office feedback with pilot users remains outstanding.

## Next ticket

**M3c — Render and archive the PDF:** add the worker/container, job leases/retries, frozen-snapshot rendering, private Storage artifact/digest and office render readiness/recovery. See [REPORTS.md](REPORTS.md) and [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md).

## M2a — register to technician assignment

As owner/coordinator, open **Klijenti**, create a customer, then open **Lokacije** and create its site with address and time zone. Open **Sistemi** and add systems to that site. Lists support basic search; system cards identify their site so repeated labels remain distinguishable.

Open **Zakaži posetu**, choose the site, type, local start/end, systems and active team members (including yourself for solo work). Save, then check **Raspored**. Sign in as the assigned technician: today's visit appears under **Danas** with its planned systems. Future visits remain in the office schedule until their site-local date. All data survives reloads. Refresh a completed creation form to create another record.

`tests/register.spec.ts` exercises this journey at phone and desktop widths. `supabase/tests/register_schedule.sql` checks retries, invalid selections, cross-organization denial, assigned/unassigned technicians and revoked access, rolling back each scenario. The register remains create-only; customer/site editing, component units and visit rescheduling/cancellation remain future work.

## M2b — assignment to office preview

Apply the additive migrations with `npm run db:migrate`. As an assigned technician (or owner doing solo work), open **Danas → Otvori posetu**. Save each system's deliberate outcome, public work/finding, applicable readings/parts and optional internal note. Meters accept a decimal comma and distinguish measured zero, unmeasured and inapplicable. Repair/no-access items require a next action with an active accountable staff member and a deadline before submission. Drafts survive reload only after **Sačuvaj** succeeds; this slice requires connectivity.

For the four-system example, service KL-01/KL-02, record `0 A` on KL-02, enter a deflector finding and quote for KL-03, and the locked archive plus revisit for KL-04. **Pregled pre predaje** lists pending systems and missing follow-up owners. Save every change, then **Predaj kancelariji**. A separate owner/coordinator session sees the site in **Kancelarija → Čeka pregled**, with **4 planned / 3 inspected / 2 open actions**. Open **Pregled za klijenta**, or return the visit with a reason using **Vrati na dopunu**. The technician can reload, correct and resubmit. Existing same-site equipment encountered during work can be added; these items are identified separately from planned systems.

The preview is a staff-only HTML draft with A4 print styles, not an issued or archived PDF. It excludes access instructions, internal notes and private nested fields. Drafts use the stable visit UUID; report numbering, frozen revisions and files follow in M3. Each item records its actual author/time. Version conflicts keep the current form inputs and ask for reconciliation; durable device drafts and a dedicated conflict workflow follow in M4.

Verification: `npm run test:db` includes rollback lifecycle/access checks; `npm run test:visit-api` creates and removes only its own fictional records to verify direct API denial, concurrent independent item saves, simultaneous submission and replay. `tests/visit-handover.spec.ts` exercises real field/office sessions, pending/missing-owner validation, persisted zero/parts, correction/resubmission, customer privacy and cross-organization deep-link denial at 390 × 844 and 1440 × 1000. Use `PLAYWRIGHT_BASE_URL=http://localhost:3000` to reuse an existing development server. Browser fixtures and API fixtures remove their own records afterward.

## M3a — private field photos

Set the server-only Cloudinary name/key/secret, or a valid `cloudinary://` connection string, in ignored `.env`. Leave the optional URL unset when using the individual values. Run `npm run db:migrate`, then `npm run evidence:configure`. Setup validates/creates only the app-specific signed `hvac_evidence_v1` preset, prohibits overwrites/public delivery, and provisions the matching `EVIDENCE_VERIFICATION_SECRET` in `.env` and the private database verifier. Existing mismatched secrets/preset restrictions fail without being overwritten. Run setup again to verify configuration; inject these same settings into the app container at runtime. No provider credentials or verification secret are required during the build.

Open an editable assigned visit and use **Fotografije** below a system. Select JPEG/PNG/WebP up to 8 MiB, enter a caption and explicitly choose **Za klijenta** or **Interno**. **Dodaj fotografiju** reserves a stable ID, sends the file through the authenticated app server and verifies the stored Cloudinary object. Only **Potvrđena** means the server has confirmed the photo. Reload preserves verified photos/captions. Failed sending retains the selected file while the page stays open; after reload, retry verification of a possibly uploaded file, or remove its reservation and select the file again. Pending reservations block submission. To change a reservation's caption/visibility, remove it and create a new one.

Office review shows staff evidence. **Pregled za klijenta** includes only verified customer-visible photos. Every image request rechecks workspace/assignment access and serves private/no-store bytes through the app; no public asset URL or provider signature is exposed. **Ukloni fotografiju** immediately prevents further app delivery and attempts provider cleanup. If cleanup fails, the removed entry offers a retry; automatic cleanup jobs and durable offline photo storage remain future work. Submitted visits lock evidence until office return; issued visits remain locked and corrections require the future M3f amendment workflow.

`tests/evidence.spec.ts` uploads temporary fictional images to the actual configured Cloudinary account at phone/desktop widths, checks reload, completion retry, customer/internal/unverified filtering, private delivery, another organization, withdrawn assignment and removal, then cleans up its own objects/rows. It requires the configured provider and seeded development identities. Run `npm run test:e2e -- tests/evidence.spec.ts --workers=2`; `npm run test:db` adds rollback evidence isolation/forgery/submission checks. No mock-provider route exists in production. The M2b four-system journey remains covered by `tests/visit-handover.spec.ts`.

## M3b — freeze an issued revision

Apply migrations with `npm run db:migrate`. Complete and submit a visit, then sign in as owner/coordinator and open **Kancelarija → Čeka pregled**. Check **Pregled za klijenta**, return to review and select **Izdaj izveštaj**. Issuance revalidates findings, active follow-up owners/deadlines and uploaded evidence, allocates an organization/year `RN-YYYY-NNNN` number, freezes revision 1 and queues its PDF job atomically. Failed validation leaves no revision/job or consumed number. Concurrent first issues and retries resolve to one intended revision/job.

The revision page shows locked content, issuer/time and **PDF čeka izradu**. Find it again under **Izdati izveštaji** on the office home or from the issued visit. No PDF is rendered yet and no download/share action is available. Field/photo changes and pre-issue correction returns are blocked after issuance; amendments follow in M3f. Company/register changes leave the stored snapshot and issued preview unchanged. Preview and issuance use a single SQL allowlist and the shared `features/reports/document.tsx` template; private/internal fields and unverified photos are excluded.

Run `npm run test:db` for rollback snapshot/privacy/permissions/numbering checks, including coordinator issuance and numbers above 9999. `npm run test:e2e -- tests/report-issuance.spec.ts --workers=2` exercises the 4/3/2 journey, pending-photo rejection, source edits after issue, locked technician views and real API concurrency/denied writes at phone/desktop widths. It creates/removes only its own fictional records; committed development report numbers are intentionally not reset or reused during cleanup. SQL tests roll back their counter changes. Rendering/archived bytes and the 1/4/30-system PDF gate belong to M3c.
