# Implementation plan

Each milestone delivers a runnable workflow from its normal entry point. The first paid pilot is the target. The repository begins with specifications only. Establish the code and scripts described below in milestone 1.

| Milestone | Implementation and dependencies | Exit check |
| --- | --- | --- |
| 0. Verify the workflow | With three pilot prospects, collect anonymized work orders, Excel lists and examples accepted by the customer. Time a recent multi-system job including office rework. Review the [example report](REPORTS.md) with a technician and a customer representative. This discovery can overlap with foundation work. | Record the accepted field names, who can issue, how receipt is recorded and what would justify a paid trial. |
| 1. Runnable foundation (P01) | Complete the existing Next.js App Router/TypeScript scaffold, npm lockfile, lint/typecheck/test scripts, versioned migrations, fictional seed and a buildable Next.js Docker image. Use the existing self-hosted Supabase Docker stack and the server-only `DATABASE_URL` provided in `.env` for SQL tooling. Add auth, workspace creation, invitations, roles and tenant policies. | In WSL open the app, sign in, invite a technician, switch accounts, prove tenant separation and build the production image. |
| 2. First complete visit (P02–P05, P07–P08 subset) | Build minimal manual customer/site/system creation, a scheduled visit, assignments, Today screen, editable outcomes, follow-ups, submission, an office queue and customer report preview (HTML/A4 in M2; PDF rendering in M3). Use the four-system fixture. | The owner schedules the visit and a technician records and submits outcomes for all four systems on a phone. The owner sees three inspected systems, two actions and a correct preview. |
| 3. Issued report and handover (P05, P07, P08) | Add private evidence upload, durable render jobs, immutable snapshots/PDFs, confirmation, amendment and revocable guest links. Add a return-visit and quote task with due dates. | Guest receives one specific revision without a staff account. Correction produces revision 2; revision 1 remains reproducible as the same archived bytes. No duplicate report on retry. |
| 4. Field reliability (P06) | Add offline shell, download of assigned bundles, IndexedDB drafts and photo queue, versioned sync commands and manual conflict resolution. Test ordinary network interruptions on real devices. | In airplane mode reopen a downloaded visit, edit two systems, add a photo, close and reopen the app, reconnect and submit once. Verify a stale edit and revoked access are handled explicitly. |
| 5. Repeat business (P02, P03, P09) | Add import preview/apply, bulk system setup, recurring maintenance, due dates, billing-review queues and owner CSV export. Make Solo onboarding and adding a teammate work with the same records. | Reimport a list and rerun a recurring job without duplicates. A second technician can complete follow-up work using history from the first. |
| 6. Operate a paid pilot (P01–P09) | Deploy pinned app, worker and self-hosted Supabase to staging then VPS. Configure HTTPS/public auth URLs, private networking, persistent volumes, backups, worker retry monitoring and data recovery. Provide manual pilot enrollment. | Restore the database and files in isolation, open an archived PDF, verify staff/guest access, then run a real pilot visit. Compare timings to baseline and record which firms continue at the proposed price. |

## M1 implementation

Identity entry points, verified sessions and recovery, the protected account and role-specific landing pages, two fictional organization fixtures, initial RLS, migration/database-test commands and the standalone Docker image are implemented. [README.md](README.md) contains exact commands and the Auth email/redirect configuration. M1b implements workspace creation, manual-link invitations, role-aware landing, active workspace selection and owner-only membership changes. Initial staff screens provide empty states until M2. Passing M1 checks does not establish visit-assignment or file isolation, which depend on later records.

## M3 implementation

M3a–M3g now implement private verified photos and first report issuance: one frozen customer snapshot and a uniquely keyed queued PDF job commit with the issued visit state. Preview and issuance share an allowlisted SQL mapping and HTML template. The dedicated worker now renders frozen DTOs into immutable private PDF archives with leased retries, progress and authorized ready-only staff download. Ready revisions now support manually copied guest links with expiry, revocation and private PDF/photo delivery. Explicit guest receipt is now recorded separately for the exact link/revision and shown to office staff. Office amendments now append a validated, audited revision and reuse rendering/sharing while preserving prior PDFs, links and receipts. Office follow-ups now support assignment/deadlines, explicit completion and one source-linked return booking through the M2 scheduler, without changing issued history. M4a now adds assigned read-only downloads, a content-versioned public shell and identity-partitioned IndexedDB with explicit readiness/removal and storage-failure handling. The next feature ticket is M4b durable field drafts; production/parent milestone gates still require their documented environment checks. See [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for feature tickets.

## Bootstrap target

Extend the existing Next.js scaffold while preserving the Markdown files. Development uses the existing self-hosted Supabase Docker stack; do not initialize or start a separate Supabase CLI stack. The user provides `DATABASE_URL` in the ignored `.env` file for server-only SQL tooling and reviewed migrations. Load it through the selected tooling without printing credentials. Read the Supabase API URL and client keys from the actual stack configuration; `DATABASE_URL` does not replace the Auth/Storage API configuration. See [ARCHITECTURE.md](ARCHITECTURE.md) for configuration boundaries. Pin the chosen runtime, tooling and dependency versions once selected.

~~~sh
# Development, with the existing self-hosted Supabase Docker stack running
npm run dev

# Subsequent verification, once these project scripts and tests exist
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
~~~

Apply version-controlled migrations using tooling configured for the intended `DATABASE_URL`; establish the exact migration and database-test commands in milestone 1. Do not reset the existing self-hosted stack. Run destructive schema verification and fictional seeds only against an explicitly disposable test database. Run database access tests against two fictional organizations. A production release uses reviewed migrations and a target-specific public Supabase URL at build time.

## Cross-slice release scenarios

| Scenario | Expected observation |
| --- | --- |
| Organization A and B share a similar system label | No data, file URLs or report metadata cross organizations, including direct Supabase access. |
| An unassigned/revoked technician uses an old link | Access is refused online; a device reconnecting with a stale assignment cannot upload edits to the old job. |
| Two technicians edit one visit | Different items can both be saved; a competing write to the same item returns a resolvable conflict. |
| Renderer crashes or a phone retries after an unknown result | The same operation resumes or returns the recorded result. One issued revision and one intended follow-up remain. |
| A customer acknowledges revision 1 after revision 2 exists | The receipt references revision 1. The PDF bytes and amendment history remain unchanged. |
| A month-end plan crosses a DST change | Planned visits retain local scheduling semantics, with at most one generated visit per occurrence. |
| One partially invalid spreadsheet is imported twice | Preview shows row issues before changes; after correction a confirmed retry cannot duplicate systems. |
| Owner exports and recovers records | Customer/site/system identity and visit history remain traceable; restored Storage photos/PDFs match their database references. |

## Pilot decisions to record

Confirm actual report acceptance language, useful readings by visit type, device mix and offline duration. Confirm willingness to pay, whether the 30-day trial fits the service cycle and whether photo storage needs a priced allowance. Update the owning document when a decision changes behavior. Benefits, conversion and time savings are pilot measurements.
