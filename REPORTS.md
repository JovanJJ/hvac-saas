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

Render one-system, four-system and 30-system fixtures. Inspect every page for clipping, broken glyphs, missing table headers, unreadable photos and incorrect page numbering. Extract text to verify totals and the exact system identifiers. Compare the checksum of an archived PDF before and after a source-record edit and after a retry. Test revoked and expired guest links, and acknowledgement made after issuance. Add a regulatory export only after separately verifying the applicable Serbian form, scope, required fields and approval procedure.
