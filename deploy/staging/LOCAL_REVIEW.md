# M6a local feasibility review — 23 November 2026

Status: **local preparation only; M6a acceptance remains pending**. The owner has no staging VPS and requested a local feasibility review before further setup. No staging Compose project, database, public listener, worker loop or deployment has been started. Existing development containers and volumes were not restarted, reconfigured or deleted.

## Observed environment

- WSL/Linux x86-64, 12 logical CPUs, approximately 7.7 GiB RAM; approximately 3 GiB available during the review and 2 GiB configured swap.
- Project filesystem: approximately 209 GiB free. Docker reports approximately 17 GiB images and 14 GiB build cache; these are retained, not pruned.
- Docker Compose 5.6.1. The existing Supabase distribution uses Envoy (`api-gw`), PostgreSQL 17 and persistent host directories for database/storage. It is a copied distribution, not a Git checkout; no upstream commit identity has been established.
- The existing API/pooler publish host ports; a staging override must remove those publications and restrict public API routing. Do not apply that override to development.
- ADB/Android emulator were not found in the checked WSL PATH or conventional Android SDK paths. Windows-host installations were not audited.

## Checks actually completed

- Built separate local images `hvac-staging-web:m6a-local`, `hvac-staging-worker:m6a-local` and `hvac-staging-tools:m6a-local`. The web Dockerfile uses the repository's verified Webpack production build; no runtime environment files were build inputs.
- Validated `deploy/staging/Caddyfile` in a temporary Caddy 2.10.2 container with network disabled and no published ports. This proves syntax/config provisioning, not live HTTPS or routing acceptance.
- Ran unit tests and lint; the private Supabase transport URL override has positive/negative coverage. Existing public URL/key configuration remains supported.
- Added private staging env/build-context exclusions. Actual runtime credentials remain outside the repository.

## Work that can be done locally next

1. Finish and validate the draft Compose/env boundaries, resolve/pin all Supabase and release image digests, and define exact local startup/stop/upgrade commands.
2. Create an isolated local staging project with separate Supabase secrets, database/storage directories, networks and ports. Never share development data volumes, the worker service identity or its evidence verifier with that isolated instance. Run builds and browser tests sequentially; avoid adding an emulator to both full stacks at once on the observed memory budget.
3. Add trusted local HTTPS and exercise the containerized app/API, signup/recovery through a local mail inbox, private photos, PDF issuance, guest receipt and offline reconnect. Local TLS requires host/browser/phone trust and reachable app/API addresses; a successful HTTP development test is not the HTTPS gate.
4. Replace only the isolated staging containers and verify that its records, photos/PDF references, archived PDF bytes and pending device work remain usable. Rehearse app/worker rollback with compatible schema; do not reverse applied migrations or delete volumes.
5. Use a real Android phone for the remaining physical camera/network/process/storage checks. Emulator results supplement but do not close the physical-device checklist in OFFLINE_VALIDATION.md.

Public DNS/ACME, real remote reachability/firewall, external SMTP delivery and actual VPS operations remain unverified until a remote target is available. Local successful scenarios must be recorded separately from those gates. The current Compose files and env templates are drafts, not an approved or completed staging release.
