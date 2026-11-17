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

Schema version 1 freezes company/customer/site identity, contact text available in the register, technician labels, work/results, zero/null reading states, materials, actions, evidence identity/version/format/dimensions/size, locale and template version. Branding currently freezes the company display name and default accent with a null logo; custom company contact/logo settings are not introduced here. Internal/access notes, internal/removed/unverified photos, cost-price fields and authorization material are excluded. The runtime has no update/delete permission on revisions. Later register/company changes cannot alter the stored snapshot, and field/photo commands reject issued work. Amendments remain M3f.

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

Copy the URL when created: only its hash persists, so it cannot be recovered from the link list after reload. The default duration is seven days, with 1/7/30/90-day UI choices. Link creation is unavailable until rendering succeeds. Opening/downloading does not record receipt, approve a repair or change billing state. M3e adds the optional acknowledgement described below; M3f is the next ticket.

Run `npm run test:db` and `npm run test:e2e -- tests/guest-reports.spec.ts --workers=1` with the development fixtures/worker configuration present. Stop the continuous queue consumer during browser tests as described above, then restart it afterward. Tests use two fictional ready revisions and a private synthetic Cloudinary photo, and clean up only their own records/files. Reverse-proxy logs must redact `/r/` token paths and `x-report-token`; guest content is private/no-store and must not be cached by a future service worker.

## Customer receipt (M3e)

Apply migrations, then open a valid customer link. After the report, enter **Ime i prezime** and **Uloga kod klijenta**, check the statement and select **Potvrdi prijem izveštaja**. The result persists across reloads and retries. The office revision has **Prijem izveštaja** and **Osveži potvrde**. Acknowledgement is optional and confirms receipt only; it does not approve a repair, expense or billing. Archived bytes remain unchanged.

A matching retry returns the original record; changed recipient details cannot replace it. Each link has at most one receipt and remains tied to its original revision. Expired/revoked links cannot submit or replay, while office staff retain the historical receipt. Guest names/roles are self-entered and do not create a staff identity.

Run `npm run test:db` and `npm run test:e2e -- tests/report-receipts.spec.ts tests/guest-reports.spec.ts --workers=2` with the fictional fixtures and the continuous worker stopped as described above. Tests cover native/HTTP consent validation, concurrent retries, revision binding, office refresh, role isolation and unchanged PDFs/business state. The revision-2 SQL fixture verifies old-link binding without implementing M3f amendments. Next: **M3f — Amend an issued report**.
