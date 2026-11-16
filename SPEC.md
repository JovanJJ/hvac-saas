# Product specification: HVAC field service

**Status:** Proposed pilot specification, 15 November 2026. **Market:** Serbia first. **Primary outcome:** A technician completes a multi-unit maintenance visit on a phone, the office issues a usable customer report without retyping it, and every outstanding issue has an owner and a due date.

## Customers and scope

The buyer is the owner or operations manager of a small contractor, initially a team of 2–10 people maintaining commercial premises. A solo operator uses the same organization and may schedule and perform their own visits. The initial buyer qualification is repeat work at sites with multiple installed systems. The recipient of a report is typically a site manager or another customer representative.

A **customer** owns or operates one or more **sites**. Each site contains **systems** that may have several indoor units and an outdoor unit. A **visit** is one attendance at one site. A **visit item** records what happened to one system on that attendance. A **follow-up** is a separately tracked action. A **report revision** is the customer-facing record of a particular version of the visit. These distinctions drive the UI, storage model and exports.

## Roles

| Role | Core responsibilities |
| --- | --- |
| Owner | Manages the organization, membership and all operational work. Can perform a visit. |
| Coordinator | Manages customers, sites, equipment, imports, scheduling, review, revisions and sharing. Has no membership-management authority. |
| Technician | Sees assigned visits and necessary site/system information, including service history for those systems. Records findings and submits completed fieldwork. |
| Customer recipient | Uses a scoped report link to view one issued revision and optionally acknowledge receipt. No staff account required. |

## MVP requirements

| ID | Capability | Observable acceptance criterion |
| --- | --- | --- |
| P01 | Organization and access | An owner creates a workspace, invites a teammate and assigns a visit. A different organization cannot retrieve its records, files or report. |
| P02 | Equipment register | A coordinator imports a previewed CSV or XLSX list, resolves invalid rows and finds a system by site, room, label or serial. Reimport of the same mapping preserves identity. |
| P03 | Visit planning | Staff schedule one-off and recurring visits in the site's local time, choose systems and assign technicians. A repeated scheduler run creates one occurrence. |
| P04 | Multi-system service | One visit holds independent results for each planned system. A technician can add an existing site system encountered during the visit. The report distinguishes completed work, repair needs and lack of access. |
| P05 | Field evidence | A technician can record applicable work, readings with units, parts and captioned photos. A missing reading remains distinguishable from zero. Site evidence has explicit customer or internal visibility. |
| P06 | Offline fieldwork | An assigned visit downloaded online can be reopened without a connection. A saved draft and pending photos survive an application restart under normal device storage conditions. Reconnecting replays changes once. |
| P07 | Handover | Submitting a visit with unresolved planned items asks the technician to record an outcome for each. The office sees which items need a quote or a return visit and who owns the next action. |
| P08 | Customer report | An authorized issuer previews and issues a Serbian A4 PDF, shares it without a customer login, and can revoke access. An amendment creates a new immutable revision. |
| P09 | Continued service | The office can track open follow-ups, upcoming maintenance and visits ready for billing review. An owner can export core customer, site, equipment and visit data as CSV. |

## Example that anchors implementation

Seed a fictional site in Jagodina with four planned systems. Two pass the requested service. The third has a damaged air deflector and needs a quote. The fourth is behind a locked door. The visit may be submitted with those explicit outcomes. The office sees four planned, three inspected and two open actions. The recipient receives one report. Opening it does not acknowledge receipt automatically. Acknowledgement does not authorize the quoted repair. The human-readable reference is specified in [REPORTS.md](REPORTS.md).

## Commercial assumptions and success

Test Solo at RSD 1,290/month for one person and Team at RSD 2,490/month for an owner plus four additional users. Test extra Team seats at RSD 490/month and a 30-day trial. These are pricing hypotheses. Manual pilot enrollment and billing are sufficient. Tier enforcement, automated payments and tax invoicing can be scoped once pricing is validated.

For an initial pilot, interview ten firms, collect anonymized examples and onboard three. Measure technician plus office time from field entry to an acceptable PDF, callbacks for missing data, second and tenth real visits per firm, paid continuation and later 90-day retention. A decision checkpoint is two of three pilot firms willing to pay to continue. No minimum threshold for time saved has been observed yet.

## Scope after the pilot

Consider QR labels, customer portfolios, inventory, accounting exports tailored to a vendor, paid SMS, enterprise service-level agreements and official regulatory forms when pilot evidence warrants them. The first release supports operational evidence and billing review. Issuing a tax invoice, approving a quote, certifying compliance and taking payment are separate business workflows.

For architecture and implementation order see [ARCHITECTURE.md](ARCHITECTURE.md), [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) and [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md).
