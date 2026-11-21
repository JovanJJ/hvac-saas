# M4 offline validation

M4f implements SPEC P06 device lifecycle controls. Technical verification is recorded below. The parent M4 physical-device gate is **pending**: the project owner confirmed that no physical device is available. Emulated viewport results do not establish Android/iOS camera, airplane-mode, OS termination or eviction behavior.

## Environment

- Date: 2026-11-18.
- Host: Ubuntu 24.04.5 LTS.
- Browser: Google Chrome for Testing 159.0.8154.6, Playwright Chromium revision 1255, headless.
- Viewports: 390 × 844 and 1440 × 1000; no physical phone or mobile operating system.
- Production Next.js 16.4.6 Webpack build, served through standalone output on localhost. Localhost supplies the browser secure-context exception; real-device HTTPS is not verified.
- Existing self-hosted Supabase and authenticated Cloudinary, with temporary fictional fixtures. Photo scenarios remove their provider objects and fixtures afterwards. No database reset, new migration or environment variable is required.

## Automated scenarios

Final production-browser regression: **42 passed** (21 scenarios at each width, nine suites, 3.2 minutes). The extra workspace phone check exposed missing Tailwind utilities in the previous fallback build. Standard Next.js PostCSS integration fixes that discrepancy; the complete run above uses the corrected styles.

| Suite | Coverage |
| --- | --- |
| `tests/offline-lifecycle.spec.ts` | Pending removal keep and explicit visit discard; shared-device cleanup across a second locked partition; failed deletion transaction rollback; sync before transition requires prepared work; sign-out retains and same-account sign-in restores a draft; attempted transport blocks discard; actual waiting service-worker install/activation; v4-to-v5 schema upgrade retains the original queued operation and private photo Blob; offline reload; unsaved photo selection blocks cleanup; unavailable IndexedDB still allows explicit keep/sign-out. |
| `tests/offline-photos.spec.ts` | Download, disconnect, edit and queue two systems, add customer/internal photos, queue handover, close the browser process, reopen offline, verify exact fields and Blob hashes, reconnect, lose a verification response after commit and retry. The server receives two saves and one submission, photos upload once, office review shows both findings and customer preview excludes internal evidence. Includes failed photo writes, invalid upload and explicit photo removal. |
| `tests/offline-drafts.spec.ts` | Exact raw input durability across a full browser restart, zero/null distinction, additive legacy schema upgrade, quota/write failure, stable queued payloads, competing tabs and account isolation. |
| `tests/offline-sync.spec.ts` | Lost save/submit acknowledgements, partial batch success, failed device acknowledgement commit, conflict pause, authorization and request bounds. |
| `tests/offline-recovery.spec.ts` | Local/server comparison, reviewed replacement, changed server state after review, lost reconciliation acknowledgement, expired session, different account, withdrawn/reassigned visit, original-ID replay after restored access, atomic server adoption and authorship. |
| `tests/offline-visits.spec.ts` | Full process restart with disconnected download reads, missing visits, explicit removal, quota failures, cache allowlist, workspace/account/cross-tab isolation and withdrawn assignment. |
| `tests/workspaces.spec.ts` | Workspace creation, invitation acceptance, role changes, revocation, switching, phone/desktop layout, direct API retries, cross-tenant denial and simultaneous owner demotion. |
| `tests/visit-handover.spec.ts`, `tests/evidence.spec.ts` | Persisted field-to-office/customer journey, field validation, private photo verification, visibility and withdrawal compatibility. |

The expected summary remains **4 planned / 3 inspected / 2 open actions** at both widths. Browser connectivity is simulated using Playwright offline mode and intercepted transport failures. Quota/storage denial is injected deterministically; actual disk exhaustion and browser eviction are not simulated as successful real-device results.

The worker upgrade scenario registers the actual current worker at a different same-origin script URL, confirms it waits while an app client is open, closes all controlled pages and reopens after activation. The schema scenario reconstructs the preceding v4 stores with real committed test data, then opens the current v5 reader. Neither scenario clears a real user's device data. Production upgrades must not ask technicians to reset site storage.

## Checks

- `npm run typecheck`
- `npm run lint`
- `npm test` — six unit test files.
- `npm run build -- --webpack` — includes Tailwind utilities through the documented PostCSS integration.
- `npm run build` was also attempted; Turbopack could not bind its CSS-worker port in this environment (including with elevated execution). Webpack is the verified fallback.
- Production Playwright: the eight suites above plus `tests/workspaces.spec.ts`, both configured widths, two workers. The temporary runner copies static/public assets beside standalone output and starts/stops an isolated test server; it does not stop the development server.
- `git diff --check`
- Pending-removal and full-viewport sign-out dialog screenshots inspected at phone and desktop widths. The focused sign-out scenario was repeated after the full run: **2 passed**.

No PDF renderer, Docker release or database rollback suite was rerun for this device-only change. Existing server authorization is exercised by the browser scenarios; no server permission or SQL contract changed.

## Physical-device completion checklist — pending

Run over the intended trusted HTTPS origin on an actual representative Android Chrome phone and/or iPhone Safari/PWA. Record model, OS, browser version, installed/tab mode and date for every result; do not replace them with an emulated viewport.

1. Download an assigned four-system visit. Enable actual airplane mode, reopen the downloaded visit, change two systems, capture a camera photo with caption/visibility and prepare the handover.
2. Fully close/restart the app while disconnected. Verify exact fields, measured zero/unmeasured values, photo preview and pending state. Reconnect with ordinary brief network interruptions; submit/retry. Verify one save per edited system, one attachment and one handover in office, with 4/3/2 totals and private evidence excluded from customer preview.
3. Repeat stale same-item and stale aggregate edits; review both versions and make the explicit choice. Withdraw/reassign access and expire/renew the session; confirm original work is retained but writes/uploads require the original authorized identity/workspace.
4. With queued work, deploy a new shell. Verify no editor reload, close every app window, reopen, and verify original queued IDs/Blobs. Exercise an additive database upgrade and blocked-tab recovery without a site-data reset.
5. Exercise keep, sync-first and checkbox-confirmed discard on sign-out/workspace/removal. Confirm an uncertain attempted request cannot be erased. On a shared device, settle attempts, explicitly clean all accounts, sign out/restart and verify no local private records or image previews remain.
6. Record actual persistent-storage grant/denial, low-space behavior and OS/browser storage eviction behavior. Confirm failed writes are labeled unsaved and never claim durability. Persistent storage does not protect against the user clearing browser data.

Next feature ticket: **M5a — Maintain equipment and its history**. M4 physical-device acceptance remains an outstanding gate alongside that work.


## Changed files

- Lifecycle UI and private storage: `features/offline/lifecycle-control.tsx`, `features/offline/session-guard.tsx`, `lib/offline/lifecycle.ts`, `lib/offline/storage.ts`.
- Downloaded editing/removal and unsaved input: `features/offline/download-control.tsx`, `features/offline/offline-app.tsx`, `features/offline/draft-editor.tsx`, `features/offline/photo-panel.tsx`.
- Build/style parity: `postcss.config.mjs`, `next.config.ts`, `package.json`, `package-lock.json`. The pinned Tailwind PostCSS plugin replaces its Turbopack-specific loader; no CSS utilities are left uncompiled in the fallback.
- Public worker upgrade boundary: `features/offline/service-worker.js`, `lib/offline/shell.ts`.
- Staff/auth/workspace integration: `features/auth/auth-screen.tsx`, `features/workspaces/staff-shell.tsx`, `features/workspaces/forms.tsx`.
- Browser verification: `tests/offline-lifecycle.spec.ts`, `tests/offline-drafts.spec.ts`, `tests/offline-photos.spec.ts`, `tests/offline-recovery.spec.ts`, `tests/offline-sync.spec.ts`, `tests/offline-visits.spec.ts`.
- Owning documentation/status: `FRONTEND.md`, `BACKEND.md`, `DATABASE.md`, `ARCHITECTURE.md`, `DEVELOPMENT_GUIDE.md`, `IMPLEMENTATION_PLAN.md`, this validation record.

Generated public app/storage bundles, worker and revision metadata remain ignored and are regenerated by the existing build hooks.
