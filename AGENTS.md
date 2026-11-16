
## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.


# Working on the HVAC service app

This repository starts as a specification. The first implementation milestone scaffolds the application. Examples of paths, scripts, routes and tables in these documents describe targets until the corresponding milestone lands.

## Pick the right reference

| When changing | Read |
| --- | --- |
| Product behavior, scope, roles or acceptance criteria | [SPEC.md](SPEC.md) |
| The next deliverable or its verification | [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |
| Runtime boundaries, configuration, containers or releases | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Tables, migrations, tenant isolation or access policies | [DATABASE.md](DATABASE.md) |
| Commands, authentication, conflicts or background jobs | [BACKEND.md](BACKEND.md) |
| Field UX, mobile forms, accessibility or offline sync | [FRONTEND.md](FRONTEND.md) |
| Report content, acknowledgements, rendering or revisions | [REPORTS.md](REPORTS.md) |

Start with the product requirement and the relevant milestone. Read the domain document before editing that area. Respect any more specific AGENTS.md discovered in the target directory. Use the installed versions, repository lockfile and actual package scripts. Record meaningful discrepancies between the specification and implementation.

## Engineering workflow

1. Follow one vertical slice from field action to persisted data and visible result. Keep feature code and any necessary schema migration in the same change.
2. Use English for code identifiers and project documents. Use Serbian Latin for pilot UI and customer PDFs. Match the domain vocabulary in SPEC.md.
3. Scope every business read and write to the active organization. Authenticate and authorize server entry points. Preserve database-level isolation when an API is called directly.
4. Treat the mobile outbox as a retrying client. Keep evidence of who entered a field finding. Preserve finalized revisions and avoid duplicate visits, tasks, reports and receipts.
5. Before handoff, run the available checks for the affected slice, then exercise its acceptance scenario. For permission changes include a second organization and an unassigned technician. For PDF changes inspect the rendered pages. State which checks actually ran.
6. Update the document that owns a changed contract and link to it from callers as needed. Keep this file short.

Initial commands, once their prerequisites exist, are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). Production credentials and identifiable customer records belong outside git. Seed the repository only with fictional pilot data.

Official guidance: [Codex project instructions](https://developers.openai.com/codex/guides/agents-md/).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
