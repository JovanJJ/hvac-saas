# Public report sample

`public-report.ts` is an independent, deliberately publishable customer-report DTO. It uses the fictional RN-2026-0142 / JA-02 scenario, a fixed issue date and no real identities, database reads, private notes, photos or report capabilities. It is not the interactive M0 fixture or a database seed.

From the repository root run:

```sh
npm run sample:report
```

Use the installed lockfile dependencies, the matching Playwright Chromium browser and its OS libraries, and Poppler's `pdftotext`, `pdffonts` and `pdftoppm` on `PATH`. The existing renderer honors `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when a browser executable must be selected explicitly. No `.env`, Docker stack or provider credentials are needed. This is a maintainer command, not a build/start hook or an HTTP endpoint.

The command renders through `src/worker/render.tsx` and the existing report template/embedded fonts, validates A4 pages, searchable Serbian text, 4/3/2 totals, page numbering, metadata and excluded private material, then rasterizes those exact PDF bytes. PDF word bounding boxes determine the desktop crop (header, totals and all four summary rows) and phone crop (totals and the two exceptions). Sharp produces bounded WebP images without retained image metadata.

Publishable outputs in `public/primeri/`:

- `servisni-izvestaj.pdf`: complete selectable report, revision 1.
- `servisni-izvestaj-desktop.webp` and `servisni-izvestaj-mobile.webp`: crops from its first page.
- `servisni-izvestaj.json`: dimensions, crop coordinates, page count, renderer identity and SHA-256 hashes connecting the publication artifacts.

Full-page PNGs, extracted text and font inspection output go into the ignored `test-results/public-report/` directory. Inspect every page and both crops after regeneration. Browser tests may clear that review directory; regenerate it when needed. Review fictional labels, line wrapping, locked-room outcome, action owners/deadlines and absence of internal information before checking in the public outputs. Changes to source, renderer, fonts or rasterization tools require regenerating and reviewing the artifacts together. With the same source/tool versions, repeated generation should produce identical PDF, crops and manifest bytes.

Only the four intentional publication files belong in public assets. Keep staff/guest report PDFs in private storage, with their existing scoped access checks. `/preview` remains development-only. See [REPORTS.md](../../REPORTS.md) and [UI_UX_LAUNCH.md](../../UI_UX_LAUNCH.md#7-feature-implementation-plan).

## Actual workflow screen captures

With the development application and Supabase stack running, generate publication captures with:

```sh
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run sample:workflow
```

This explicit command runs `tests/capture-public-workflow.spec.ts` once in the desktop project. It needs the development `DATABASE_URL`, Supabase app configuration and a working Playwright Chromium installation. Ordinary test runs skip the capture test unless `CAPTURE_PUBLIC_WORKFLOW=true`; the app never exposes a capture endpoint.

The command creates temporary `.invalid` Auth identities and a separate fictional workspace, accepts a technician invitation, creates a four-system JA-02 visit from `public-report.ts`, captures the real schedule and mobile field form, saves/submits findings through the existing role-scoped RPCs and captures the actual office customer-preview summary at 4/3/2. It uses the same temporary visit throughout. The live draft is not an issued revision with the sample report number: RN-2026-0142 identifies the shared fictional scenario and its static public PDF. No issuance, report worker job, external email, real customer fixture or existing organization is needed.

The test crops real rendered pixels; it does not replace product text or manufacture a screenshot. Only the development-tools overlay is hidden during capture. Schedule and office images have desktop/phone versions; the field capture is the real phone editor before its first save. Header/account information, URLs, internal notes and author-email sections are excluded from the crops. Temporary database/Auth records are removed in `finally`, including after a failed capture. Never run this maintainer tool against production data.

Outputs are five `public/primeri/workflow-*.webp` images and `workflow.json`, containing only the fictional scenario/site/date, totals, the two customer-facing findings/actions, image dimensions and hashes. Inspect all five images before committing. They are static public marketing assets, not links into the temporary workspace. UX14 regenerated them after the office/field refresh; the phone office image shows complete totals and the desktop image shows the complete summary table. Full source images can be opened from each workflow illustration to read details.

No licensed field photograph or captioned demo recording is supplied yet. The worked example uses complete HTML rows, and the site omits video controls until real media is ready.

### UX14 refreshed captures and social asset

The workflow capture was refreshed after the office/field UI updates. Office HTML now uses the same optional summary scroll region as guest reading. Its desktop capture contains totals plus the complete four-row table; the phone capture contains the complete totals only, avoiding clipped static table columns. The enlarge link still opens the full desktop image. Schedule and field captures remain real cropped application pixels with the same isolated fictional source and cleanup rules.

`npm run sample:social` generates the checked-in 1200×630 `public/social/teren-preview.png` plus its SVG source and replaces the scaffold favicon with the existing teren. device mark. It uses Sharp and DejaVu Sans on the maintainer host, reads no environment/database/customer information, and makes no pricing, adoption or verified-operator claim. Inspect the generated PNG after changes. These public assets are independent of private report archives and the service-worker precache.
