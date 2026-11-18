import { AmendmentForm } from "./amendment-form";
import type { AmendmentBundle } from "./amendment-model";
import { ReceiptRefresh } from "./receipt-refresh";
import { ReceiptDetails } from "./receipt-details";
import type { ReportReceipt } from "./receipt-model";
import Link from "next/link";
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
  const reports = await reportList();
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
  if (result.error) throw new Error("Linkovi trenutno nisu dostupni.");
  const links = result.data as ReportLink[];
  const receiptResult = await client.rpc("report_receipts", {
    p_organization_id: context.workspace.organization.id,
    p_revision_id: id,
  });
  if (receiptResult.error)
    throw new Error("Potvrde prijema trenutno nisu dostupne.");
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
      <div className="preview-note">
        <h1>
          {revision.data.reference} · Revizija {revision.revision}
        </h1>
        <p>Izveštaj je izdat. Podaci ove revizije su zaključani.</p>
        <ReportRenderStatus revision={revision} operationId={randomUUID()} />
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
      <section className="card my-5" aria-label="Evidencija prijema">
        <h2>Prijem izveštaja · Revizija {revision.revision}</h2>
        <ReceiptRefresh />
        {!receipts.length && <p>Nema potvrde prijema.</p>}
        {receipts.map((receipt) => (
          <ReceiptDetails
            key={receipt.id}
            receipt={receipt}
            timeZone={revision.data.timeZone}
          />
        ))}
      </section>
      {revision.renderState === "ready" && revision.artifact && (
        <SharePanel
          revisionId={id}
          links={links}
          token={randomBytes(32).toString("base64url")}
          operationId={randomUUID()}
          timeZone={revision.data.timeZone}
        />
      )}
      <ReportDocument report={revision.data} />
    </>
  );
}
