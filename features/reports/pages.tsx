import { OfficeSection, OfficeFacts, OfficeNavigation } from "@/components/ui/office-work";
import { AmendmentForm } from "./amendment-form";
import type { AmendmentBundle } from "./amendment-model";
import { ReceiptRefresh } from "./receipt-refresh";
import { ReceiptDetails } from "./receipt-details";
import type { ReportReceipt } from "./receipt-model";
import Link from "next/link";
import { OverviewError } from "@/features/office/overview-state";
import { SharePanel } from "./share-panel";
import type { ReportLink } from "./link-model";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/features/workspaces/dal";
import { randomBytes, randomUUID } from "node:crypto";
import { reportList, reportPreview, reportRevision } from "./dal";
import { ReportRenderStatus } from "./render-status";
import { renderLabels } from "./status-labels";
import { ReportDocument } from "./document";
export async function RevisionLink({ visitId }: { visitId: string }) {
  const preview = await reportPreview(visitId);
  return (
    preview.revisionId && (
      <Link
        className="button primary my-5"
        href={`/office/reports/${preview.revisionId}`}
      >
        Otvori izdat izveštaj
      </Link>
    )
  );
}
export async function RecentReports() {
  await requireWorkspace(["owner", "coordinator"]);
  let reports: Awaited<ReturnType<typeof reportList>>;
  try { reports = await reportList(); }
  catch { return <OverviewError label="Izdati izveštaji" />; }
  return (
    <section className="card my-5">
      <h2>Izdati izveštaji</h2>
      {!reports.length && <p>Nema izdatih izveštaja.</p>}
      {reports.map((report) => (
        <p key={report.id}>
          <Link href={`/office/reports/${report.id}`}>
            {report.number} · {report.site} · Revizija {report.revision}
          </Link>{" "}
          · {renderLabels[report.renderState]}
        </p>
      ))}
    </section>
  );
}
export async function RevisionPage({ id }: { id: string }) {
  const revision = await reportRevision(id);
  const context = await requireWorkspace(["owner", "coordinator"]);
  const client = await createSupabaseServerClient();
  const result = await client.rpc("report_links", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: id,
  });

  const links = result.data as ReportLink[];
  const receiptResult = await client.rpc("report_receipts", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: id,
  });

  const receipts = receiptResult.data as ReportReceipt[];
  const amendment =
    revision.latestRevisionId === id
      ? await client.rpc("report_amendment", {
          p_organization_id: context.workspace.organization.id,
          p_revision_id: id,
        })
      : null;

  return (
    <>
      <div className="preview-note office-controls">
        <h1>
          {revision.data.reference} · Revizija {revision.revision}
        </h1>
        <p>Izveštaj je izdat. Podaci ove revizije su zaključani.</p>
        <OfficeNavigation items={[
          { label: "PDF i deljenje", href: "#revision-delivery" },
          { label: "Potvrde prijema", href: "#revision-receipts" },
          { label: "Sadržaj revizije", href: "#revision-content" },
          { label: "Radnje iz nalaza", href: "/office/actions" },
          { label: "Provera naplate", href: `/office/handover/${revision.visitId}` },
        ]} />
        <OfficeFacts items={[
          { label: "Lokacija", value: revision.data.site },
          { label: "Klijent", value: revision.data.customer },
          { label: "Revizija", value: `${revision.revision} · ${revision.latestRevisionId === id ? "Najnovija" : "Prethodna"}` },
        ]} />

        <p>
          Izdato:{" "}
          {new Date(revision.issuedAt).toLocaleString(revision.data.locale, {
            timeZone: revision.data.timeZone,
          })}{" "}
          · {revision.data.issuer}
        </p>
        <Link href={`/visits/${revision.visitId}/review`}>Nazad na posetu</Link>
      </div>
      {revision.history.length > 1 && (
        <section className="card my-5" aria-label="Istorija revizija">
          <h2>Istorija revizija</h2>
          {revision.history.map((entry) => (
            <p key={entry.id}>
              <Link href={`/office/reports/${entry.id}`}>
                Revizija {entry.revision}
              </Link>
              {entry.reason
                ? ` · ${entry.reason}`
                : entry.revision === 1
                  ? " · Prvo izdavanje"
                  : " · Ranija revizija"}
            </p>
          ))}
        </section>
      )}
      {revision.latestRevisionId !== id && (
        <p className="card my-4">
          Postoji novija revizija.{" "}
          <Link href={`/office/reports/${revision.latestRevisionId}`}>
            Otvori najnoviju reviziju
          </Link>
        </p>
      )}
      {amendment && !amendment.error && (
        <AmendmentForm
          key={id}
          revision={revision}
          bundle={amendment.data as AmendmentBundle}
          operationId={randomUUID()}
        />
      )}
      {amendment?.error && (
        <p>
          Ispravka trenutno nije dostupna. Osvežite stranicu; ako problem
          ostane, proverite povezivanje sistema prethodne revizije.
        </p>
      )}
      <div className="preview-note office-controls">
      <OfficeSection id="revision-delivery" title="PDF i deljenje" description="Revizija je sačuvana. Link za klijenta postaje dostupan tek kada je arhivirani PDF spreman.">
        <ReportRenderStatus revision={revision} operationId={randomUUID()} />
        {revision.renderState !== "ready" && <p className="office-state">Deljenje još nije dostupno. Priprema PDF-a ne stvara novu reviziju.</p>}
        {revision.renderState === "ready" && revision.artifact && (result.error ? <OverviewError label="Linkovi za klijenta" /> : <SharePanel revisionId={id} links={links} token={randomBytes(32).toString("base64url")} operationId={randomUUID()} timeZone={revision.data.timeZone} />)}
      </OfficeSection>
      <section id="revision-receipts" className="card my-5" aria-label="Evidencija prijema">
        <h2>Prijem izveštaja · Revizija {revision.revision}</h2>
        <p>Potvrda beleži prijem ove revizije, bez odobrenja ponude ili naplate. Nova ispravka ima zasebne potvrde.</p>
        <ReceiptRefresh />
        {receiptResult.error ? <OverviewError label="Potvrde prijema" /> : !receipts.length && <p>Nema potvrde prijema.</p>}
        {!receiptResult.error && receipts.map((receipt) => (
          <ReceiptDetails
            key={receipt.id}
            receipt={receipt}
            timeZone={revision.data.timeZone}
          />
        ))}
      </section>
      </div>
      <div id="revision-content" className="office-document">
        <div className="preview-note office-controls"><h2>Sadržaj zaključane revizije</h2><p>Ovaj pregled koristi sačuvane podatke. Za preuzimanje originalnog dokumenta koristite Preuzmi PDF.</p></div>
        <ReportDocument report={revision.data} scrollableSummary />
      </div>
    </>
  );
}
