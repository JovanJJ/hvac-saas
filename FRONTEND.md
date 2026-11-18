# Field and office experience

The primary mobile journey is “Danas” → site → system → outcome → visit summary. Use Serbian Latin for field labels and plain language for errors. Separate the technician's daily work from the office review queue. The same responsive application supports both.

M2b provides this journey online at `/today` → `/visits/[visitId]`, with per-system saved states and a submission summary. Office staff use `/office` → `/visits/[visitId]/review` → `/visits/[visitId]/preview`, or return work with a required reason. The draft customer preview is HTML with print styles; issuance is M3. Saving a pending or incomplete draft is allowed, but submission names unresolved systems and missing action owners/deadlines. Unsaved form data is retained after validation errors; only confirmed server saves survive reload. Durable offline drafts and conflict reconciliation remain M4.

M3a adds a labeled photo panel per system with file selection, required caption and explicit “Za klijenta”/“Interno” choice. It distinguishes reserved upload, verified image and removal; failed uploads keep the selected File and stable reservation while the page stays open. After reload, a pending reservation offers verification retry or removal; unuploaded bytes are not durably retained until M4d. Pending-photo counts block the ready-to-submit message. Private image elements bypass shared image optimization, include dimensions to prevent collapsed lazy-loaded images, and reauthorize through the app on each request.

M3b adds **Izdaj izveštaj** to the office review of a submitted visit. Its form explains that issuance locks the captured data. Success opens `/office/reports/[revisionId]`, showing the report number/revision, frozen content, issuer/time and the separate **PDF čeka izradu** state. The office home lists recent issued records, and the visit links back to its issued revision. Issued visits show read-only field/photo panels and no pre-issue correction form. Preview and revision reuse one document component; after issuance the preview also reads the frozen snapshot. There is no sharing/download control before M3c rendering succeeds.

## Screens and journeys

| Screen | Required behavior |
| --- | --- |
| Sign-in and onboarding | Owner creates a workspace, sets company name and local time zone, imports the first site or enters one manually. Solo users can assign a visit to themselves. Invited technicians land directly on Today. |
| Today | Time, site, address, site contact, count of systems, access note and offline availability. Tap to call or navigate. Show previously downloaded assignments when disconnected. |
| Site and equipment | Search by system code, room/position or serial. Open the previous finding, last service and plate photo. Show which physical units belong to the system. A system awaiting a part remains identifiable at the next visit. |
| Field form | One card per system. Use visit-type templates for maintenance, repair and installation. Make work done and outcome easy to enter; reveal reading, unit, mode, material, photo/caption and follow-up fields when needed. Record outcomes deliberately. |
| Visit summary | Count planned and inspected systems separately, list unfinished items and required follow-ups, identify the pending photo or missing owner that blocks submission. Solo owners can proceed to issue after a successful submission. |
| Office workspace | Day/week schedule, assignment, recurrence, customer/site register and import preview. Provide separate queues for missing confirmations, follow-ups, return appointments and billing review. Each row links to its underlying finding. |
| Report and receipt | Staff preview the final layout, issue, share and revoke a link. Recipients can read or download without signing in and choose whether to acknowledge receipt. Present report details before asking for acknowledgement. |

## Offline scope

Use a service worker for versioned application-shell assets and IndexedDB for explicitly downloaded visit bundles, edit operations and pending photos. Ordinary browser HTTP caches are unsuitable for private visit bundles. Partition device records by signed-in account and organization. Do not cache office exports or guest links. An initial authenticated online download is required; show readiness per visit and warn if pending photos or storage limits make it incomplete.

Show states in words as well as icons: “Dostupno bez interneta”, “Sačuvano na telefonu”, “Slanje u toku”, “Sinhronizovano”, “Potrebna provera”. Save each meaningful field change to local storage. Queue stable operation IDs and base versions; replay when the app is active and online, including an explicit retry action. Support closing and reopening the app. Do not promise synchronization while the browser is closed.

Remove confirmed local operations after server acknowledgement. For conflicting work show the local and server values, who changed the record if available and an explicit resolution action. Do not silently overwrite either copy. Expired sessions prompt reauthentication before upload. On reassignment/access denial lock editing and remove stale accessible data; never send the draft using a different user or organization. On logout warn about unsynced work and allow sync first or explicit discard, then clear private device data. Explain that revocation takes effect on an offline device when it reconnects.

## Field usability and acceptance

- Prioritize the day's task and room label over internal IDs. Large touch targets, readable contrast, explicit labels, keyboard operation, visible focus and non-color status cues are baseline requirements.
- Keep “not measured” distinct from numeric zero. Support Serbian decimal comma input, normalize on submission and present units next to the value. Keep field values when validation fails.
- Ask once for site/visit details and reuse them across its systems. For a no-access item ask for the reason and next action instead of opening measurement fields.
- Accept camera and file input with a clear preview. Show storage failure immediately and preserve the existing draft if a new photo cannot be saved.
- Validate on a narrow phone, an office desktop, a keyboard-only session, and a real phone going offline and reconnecting. Test both compact single-system and long multi-system visits. Time the actual workflow with pilot users before setting a speed target.

See [BACKEND.md](BACKEND.md) for the sync protocol and [REPORTS.md](REPORTS.md) for exported content. References: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [WCAG quick reference](https://www.w3.org/WAI/WCAG22/quickref/).

### M3c archive progress

Office revisions poll while **Čeka izradu PDF-a** or **PDF se izrađuje**, then expose **Preuzmi PDF** only for a ready archive. After bounded failures, **Ponovi izradu PDF-a** retries the same frozen revision. Source edits do not change its preview or archived bytes. The shared report template prints an A4 summary table with repeated headers, short system cards, a bounded photo appendix, embedded Serbian Latin fonts and report/revision/page-number footers.

### M3d office and recipient flow

A ready office revision includes **Link za klijenta**, a duration selector, **Napravi link za klijenta**, one-time **Kopiraj link**, and current link statuses with **Opozovi link**. The UI explains manual delivery and that opening/downloading does not acknowledge receipt. Because raw tokens are not stored, reloading permits creation of a new link rather than recovery of the old URL. Queued/failed reports have no sharing control.

The signed-out `/r/[token]` page contains the customer report, **Preuzmi PDF** and approved photo captions/images, with no staff navigation. M3e adds the optional receipt form after the report. Expired/revoked links show **Link nije dostupan** and require a new link from the service team. Each PDF/photo request rechecks access. Guest content must not enter a future service-worker/offline cache. The same report template retains 4 planned / 3 inspected / 2 open actions at phone and desktop widths. The explicit receipt UX is described below.

### M3e optional receipt

After the report, **Potvrda prijema** identifies the report number/revision and explains the limited meaning of receipt. The recipient enters **Ime i prezime** and **Uloga kod klijenta**, checks an initially unchecked statement and explicitly submits **Potvrdi prijem izveštaja**. Download remains available independently. Pending/error feedback preserves the entered fields; a matching retry cannot duplicate the receipt.

Success and later reload show **Prijem je potvrđen**, name/role, site-local server time and the method, replacing the form. State is keyed to the link, so navigation cannot reuse another link's local result. The office revision shows **Prijem izveštaja**, all its receipts and **Osveži potvrde**. A receipt is a later record outside the frozen report/PDF, and does not close actions or mark billing/repair approval. Revoked/expired links lose both form and result access.

### M3f correction editor and revision history

On the latest office revision, **Ispravi izveštaj** expands a complete system editor with **Razlog ispravke (vidljiv klijentu)**. The office can correct findings, outcomes, readings (including measured zero), material quantities and accountable follow-ups. Identity/branding and approved photos are retained from the predecessor. **Pregledaj ispravku** validates and previews the replacement; **Nazad na izmenu** returns without losing edits, and **Izdaj reviziju N** publishes it. Invalid input or stale versions remain visible for reconciliation.

Every revision page has **Istorija revizija**; an older page links to **Otvori najnoviju reviziju** and offers no amendment editor. Recent reports identify revision numbers. The issued visit remains read-only for technicians, with separate office correction attribution. Each revision retains its own PDF readiness, sharing links and receipt section; a new revision does not inherit an earlier receipt.

### M3g office actions

**Sledeće radnje** opens `/office/actions`; each submitted/issued source action links to its detail and original system anchor. **Priprema ponude** reuses the captured quote action. Office staff can change **Odgovoran** / **Rok radnje**, then explicitly complete with **Interna beleška o završetku**. Completion records preparation only, with no approval/billing flow.

Open repair/revisit actions offer **Zakaži povratnu posetu**, reusing M2 scheduling fields and commands for the source system only. The site time zone, separate deadline and booked appointment are visible. Booking neither completes the action nor changes its deadline. The return visit shows a narrow source finding even to a newly assigned technician without access to the original attendance. Managed action fields are read-only in returned field forms and amendment editors; their office link remains available to office staff. Advanced queues/filters remain M5g.

### M4a downloaded read-only visits

On **Danas**, an assigned visit offers **Preuzmi za rad bez veze**, **Preuzmi ponovo** and **Ukloni sa telefona**. The device identity status identifies whether the current account/workspace has been verified. **Dostupno bez veze · samo pregled** appears only after the exact shell revision is installed and the IndexedDB transaction commits. Failed initial writes never show readiness; failed refresh/removal retains the previous committed copy and reports the error. Downloads show their capture time.

The manifest starts at `/today`. A full offline navigation to Today or `/visits/[visitId]` falls back to a public, data-free HTML/JS shell. **Preuzete posete na ovom telefonu** also opens that shell directly. It lists only the active user/workspace partition, including previously downloaded dates. Missing downloads show **Poseta nije preuzeta**. The viewer retains explicit outcomes, measured zero/null states, parts, action status, field/correction attribution and the narrow return-source finding. It has no edit/save/submit controls. Private photos are not downloaded in M4a; their count and online-only explanation remain visible.

`lib/offline/storage.ts` is the shared typed storage source for Next controls and the compiled standalone editor. IndexedDB `teren-field`, schema 3 (upgrading schemas 1/2 without deleting bundles or drafts), stores bundles under `[userId, organizationId, visit.id]` with a partition index, plus one active identity binding. Auth/workspace transitions invalidate that binding before submission across tabs; server-side epoch rotation also protects redirects, callbacks and stale responses. Logout clears read-only copies and locks retained drafts with their source bundles until the same account/workspace is verified again. Workspace changes retain other partitions but hide them until that identity/workspace is verified again. Reconnection removes copies no longer assigned; older inventory responses cannot restore a known withdrawn assignment. No browser Auth credential is stored in this database.

M4b implements durable editing below; M4c replay is implemented below; M4d photo blobs and M4e conflict reconciliation remain separate. M4f owns pending-work choices and the full device/upgrade gate. Draft-bearing copies now block removal; the complete keep/sync/discard transition flow remains M4f. Real-phone HTTPS/install/storage checks remain part of that device gate; desktop Chromium with phone/desktop viewports is the automated M4a check.

### M4b durable field drafts

Scheduled/in-progress downloads offer **Dostupno bez veze · lokalni unos**; submitted/issued downloads remain read-only. Each field change is committed in IndexedDB before **Sačuvano na telefonu · nije poslato** appears. The reusable React editor restores exact raw inputs after browser restart, including deliberate pending outcomes, measured zero, unmeasured null, decimal material quantities and incomplete follow-up ownership/deadlines. Invalid or incomplete inputs remain recoverable locally; preparing a payload uses the online item schema and never turns an empty measured value into zero. Office-managed actions stay read-only.

The `drafts` store is keyed by `[userId, organizationId, visitId, itemId]`, indexed by visit and partition. Records retain actor identity/label, captured source attribution, base visit/item versions, a stable operation ID, timestamps, local revision and raw form values. Each write checks the active identity/epoch, assignment and source bundle, editable visit state and expected local revision. A competing tab cannot silently overwrite a newer draft. Failed writes retain the previous committed draft and show unsaved input with retry.

**Pripremi za slanje** freezes a validated canonical payload and shows **Čeka slanje · nije potvrđeno na serveru**. M4b introduced this local queue; M4c now adds the foreground sender and queued handover described below. An unattempted queued draft can explicitly return to editing using the same operation ID; M4c marks an attempt before transport and preserves the attempted payload. Local summaries are labeled unconfirmed. The online visit form pauses while this device has pending drafts so an older server summary cannot be submitted accidentally.

Refreshing/removing a downloaded visit with drafts is blocked. A draft can be explicitly discarded per system, with confirmation; this never changes server data. Account/workspace changes hide pending work and invalidate open tabs, but do not silently erase committed drafts. Reverification of the same authorized identity restores them. Withdrawal removes the accessible source bundle and leaves locked draft evidence; recovery choices belong to M4e/M4f. Browser storage clearing/eviction can still remove device work; physical-device/storage lifecycle checks remain M4f.

### M4c foreground synchronization and queued handover

In a downloaded visit, choose **Pripremi za slanje** for each edited system. This freezes a validated item payload. **Pripremi predaju kancelariji** validates the effective local visit (including pending outcomes and follow-up owners/deadlines) and stores a separate submission with a stable operation ID, expected aggregate version and prerequisite item operation IDs. Queueing does not mark the visit submitted. Further edits are blocked until an unattempted submission is explicitly cancelled. Server-side attachment validation remains authoritative; durable photo capture is M4d.

**Sinhronizuj sada** is available on Today and in the downloaded shell. With the app open, mounting a verified device view or restoring connectivity starts a bounded foreground pass; transient failures retry after 5/15/30 seconds. There is no closed-app/background-sync guarantee. Only queued items are sent; ordinary local drafts remain on the phone. A pass sends at most five items per request and twenty requests per visit. A further manual pass resumes larger queues.

IndexedDB schema 3 adds `submissions`, keyed by `[userId, organizationId, visitId]` with a partition index. Before transport, a transaction records `attemptedAt`; that operation ID, base version and payload cannot change while the result is uncertain. Successful acknowledgements atomically update the downloaded item/aggregate state and remove only the matching operation. Historical acknowledgements cannot roll back a newer item or aggregate version. **Potvrđeno na serveru** appears after this local commit. If a server response is lost or saving the acknowledgement fails, the same operation remains retryable. Concurrent senders are safe because the server deduplicates exact actor-scoped operations.

Submission is sent in a later request only after every item draft has been acknowledged. Its expected version is the captured aggregate version plus the queued item writes; concurrent unrelated changes can therefore cause a safe conflict rather than silent rebasing. Only a matching server acknowledgement changes the local visit to submitted and exposes its read-only summary. The office then sees the same persisted findings through ordinary review.

A failed later operation does not undo earlier acknowledgements. Conflicts/denied access pause the affected queue and retain the local draft; full reconciliation belongs to M4e. A definitively rejected item (422) may return to editing under a new operation ID. An unattempted or definitively rejected submission can be cancelled and corrected; an uncertain attempted submission remains frozen for retry. Expired sessions lock the partition and retain pending work. Workspace/account transitions cannot apply an old response to another partition. Refresh/removal and ordinary online forms also protect pending submissions after their item drafts have been acknowledged.
