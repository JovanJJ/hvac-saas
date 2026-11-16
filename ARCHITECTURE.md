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

M3b stores immutable customer snapshots and a durable, uniquely keyed PDF queue row in one database transaction under the caller's session. Preview and issuance share the SQL allowlist and `features/reports/document.tsx` template. No worker process or PDF artifact is implemented yet: M3c will add the dedicated worker/container, read only frozen snapshots/evidence references, and archive verified bytes in Supabase private Storage. Queued issuance does not enable download or guest sharing and adds no new runtime credential or SQL connection to user requests.

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
