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
