# System architecture and deployment

Build a modular Next.js App Router application in TypeScript. Self-host Supabase in Docker for PostgreSQL, Auth and private Storage. PostgreSQL is the system of record. The mobile PWA holds a limited working copy of assigned jobs. Start with one repository, one Next.js application and a small background worker from the same codebase for durable work.

## Runtime boundaries

| Component | Responsibility |
| --- | --- |
| Technician browser | Interactive field forms, offline navigation for downloaded jobs, IndexedDB drafts/photo queue and visible synchronization state. |
| Office browser | Scheduling, import preview, review, report preview and export. |
| Next.js Node.js server | Server-rendered reads, request-scoped auth, validated business commands, scoped public report access and rendering templates. Client Components handle browser-only APIs. |
| Supabase | Auth identities, data API, Postgres constraints and transactions, row-level security (RLS) and private object storage. |
| Background worker | Claims due database jobs, renders issued PDF snapshots into private storage and schedules maintenance occurrences. Run from a dedicated process/container with the same pinned source version. |
| HTTPS reverse proxy | Routes the public app and Supabase API domains to the appropriate service. Keep Studio, SQL and internal service endpoints restricted. |

Use Tailwind CSS for new UI components. The M0 preview retains its existing component CSS; Tailwind utilities are loaded without Preflight to preserve that layout.

Use Cloudinary for image uploads. `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` and the optional valid `cloudinary://` connection string `CLOUDINARY_URL` are server-only settings in the ignored `.env` file. M3a implements signed authenticated uploads through bounded app Route Handlers; browsers receive neither provider credentials nor signed delivery URLs. Each private image request rechecks current organization/assignment access, then the server fetches through a short-lived signed download request and returns private/no-store bytes. Ordinary public Cloudinary URLs do not enforce organization access. Supabase private Storage remains the target for archived PDFs.

Run `npm run evidence:configure` after migrations to validate/create the application-specific signed `hvac_evidence_v1` preset and provision `EVIDENCE_VERIFICATION_SECRET` alongside its matching private database verifier. The preset requires authenticated delivery, disallows overwrites and limits formats; the app enforces the 8 MiB request/file limit and verifies provider format, dimensions, asset ID/version and actual stored size. Cloudinary may normalize image bytes, so original reservation size and verified provider size are separate. Completion uses a short-lived server HMAC bound to tenant, actor, visit, attachment and verified metadata; direct authenticated API clients cannot self-certify an object. No runtime request uses `DATABASE_URL` or a Supabase service-role key. Inject the Cloudinary settings and verifier into the app runtime, never build arguments; preserve the matching verifier during recovery. Pending blobs remain in the current browser page only until M4d adds durable device storage.

## Development and production

During development run Next.js directly in WSL and connect to the existing self-hosted Supabase Docker stack. The user supplies the server-only SQL connection as `DATABASE_URL` in `.env`. Read API URLs and keys from the actual stack configuration; do not initialize a separate Supabase CLI stack. Deploy the official pinned self-hosted Supabase Docker Compose distribution on the production VPS.

| Connection | Local default | Production example |
| --- | --- | --- |
| Browser or host Next.js to Supabase API | API gateway URL from the existing Docker stack configuration | Browser uses `https://api.example.rs`; use the public URL for auth flows and redirects. |
| Containerized app/worker to data or storage API | Host app can use the same local URL | `http://api-gw:8000` on the shared Docker network if that service name exists in the pinned Compose file. Using the public URL is also valid. |
| SQL migrations or maintenance | Server-only `DATABASE_URL` from `.env` | Use a dedicated migration connection over the private network, typically `db:5432`. |
| User to Next.js | `http://localhost:3000` | `https://app.example.rs` |

By default, separate Compose projects create separate networks. Attach the required services to an explicitly shared network when using separate projects. Inside a container, `localhost` refers to that container. Testing on a technician's phone also needs reachable app and API URLs; use a trusted HTTPS test address for PWA/service-worker tests.

The optional development mail override is [deploy/supabase-mail.local.yml](deploy/supabase-mail.local.yml). `npm run mail:start` starts the missing local inbox and configures Auth SMTP/redirects without changing database services or disabling confirmation. Its web inbox is bound to localhost port 9000. Keep this separate from production SMTP configuration; see [README.md](README.md).

M3b stores immutable customer snapshots and a durable, uniquely keyed PDF queue row in one database transaction under the caller's session. Preview and issuance share the SQL allowlist and `features/reports/document.tsx` template. M3c provides the dedicated worker/container and private verified PDF archives. Queued issuance does not enable download or guest sharing and adds no new runtime credential or SQL connection to user requests.

## Configuration ownership

- Supabase API configuration: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (preferred for server clients), with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` also supported and `NEXT_PUBLIC_SUPABASE_ANON_KEY` supported for legacy self-hosted anon JWTs. Never use a service-role key as a client key. M1a uses only server clients with dynamic environment lookup, so the same app image accepts these at runtime. If a browser Supabase client is introduced later, its `NEXT_PUBLIC_*` values must be set before `next build` and its URL must be browser-reachable.
- `APP_URL` is the trusted app origin for auth links and cookie security. Set it explicitly in production (HTTPS, except localhost container smoke tests). Add the exact callback URLs and email templates described in [README.md](README.md) to the existing Supabase Auth configuration.
- Private runtime configuration: `DATABASE_URL` for SQL tooling, optional `SUPABASE_INTERNAL_URL` for server-to-server calls, worker credentials and object-storage settings. Never expose `DATABASE_URL` to client components or browser bundles. Request handlers acting for a user carry the user's authenticated session. Verify identity using the official Supabase SSR flow. Test log-in, invite, token refresh and redirects against the production public origin.
- Document names and placeholders in `.env.example` during implementation. Self-hosted Supabase's infrastructure secrets remain separate from the application's configuration. Keep the service-role/secret key, database passwords and signing material server-only.
- Use secure, private caching defaults for authenticated responses. Cache the application shell separately from account-specific data. A public report token scopes a single revision and receives private, no-store responses.

## Proposed repository layout

~~~
app/                       App Router pages and HTTP Route Handlers
features/                  auth, workspace commands and the development visit preview
components/ui/             reusable field components
lib/supabase/              request-scoped server client and refresh helper
lib/offline/            IndexedDB, mutation queue and conflict handling
src/worker/                 job polling, PDF rendering and recurrence
supabase/migrations/        versioned SQL and access policies
supabase/tests/             database invariants and access tests
scripts/seed.mjs            opt-in fictional identities and two organizations
tests/                     unit, browser and temporary auth fixtures
scripts/                   versioned migration runner and database tests
deploy/                    app image, worker and deployment configuration
~~~

## Release and recovery

The M1a app image uses Node 22.23.1 with a pinned base-image digest, a lockfile install, standalone output and a non-root runtime. `.dockerignore` excludes `.env` files, test artifacts and Git metadata. Inject runtime values with the container environment; no database or Cloudinary credentials are build arguments. Pin Supabase image/Compose versions separately. Build and test the app image before the first VPS deployment. Apply reviewed migrations to a staging copy before production. For a live schema transition, expand first, release compatible code, backfill if required, then remove obsolete fields in a later migration. Roll back app and worker together to a schema-compatible version.

Persist PostgreSQL and storage files or an S3-compatible backing store across container replacement. Back up the database, file objects and recovery configuration off the VPS. Run a restore drill with a private photo and archived PDF. Log request, operation and revision IDs, job attempts, sync conflicts and render failures. Exclude report tokens, credentials, contact details and photo contents from logs.

References: [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Next.js environment variables](https://nextjs.org/docs/app/guides/environment-variables), [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started), [Supabase self-hosting](https://supabase.com/docs/guides/self-hosting/docker), [Compose networking](https://docs.docker.com/compose/how-tos/networking/).

### M3c worker runtime

`Dockerfile.worker` / `compose.worker.yml` run a separate non-root Node/Chromium consumer with pinned dependencies. Its dedicated verified Auth identity has no workspace memberships or SQL/service-role credentials. Cloudinary credentials stay server-side. The worker renders only frozen DTO/evidence references through the shared template, embedding bundled fonts and bounded photo derivatives while blocking browser network requests.

A write-once digest/size/renderer manifest precedes upload to a fixed private path. Recovery verifies and completes an existing object instead of overwriting bytes. Storage administration remains tooling-only via the guarded local Docker owner connection or an explicit admin URL. Test cleanup uses a separate operator client; neither helper enters runtime. See README for setup, container networking, shutdown and verification.

### M3d guest boundary

Guest routes use only the public Supabase client key and the raw per-request capability. They never reuse staff cookies or worker credentials. PostgreSQL hashes the token and authorizes the exact ready revision; private Storage repeats that authorization from a request header, allowing file GET only. The app proxies digest-verified PDF bytes and approved, bounded photo derivatives with no-store/no-referrer/noindex responses and rechecks permission after upstream fetches. No signed file URLs or elevated runtime credentials are needed. The installed Storage logger's header allowlist excludes the capability header; keep reverse-proxy and monitoring redaction aligned when deploying/upgrading. M3e adds explicit revision/link-bound receipts through the same capability boundary, without additional runtime credentials.

### M3e receipt boundary

The guest receipt endpoint uses the existing anonymous capability client and an append-only database command. It adds no privileged key, SQL connection, background job or notification. Receipt identity, consent version, exact link/revision and time are durable, while the original PDF stays immutable. Office receipt reads use the staff session and active organization authorization. Keep guest POST bodies and token-bearing paths out of request/APM logs; the request stores only the recipient fields needed for the operational receipt, with no fingerprint/IP collection.

### M3f versioned amendment rendering

Amendments are database transactions under the current office session; they do not reopen field writes or add elevated runtime credentials. Stable private item bindings join corrected operational findings to the predecessor's frozen identity/evidence. The existing worker supports v1 and v2 snapshots, with a renderer ID derived from the recorded template version. V2 adds correction reason/predecessor text; v1 output and archived bytes remain independently recoverable. Release the updated worker alongside the app before enabling v2 jobs. The fixed-path/digest protocol is unchanged for each revision.

### M3g action-state rendering compatibility

Office action commands use the same session-scoped Supabase boundary as scheduling; no new elevated runtime key or provider is introduced. New customer DTOs carry `actionStateVersion: 1`; the worker pins their renderer to `chromium-1255/2`, while legacy snapshots retain `chromium-1255/1`. Build/restart the worker alongside this release so new report jobs use the matching mapper/template contract. See [REPORTS.md](REPORTS.md).

### M4a public PWA shell and private working copies

`app/manifest.ts` supplies the install manifest/icons and starts at Today. `scripts/build-offline-shell.mjs` hashes the explicit public asset manifest plus worker template, then generates ignored `public/sw.js` and `public/offline/shell-version.json`. Dev, build, type-check and browser-test hooks prepare those files without additional dependencies or environment variables. Shell readiness checks both the semantic version and content revision, preventing a new release from accepting an older cached shell. Deploy the generated public directory alongside the matching Next standalone build.

The service worker caches only the public files named in `features/offline/shell-assets.json`, under `teren-shell-v<version>-<revision>`. It never caches authenticated HTML, RSC, API responses, Auth, guest reports, PDFs or photos. Native navigation to Today/one field visit uses no-store network reads with a bounded fallback to the data-free shell. A complete new shell installs before prior shell caches are removed; IndexedDB is untouched by shell activation.

The standalone shell uses a small static stylesheet so offline startup is independent of authenticated Next documents and their runtime chunks. Next controls retain the shared app/Tailwind components. Both viewers share the same browser storage implementation. Private visit snapshots and the active user/organization binding live only in IndexedDB; identity epochs and transition markers keep account/workspace changes isolated. See [FRONTEND.md](FRONTEND.md) and [BACKEND.md](BACKEND.md) for download and durable-draft boundaries. Physical-phone HTTPS/PWA storage and upgrade testing remains the M4f gate.

M4b compiles a standalone React editor and the shared typed IndexedDB module using the pinned development dependency `esbuild`. `npm run offline:build` generates `public/offline/v2/app.js`, `storage.js`, worker and revision metadata; generated outputs are ignored. The shell whitelist now contains nine public assets, including legacy v1 HTML/storage entry shims and existing icons. Version 2 shell activation leaves private IndexedDB records intact; opening the database upgrades schema 1 to 2 without deleting downloads. Normal dev/build/typecheck/e2e scripts prepare these assets. Deploy the generated public directory with the Next output. No private environment variables or auth/session responses enter these bundles/caches.

M4c adds an authenticated foreground replay endpoint and a private database receipt table (migration 038). The same request-scoped Supabase session executes both replay authorization and ordinary visit commands. Device schema 3 upgrades prior bundles/drafts without deletion and adds durable submissions. The public shell remains version 2 with a new content revision and the same nine public assets; sync bodies, responses and receipts never enter its Cache Storage whitelist. Foreground reconnect/manual sync has bounded request sizes and retry delays; it does not depend on service-worker background sync. No new environment variables or packages are required.
