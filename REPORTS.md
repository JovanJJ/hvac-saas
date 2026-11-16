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

M3a private image delivery remains staff-authorized and private/no-store; issued evidence references are frozen and cannot be removed by normal visit commands. There are no PDF bytes, render worker, downloads, public links or receipts in M3b. The office sees a queued PDF and no sharing action. M3c must render the frozen DTO/evidence references rather than reread mutable registers, archive the bytes and implement readiness/retry. The full PDF fixture/archive checks below belong to that ticket. M3b checks cover the four-system online scenario at phone/desktop widths, direct API concurrency/isolation, snapshot privacy and preservation after source edits.

Render one-system, four-system and 30-system fixtures. Inspect every page for clipping, broken glyphs, missing table headers, unreadable photos and incorrect page numbering. Extract text to verify totals and the exact system identifiers. Compare the checksum of an archived PDF before and after a source-record edit and after a retry. Test revoked and expired guest links, and acknowledgement made after issuance. Add a regulatory export only after separately verifying the applicable Serbian form, scope, required fields and approval procedure.
