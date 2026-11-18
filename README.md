# Customer service report

Issue one Serbian Latin service report per visit, with immutable numbered revisions. It is an operational record for a customer representative and for the next technician. Receipt, billing review, approval of additional spending and a statutory record are different events.

## Layout

| Section | Contents |
| --- | --- |
| Header on first page | Service company and contact, report number, revision, issue date, visit date/time, visit type and technician. Include customer, site name, address and optional contract/order reference. |
| Summary | Counts of planned, inspected and outstanding actions, followed by system code, room, outcome and next step. For a long visit, place critical findings and actions first; continue the complete table on later pages with repeated headers. |
| Per-system detail | Location, stable code, manufacturer/model, indoor/outdoor unit identifiers when available, reason for work, completed tasks, finding and parts/quantities. Include only relevant measurements, their units and operating context. |
| Outstanding work | Action, responsible party, accountable staff member where appropriate, deadline and whether customer approval or site access is pending. Record the due date separately from a proposed visit date. |
| Confirmation | Technician and recorded completion time; recipient name, role, time and manner of acknowledgement if already recorded at issuance, otherwise “Čeka potvrdu”. A later receipt is a separate timestamped record linked to this revision. |
| Footer and optional appendix | Report number, revision and page X/Y on each page. Include approved customer-visible photos with system labels and captions. Template controls any contract-specific signature block. |

Prefer one A4 page for a short residential visit and a summary plus detail pages for multi-system visits. Use searchable text, embedded fonts supporting č, ć, š, ž and đ, readable grayscale contrast, wrapping for long Serbian names/serials and consistent date/unit formatting. Avoid splitting a short system card across pages. Keep photos in a bounded appendix when that improves readability. Long tables may continue over several pages; never shrink the entire report to fit one page.

## Data and revision contract

1. Preview and issue through the same template and shared field mapping. Freeze an allowlisted customer DTO, public evidence references, locale, company branding, template version, issue time and issuer. Exclude access codes, internal notes, private photos, cost prices and authorization material.
2. A reading of zero prints as a measured zero with a unit. An unmeasured or inapplicable entry uses the recorded status. An inaccessible system has no inferred result. Customer-visible photos must have finished upload and be eligible for that revision.
3. Archive issued PDF bytes in private Storage with revision ID, digest and creation metadata. Later edits to customer contact, technician name, asset registers or branding cannot change the archived document. Sharing is enabled only after a successful render.
4. For a correction create a new revision with a reason and link to its predecessor. Existing links resolve to their original revision until revoked or expired. The office can share the corrected revision explicitly. Recipient acknowledgement is explicit, revision-bound and cannot authorize a repair.
5. Give a guest access through a revocable high-entropy link. Recheck permission for each view/download. A public report link does not expose the site register, other revisions or object-store listing.

## Pilot fixture

Use the fictional Jagodina example, work order `RN-2026-0142`, site `JA-02`. KL-01 and KL-02 were serviced. KL-03 was inspected, needs a replacement air deflector and is awaiting a quote. KL-04 was inaccessible in the locked archive. Expected totals are **4 planned, 3 inspected, 2 open actions**. The initial document is awaiting client receipt. This text is sufficient to implement the acceptance test even if the visual reference is unavailable.

[Visual reference with fictional data](https://chatgpt.com/library?file_id=libfile_eb8282a0320481918a057922ef2b2a1b&account_id=personal).

## Verification

M3b implements first issuance from the office review at `/visits/[visitId]/review`, with a frozen revision at `/office/reports/[revisionId]`. Draft preview and issuance use one database-owned allowlist, `hvac_private.customer_report_data`, and the same `features/reports/document.tsx` template. `features/reports/model.ts` describes the DTO. The former TypeScript field mapper has been removed to avoid two sources of truth. Before issuance, preview shows live data and the visit UUID; afterward it shows the frozen revision and its report number.

The issue transaction rechecks submitted status/version, every outcome/reading/part, active follow-up owners/deadlines and verified evidence. It allocates `RN-YYYY-NNNN` using the organization's time zone at issuance and an organization/year counter. Four digits are a minimum, so values above 9999 are not truncated. The counter, revision 1, unique render job, issued visit state and audit/operation receipt commit atomically. Concurrent first-issue requests converge on the same revision/job; the frozen issuer/time belong to the winning command.

Schema version 1 freezes company/customer/site identity, contact text available in the register, technician labels, work/results, zero/null reading states, materials, actions, evidence identity/version/format/dimensions/size, locale and template version. Branding currently freezes the company display name and default accent with a null logo; custom company contact/logo settings are not introduced here. Internal/access notes, internal/removed/unverified photos, cost-price fields and authorization material are excluded. The runtime has no update/delete permission on revisions. Later register/company changes cannot alter the stored snapshot, and field/photo commands reject issued work. Amendments are implemented below (M3f).

M3c renders the frozen DTO through the shared React template in a separate pinned Chromium worker. A4 print styles repeat table headers, keep short cards together and put approved photos in an appendix. DejaVu fonts (bundled with their license) support Serbian Latin and are embedded. Every page receives a searchable report/revision/page X/Y footer. The renderer blocks browser network requests and resolves only frozen authenticated Cloudinary identities, checking asset ID/version/format/dimensions/size before embedding bounded derivatives. Missing or changed evidence fails the job instead of silently omitting it.

The worker normalizes PDF dates/producer/IDs to frozen values and uses a deterministic footer font. A write-once SHA-256/size/renderer manifest is persisted before upload to the private fixed revision path. A restart recovers existing bytes by digest instead of overwriting them; pre-upload rerenders must match the manifest. Runtime Storage overwrite/delete and artifact metadata updates are denied. Office progress polls automatically, failed jobs offer a retry of the same revision, and ready artifacts can be downloaded through an authorized private/no-store route that verifies the archived digest. M3d adds scoped guest links as described below; receipt capture remains M3e.

The M3c integration suite exercises concurrent claims, stale tokens, three failures/manual retry, a simulated process crash immediately after upload, byte-for-byte recovery, source edits after issue, authenticated/anonymous direct Storage access, forbidden overwrite/delete, and the office flow at phone/desktop widths. Print fixtures issue real fictional 1/4/30-system revisions; the four-system PDF includes a synthetic equipment image uploaded to authenticated Cloudinary. Internal image captions and other private fields must remain absent. The development verification produced 1, 3 and 7 pages respectively (11 pages inspected), with repeated long-table headers, searchable Serbian text and embedded fonts. The four-system totals remain 4 planned / 3 inspected / 2 open actions. Generated PDFs and text/layout inspection commands are documented in README. Worker setup must precede the database worker tests. Stop any continuous consumer while checking queued states.

Render one-system, four-system and 30-system fixtures. Inspect every page for clipping, broken glyphs, missing table headers, unreadable photos and incorrect page numbering. Extract text to verify totals and the exact system identifiers. Compare the checksum of an archived PDF before and after a source-record edit and after a retry. In M3d/M3e, test revoked and expired guest links, and acknowledgement made after issuance. Add a regulatory export only after separately verifying the applicable Serbian form, scope, required fields and approval procedure.

## M3d guest delivery

An owner/coordinator opens a ready `/office/reports/[revisionId]`, chooses 1/7/30/90 days, creates a link and copies it for manual delivery. The database accepts 1–90 days. Raw 256-bit tokens are shown only during creation; after reload, staff can revoke existing links or create a new one. Only SHA-256 digests persist. Creating another link does not silently revoke earlier links. Revocation is explicit and audited; replay never reactivates a revoked link.

`/r/[token]` shows the frozen customer report without staff navigation or a sign-in requirement. Its PDF is the same archived artifact verified by digest/size. Approved customer photos are resolved only from that revision's frozen references, verified against Cloudinary, resized and stripped of metadata through the same image processor used by the worker. Internal photos and guessed photo IDs remain inaccessible. No mutable register reads or token-bearing provider URLs are exposed.

Every page/file request validates the raw token, deadline, revocation and ready revision. File handlers recheck after fetching bytes. Guest responses are private/no-store, no-referrer and noindex; token paths are excluded from Next development access logs. A separate anonymous Supabase client prevents a signed-in office session from broadening guest access. Storage RLS accepts the capability header for exact-file authenticated GET only; it denies listing, metadata probes, signed URLs and all guest writes. No elevated runtime key or additional guest credential is introduced. Existing downloaded bytes cannot be recalled; revocation denies subsequent requests.

Phone/desktop acceptance exercises use two distinct ready fictional revisions and a real authenticated Cloudinary fixture. They check manual creation/copy, queued/failed rejection, exact PDF checksum, approved/internal photo boundaries, raw Storage restrictions, expiry/revocation, replay and cross-organization/assigned/unassigned staff denial. Opening or downloading creates no acknowledgement, approval or billing event. Explicit receipt capture follows in M3e.

### M3d capability links

Migration `202611170025` adds private, RLS-protected `report_links`: organization/revision composite FK, unique token digest, actor/operation uniqueness, created/expiry time, bounded TTL and revocation actor/time. API roles have no raw table access. `create_report_link` and `revoke_report_link` require a currently verified owner/coordinator and serialize on the organization; creation requires a ready job plus artifact. Replay compares revision/digest/TTL and preserves identity/deadline. `report_links` exposes scoped status metadata without digests. Audit records carry link IDs, never raw tokens.

`guest_report` accepts a raw 43-character base64url capability and hashes it inside the security-definer boundary; a stored digest cannot be replayed as the bearer token. It returns exactly the ready frozen revision, its approved evidence references and archive metadata, or null for unavailable links. No receipt or view audit is written. Existing link targets do not follow a visit's latest revision.

The guarded Storage-owner setup installs anonymous SELECT policies using `guest_pdf_read`: a valid `x-report-token` header must match the object's ready artifact and the live link. The installed Storage API supplies transaction-local `request.headers` and `storage.operation`; only `storage.object.get_authenticated` is allowed. Restrictive policies deny broader list/sign/S3/metadata access and guest writes even if an older permissive policy exists. Anonymous API clients still cannot name private-schema helpers directly. This contract was exercised through the actual Storage API; keep those tests when upgrading the self-hosted distribution. No service-role key enters guest runtime.

### M3d guest report paths

Office Server Actions derive organization from the verified active workspace, validate the creation form, hash a server-generated 256-bit token and call `create_report_link`. The stable form token/operation make lost-response retries idempotent. Existing link status/revocation is available on the same revision page; raw links can be copied only when created. Default expiry is seven days; supported duration is 1–90 days. Links are delivered manually.

`GET /r/[token]`, `/r/[token]/pdf` and `/r/[token]/photos/[photoId]` use a fresh anonymous public-key client, independent of staff cookies. `guest_report` reauthorizes each request; invalid/expired/revoked links show a neutral unavailable page, while file endpoints return 404. PDF delivery uses the shared archived-byte verifier; photos use the shared frozen-reference image processor. File handlers recheck the capability after provider/Storage fetches. There are no signed download URLs, receipt POSTs or email side effects. Proxy response headers apply private/no-store, no-referrer and noindex to all guest routes, including failures. Production reverse-proxy/access logging must redact the full `/r/` path and the `x-report-token` header.

### M3d guest boundary

Guest routes use only the public Supabase client key and the raw per-request capability. They never reuse staff cookies or worker credentials. PostgreSQL hashes the token and authorizes the exact ready revision; private Storage repeats that authorization from a request header, allowing file GET only. The app proxies digest-verified PDF bytes and approved, bounded photo derivatives with no-store/no-referrer/noindex responses and rechecks permission after upstream fetches. No signed file URLs or elevated runtime credentials are needed. The installed Storage logger's header allowlist excludes the capability header; keep reverse-proxy and monitoring redaction aligned when deploying/upgrading. M3e will add explicit revision/link-bound receipts.

### M3d office and recipient flow

A ready office revision includes **Link za klijenta**, a duration selector, **Napravi link za klijenta**, one-time **Kopiraj link**, and current link statuses with **Opozovi link**. The UI explains manual delivery and that opening/downloading does not acknowledge receipt. Because raw tokens are not stored, reloading permits creation of a new link rather than recovery of the old URL. Queued/failed reports have no sharing control.

The signed-out `/r/[token]` page contains the customer report, **Preuzmi PDF** and approved photo captions/images, with no staff navigation or receipt form. Expired/revoked links show **Link nije dostupan** and require a new link from the service team. Each PDF/photo request rechecks access. Guest content must not enter a future service-worker/offline cache. The same report template retains 4 planned / 3 inspected / 2 open actions at phone and desktop widths. Explicit receipt UX remains M3e.

## Customer links (M3d)

After migrations, rerun `npm run worker:configure` to install the updated download-only Storage policies. No new credentials are needed. Open a ready report in **Kancelarija**, choose the link duration under **Link za klijenta**, click **Napravi link za klijenta**, then **Kopiraj link**. Send the link manually. Recipients can open the frozen report, view its approved photos and download its PDF without signing in. **Opozovi link** stops subsequent page/file requests. Creating a second link leaves the earlier link active until it expires or is revoked.

Copy the URL when created: only its hash persists, so it cannot be recovered from the link list after reload. The default duration is seven days, with 1/7/30/90-day UI choices. Link creation is unavailable until rendering succeeds. Opening/downloading does not record receipt, approve a repair or change billing state. M3e adds the optional acknowledgement described below; M3f amendments are available below; M3g action management is available below.

Run `npm run test:db` and `npm run test:e2e -- tests/guest-reports.spec.ts --workers=1` with the development fixtures/worker configuration present. Stop the continuous queue consumer during browser tests as described above, then restart it afterward. Tests use two fictional ready revisions and a private synthetic Cloudinary photo, and clean up only their own records/files. Reverse-proxy logs must redact `/r/` token paths and `x-report-token`; guest content is private/no-store and must not be cached by a future service worker.

## Customer receipt (M3e)

Apply migrations, then open a valid customer link. After the report, enter **Ime i prezime** and **Uloga kod klijenta**, check the statement and select **Potvrdi prijem izveštaja**. The result persists across reloads and retries. The office revision has **Prijem izveštaja** and **Osveži potvrde**. Acknowledgement is optional and confirms receipt only; it does not approve a repair, expense or billing. Archived bytes remain unchanged.

A matching retry returns the original record; changed recipient details cannot replace it. Each link has at most one receipt and remains tied to its original revision. Expired/revoked links cannot submit or replay, while office staff retain the historical receipt. Guest names/roles are self-entered and do not create a staff identity.

Run `npm run test:db` and `npm run test:e2e -- tests/report-receipts.spec.ts tests/guest-reports.spec.ts --workers=2` with the fictional fixtures and the continuous worker stopped as described above. Tests cover native/HTTP consent validation, concurrent retries, revision binding, office refresh, role isolation and unchanged PDFs/business state. The revision-2 SQL fixture verifies old-link binding independently of the amendment UI. M3f now implements that workflow; M3g action management is available below.

## Report amendments (M3f)

Apply migrations and rebuild the worker with the updated source (`docker compose -f compose.worker.yml up -d --build`). On the latest office report select **Ispravi izveštaj**, enter a reason visible to the customer and correct the system results. Select **Pregledaj ispravku**, review the full document, then **Izdaj reviziju N**. The new revision renders separately; create its customer link explicitly when ready. Use **Istorija revizija** to open the original or latest report. The original PDF, links and receipts remain attached to their original revision and can be revoked independently.

The editor covers findings/work, outcomes, readings/materials and follow-ups for every existing system. It preserves frozen customer/site/equipment identity, branding, visit times and approved photos; register editing remains M5a. Original technician attribution and private notes are retained, and office corrections have their own actor/time and audit. Legacy reports with no complete item binding fail closed for amendment; reconcile their original item identities operationally before retrying.

Run `npm run test:db`, `npm run test:e2e -- tests/report-amendments.spec.ts --workers=1` and `REPORT_WORKER_IMAGE=hvac-saas-report-worker npm run test:worker-container` after building that worker image. Stop the continuous consumer during queued-state tests and restart it afterward. The container check now renders both v1 and amended v2 and verifies the original digest. Browser tests write original/amended PDFs under `/tmp/hvac-amendment-review` for page/text inspection. M3g action management is available below.

## Follow-up actions (M3g)

After a visit is submitted or issued, open **Sledeće radnje** in the office navigation. Open **Priprema ponude** to assign an active team member, change its deadline, and record explicit completion with an internal note. Use **Otvori izvorni sistem** to return to the finding. Open repair/revisit actions can book one return visit for their source system through **Zakaži povratnu posetu**. The appointment is separate from the action deadline, and booking leaves the action open. The assigned return technician sees the relevant source finding.

Apply `npm run db:migrate` (through migration 035), then rebuild/restart the report worker. Runtime uses the existing Supabase session/public key. No additional environment variables are needed. Issued reports, PDFs, guest links and receipts stay frozen after operational changes. Completed action state appears only in a newly issued report or amendment; completion notes remain internal. Quote approval/invoicing and full M5g queues remain outside this slice.

Verification: `npm run test:db` includes action lifecycle, returned drafts, booking convergence, revoked access and tenant isolation. `npm run test:e2e -- tests/follow-up-operations.spec.ts --workers=2` covers the office journey at 390px/1440px and writes original/amended PDFs under `/tmp/hvac-follow-up-review` for inspection. Pause the continuous worker during these explicit job-claim tests and restart it afterward. M4a read-only downloads are implemented below.

M3g checks actually run: migration application through 035; all 12 rollback SQL suites; lint, type checking, four unit files and the production build; phone/desktop follow-up, register/scheduler, issuance, field handover and amendment browser scenarios; rebuilt non-root worker/container rendering; and PDF text/page plus phone/desktop screenshot inspection. The final follow-up/register run used the standalone production server. The development preview soft navigation stalled in issuance reruns; the same issuance/preview scenarios passed on the standalone production server. `/preview` returned 404 in production.

## Download assigned visits (M4a)

Open **Danas** online in a supported browser on HTTPS (localhost also works). Wait for the account/workspace confirmation, then choose **Preuzmi za rad bez veze** on an assigned visit. Wait for **Dostupno bez veze · samo pregled** before disconnecting. The normal browser installation menu can add Teren to the home screen.

After disconnecting and closing/reopening the browser/app, Today lists downloaded visits for the last verified account/workspace. Open **Otvori preuzetu posetu** to read its systems, outcomes, readings, materials, actions and source finding. Opening an undownloaded visit shows a clear unavailable state. **Ukloni sa telefona** works from Today or the offline list; **Preuzmi ponovo** refreshes a snapshot online. Failed refresh/removal keeps the previous committed copy. Download timestamps identify potentially stale data.

Account/workspace switches hide other partitions, and logout clears read-only copies while retaining committed pending drafts in locked partitions. A successful reconnect checks the current assignment inventory and removes withdrawn downloads. Private photos, editing and offline submission are not part of M4a. M4b durable drafts are implemented below; replay/photo work follows in later tickets.

Apply `npm run db:migrate` through 037. No new credentials are required. M4b adds the pinned esbuild development dependency; install from the lockfile. `npm run offline:build` prepares the public worker and revision metadata; normal dev/build/typecheck/e2e scripts run it automatically. After changing public shell assets during a running development session, run it again to update the content revision. Do not edit the generated files. The worker caches only nine public shell files; private snapshots remain in partitioned IndexedDB.

Run `npm run test:db`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e -- tests/offline-visits.spec.ts --workers=2`. The offline browser suite uses a temporary persistent Chromium profile, closes the entire browser process, reopens it with the connection disabled, and checks 4/3/2 totals, missing downloads, removal, quota/refresh failures, cross-tab identity changes, second-workspace isolation and withdrawn assignments. It deletes its fictional fixtures and temporary profiles afterward. Real iOS/Android installation, physical airplane mode and storage-pressure checks have not been performed here; they remain the M4f device gate. Next: **M4d — Durable photo outbox**.

M4a checks actually run: migrations through 037; all 13 rollback SQL suites; type checking, lint, four unit files and the production build; all 22 production browser cases across offline visits, authentication, workspace commands, register/scheduling and field handover at 390px/1440px. Inspected offline and isolated-state screenshots. Production HTTP checks covered service-worker no-store/MIME headers, install manifest/icons, shell CSP, anonymous download denial and the existing `/preview` 404. Offline isolation tests use their own temporary organizations to avoid shared-roster interference.

## Durable field drafts (M4b)

Download an assigned scheduled/in-progress visit on **Danas**, then choose **Otvori preuzetu posetu**. Every edit saves on this device; the status changes to saved only after its IndexedDB transaction commits. Restart the browser offline to recover the forms. **Pripremi za slanje** prepares an unsent, validated payload; it does not deliver it to the office. Sending and server acknowledgements are now implemented in M4c below. Private photo blobs remain M4d.

Pending drafts block replacement/removal of the visit and the ordinary online form. Explicit per-system discard is available. Signing out locks committed work rather than deleting it; sign in again as the same authorized user/workspace to continue. See [FRONTEND.md](FRONTEND.md) for attribution, versions, operation IDs, queue rules and failure states. Run `npm run test:e2e -- tests/offline-drafts.spec.ts tests/offline-visits.spec.ts tests/visit-handover.spec.ts --workers=2` against the production build for restart, storage-failure, queue, isolation and online regression coverage at phone/desktop widths. Physical-device lifecycle checks remain M4f.

M4b checks actually run: type checking, lint, five unit files, all 13 rollback database suites, production Webpack build, and eight browser cases across offline drafts/downloads and online field handover at 390px/1440px. The draft cases cover schema-1 upgrade, two-system offline editing, full browser restart with exact recovery, zero/null readings, incomplete owners, decimal parts, storage-write failure/retry, immutable queued payloads, logout/account isolation, workspace restoration and competing-tab revision checks. Phone/desktop screenshots were inspected. The normal Turbopack build failed on a denied compiler port in this environment; `npm run build -- --webpack` passed. Both bundlers exclude the development preview fixture from production. No physical-device installation or airplane-mode checks were run; those remain M4f.

## Send offline fieldwork to the office (M4c)

Apply `npm run db:migrate` through 038. No new credentials are needed. In the downloaded visit:

1. Edit each system and wait for **Sačuvano na telefonu**.
2. Choose **Pripremi za slanje** for each edited system.
3. To hand the completed visit to the office, choose **Pripremi predaju kancelariji**. Resolve any pending item or missing follow-up owner/deadline first.
4. Restore internet with the app open, or press **Sinhronizuj sada**. Item changes are confirmed individually; the queued submission waits for all of them. Only a server-confirmed submission appears in office review.

A queued draft can be sent without submitting the visit. Lost responses reuse the same operation ID; failed operations remain on the phone. If a conflict appears, retain the draft; the comparison/reconciliation flow is M4e. Offline photo blobs remain M4d. Foreground retry is bounded; reopen Today/the downloaded visit or press manual sync to resume later. Do not clear browser storage while pending work remains.

Verification commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build -- --webpack`, and production `npm run test:e2e -- tests/offline-sync.spec.ts tests/offline-drafts.spec.ts tests/offline-visits.spec.ts tests/visit-handover.spec.ts --workers=2`. Tests use fictional fixtures and remove their replay receipts as part of cleanup. Device schema 3 upgrade preserves existing downloads/drafts. Physical-device/background lifecycle validation remains M4f.

M4c checks actually run: additive migration 038 applied; all 14 rollback SQL suites; type checking, lint and six unit files; production Webpack build; all 16 production browser cases at 390px/1440px across synchronization, durable drafts, downloads/isolation and online handover. Lost save/submission responses were discarded after real commits and retried across a full browser restart with identical operation IDs. Tests confirmed original acknowledgements, one intended version increment, retained drafts after failed acknowledgement writes, earlier successes surviving later malformed/conflicting operations, submission dependency blocking, 4/3/2 totals and office visibility. Phone/desktop screenshots were inspected. No physical iOS/Android or closed-app background-sync checks were run.
