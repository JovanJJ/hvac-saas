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

Schema version 1 freezes company/customer/site identity, contact text available in the register, technician labels, work/results, zero/null reading states, materials, actions, evidence identity/version/format/dimensions/size, locale and template version. Branding currently freezes the company display name and default accent with a null logo; custom company contact/logo settings are not introduced here. Internal/access notes, internal/removed/unverified photos, cost-price fields and authorization material are excluded. The runtime has no update/delete permission on revisions. Later register/company changes cannot alter the stored snapshot, and field/photo commands reject issued work. M3f amendments are described below.

M3c renders the frozen DTO through the shared React template in a separate pinned Chromium worker. A4 print styles repeat table headers, keep short cards together and put approved photos in an appendix. DejaVu fonts (bundled with their license) support Serbian Latin and are embedded. Every page receives a searchable report/revision/page X/Y footer. The renderer blocks browser network requests and resolves only frozen authenticated Cloudinary identities, checking asset ID/version/format/dimensions/size before embedding bounded derivatives. Missing or changed evidence fails the job instead of silently omitting it.

The worker normalizes PDF dates/producer/IDs to frozen values and uses a deterministic footer font. A write-once SHA-256/size/renderer manifest is persisted before upload to the private fixed revision path. A restart recovers existing bytes by digest instead of overwriting them; pre-upload rerenders must match the manifest. Runtime Storage overwrite/delete and artifact metadata updates are denied. Office progress polls automatically, failed jobs offer a retry of the same revision, and ready artifacts can be downloaded through an authorized private/no-store route that verifies the archived digest. M3d adds scoped guest links as described below; M3e receipt capture is described below.

The M3c integration suite exercises concurrent claims, stale tokens, three failures/manual retry, a simulated process crash immediately after upload, byte-for-byte recovery, source edits after issue, authenticated/anonymous direct Storage access, forbidden overwrite/delete, and the office flow at phone/desktop widths. Print fixtures issue real fictional 1/4/30-system revisions; the four-system PDF includes a synthetic equipment image uploaded to authenticated Cloudinary. Internal image captions and other private fields must remain absent. The development verification produced 1, 3 and 7 pages respectively (11 pages inspected), with repeated long-table headers, searchable Serbian text and embedded fonts. The four-system totals remain 4 planned / 3 inspected / 2 open actions. Generated PDFs and text/layout inspection commands are documented in README. Worker setup must precede the database worker tests. Stop any continuous consumer while checking queued states.

Render one-system, four-system and 30-system fixtures. Inspect every page for clipping, broken glyphs, missing table headers, unreadable photos and incorrect page numbering. Extract text to verify totals and the exact system identifiers. Compare the checksum of an archived PDF before and after a source-record edit and after a retry. In M3d/M3e, test revoked and expired guest links, and acknowledgement made after issuance. Add a regulatory export only after separately verifying the applicable Serbian form, scope, required fields and approval procedure.

## M3d guest delivery

An owner/coordinator opens a ready `/office/reports/[revisionId]`, chooses 1/7/30/90 days, creates a link and copies it for manual delivery. The database accepts 1–90 days. Raw 256-bit tokens are shown only during creation; after reload, staff can revoke existing links or create a new one. Only SHA-256 digests persist. Creating another link does not silently revoke earlier links. Revocation is explicit and audited; replay never reactivates a revoked link.

`/r/[token]` shows the frozen customer report without staff navigation or a sign-in requirement. Its PDF is the same archived artifact verified by digest/size. Approved customer photos are resolved only from that revision's frozen references, verified against Cloudinary, resized and stripped of metadata through the same image processor used by the worker. Internal photos and guessed photo IDs remain inaccessible. No mutable register reads or token-bearing provider URLs are exposed.

Every page/file request validates the raw token, deadline, revocation and ready revision. File handlers recheck after fetching bytes. Guest responses are private/no-store, no-referrer and noindex; token paths are excluded from Next development access logs. A separate anonymous Supabase client prevents a signed-in office session from broadening guest access. Storage RLS accepts the capability header for exact-file authenticated GET only; it denies listing, metadata probes, signed URLs and all guest writes. No elevated runtime key or additional guest credential is introduced. Existing downloaded bytes cannot be recalled; revocation denies subsequent requests.

Phone/desktop acceptance exercises use two distinct ready fictional revisions and a real authenticated Cloudinary fixture. They check manual creation/copy, queued/failed rejection, exact PDF checksum, approved/internal photo boundaries, raw Storage restrictions, expiry/revocation, replay and cross-organization/assigned/unassigned staff denial. Opening or downloading creates no acknowledgement, approval or billing event. M3e adds the explicit receipt form described below.

## M3e explicit receipt

The recipient can optionally acknowledge receipt after reading the report by entering name and role, checking the initially unchecked statement and clicking **Potvrdi prijem izveštaja**. Statement version `receipt-v1` confirms receipt of the displayed report number/revision only. It does not approve a repair, quote, expense or billing. Viewing, downloading and selecting fields alone have no side effect.

The append-only receipt records the exact organization, link, revision, self-entered name/role, server timestamp, method `guest_link` and statement version. The same valid link/payload replays the original result; different details conflict rather than overwrite it. Different links can have independent receipts. Guest views expose only their own link's receipt. Office owners/coordinators see every receipt for that revision, including after link revocation, and can use **Osveži potvrde** to fetch new acknowledgements.

Receipt submission rechecks live link expiry/revocation and ready artifact under the same organization-then-link lock order as office revocation. Expired/revoked links cannot submit, including replaying a previously successful request. A later receipt on an old link remains attached to its original revision. The recorded guest identity is self-entered, not a verified staff identity; the immutable receipt row retains that evidence without inventing a staff audit actor. No source record or archived PDF is modified. The frozen report can still contain its issuance-time pending-confirmation text; the separate live receipt explains that it is a later record.

SQL tests exercise a receipt for revision 1 after an operator-created revision-2 fixture exists; the real amendment UI/command is implemented in M3f below. Browser/API tests cover no view side effects, required consent/name/role, concurrent creation and lost-response retries, changed-payload conflict, office refresh, private reads, expiry/revocation and unchanged visit/actions/snapshot/PDF checksum at phone and desktop widths.

## M3f amendments

An owner/coordinator opens the latest issued revision, chooses **Ispravi izveštaj**, enters a customer-visible reason, and edits the complete set of system outcomes, findings/work, no-access reasons, readings, materials and follow-ups. **Pregledaj ispravku** displays the complete replacement through the shared template; **Izdaj reviziju N** commits it. At least one operational value must change. Current customer/site/equipment register data, branding, visit identity/times, planned flags and approved photos are not silently refreshed: their frozen predecessor values are retained. Register editing remains M5a; new attendance belongs to a new visit.

The amendment keeps the visit's report number and appends the next revision, linked to its predecessor with actor/time/reason and before/after corrections. It preserves the technician's original entered-by/time and internal notes. Office correction attribution is separate and visible on the read-only visit. Unchanged readings/materials preserve their private operational metadata; the shared customer allowlist still excludes it. A private revision/item/position binding keeps correspondence stable even if register codes change. Legacy binding backfill requires a complete code match; otherwise amendment is unavailable until operator reconciliation, rather than guessing identities.

The office shows exact revision labels, history and the newest revision link; old revisions cannot start a new amendment. Latest is derived from the highest revision number committed atomically with the new snapshot/job and visit version. Amendments use template `service-report-v2`, which adds the reason/predecessor to the PDF; original v1 rendering remains supported. Rendering retries and failures remain independent per revision. A new revision is shared explicitly after its own PDF is ready. Old links and receipts retain their exact revision, and can be revoked independently. A late receipt through an old live link remains an old-revision receipt. No prior snapshot/PDF/receipt is overwritten.

Verification covers reviewed four-system corrections at phone/desktop widths, missing reason/owner, direct API rollback/stale/replay/permission checks, original identity/evidence retention, private metadata preservation, original author versus office actor, and a crash after uploading the v2 artifact. It compares original PDF checksums and receipts, exercises late old-link receipt and independent revocation, and renders both v1/v2 in the non-root worker container. Inspect all generated revision pages, including the v2 correction header and approved photo appendix.

### M3g operational action state and issued history

Assignment, deadline, completion and return booking change operational actions only. Issued snapshots, archived PDFs, links and receipts remain unchanged. New snapshots include `actionStateVersion: 1` and an allowlisted follow-up state/completion time; totals count open actions only. Customer output labels completed actions **Završena radnja**, while internal completion notes and actor IDs remain private. An amendment preserves live completed status and historical owner labels; office-managed actions cannot be replaced through its finding editor.

The worker renderer suffix is `/2` for action-state snapshots and remains `/1` for legacy snapshots without the marker. Existing v1/v2 template identifiers remain supported, with unchanged legacy output. Restart/rebuild the dedicated worker when deploying these migrations/application changes.


## M5a register maintenance boundary

Editing/archiving customers, sites, systems or physical components changes operational register data only. A replacement preserves the stable system ID and archives the old component; issued revisions and archived PDF bytes are never rewritten. Future field views, unissued previews and first-issue snapshots prefer the site's contact over customer contact when provided. Existing frozen contact/identity/model/serial values remain unchanged. This changes no PDF template, renderer or artifact version. The equipment browser acceptance issues a real four-system revision, replaces/archives equipment and edits customer/site/system metadata, then compares both the frozen revision and downloaded PDF SHA-256 with their original values.


M5b permits schedule changes only before submission. Issued/submitted visits reject reschedule, reassignment and cancellation even when a caller supplies their current version. Cancellation preserves recorded draft work for office review without issuing a customer report or closing its actions. No renderer, template, archive, guest link or receipt changes are introduced.

M5d import application changes only the reviewed operational system metadata. Matched system IDs/codes/site relationships, visit findings/authors and physical components are preserved. Issued snapshots and archived PDFs are not regenerated or rewritten; unissued views continue to use current register metadata under the existing rules. The import browser acceptance issues/renders a real fictional revision before application, compares its frozen DTO and downloaded PDF SHA-256 afterward, and compares full finding records. No template, renderer or revision-format change is introduced.
