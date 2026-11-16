# Field and office experience

The primary mobile journey is “Danas” → site → system → outcome → visit summary. Use Serbian Latin for field labels and plain language for errors. Separate the technician's daily work from the office review queue. The same responsive application supports both.

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
