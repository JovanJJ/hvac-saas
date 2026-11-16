import Link from "next/link";
import { reportList, reportPreview, reportRevision } from "./dal";
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
            {report.number} · {report.site}
          </Link>{" "}
          · Čeka izradu PDF-a
        </p>
      ))}
    </section>
  );
}
export async function RevisionPage({ id }: { id: string }) {
  const revision = await reportRevision(id);
  return (
    <>
      <div className="preview-note">
        <h1>
          {revision.data.reference} · Revizija {revision.revision}
        </h1>
        <p>Izveštaj je izdat. Podaci ove revizije su zaključani.</p>
        <p role="status">
          PDF čeka izradu. Preuzimanje i deljenje biće dostupni kada PDF bude
          spreman.
        </p>
        <p>
          Izdato:{" "}
          {new Date(revision.issuedAt).toLocaleString(revision.data.locale, {
            timeZone: revision.data.timeZone,
          })}{" "}
          · {revision.data.issuer}
        </p>
        <Link href={`/visits/${revision.visitId}/review`}>Nazad na posetu</Link>
      </div>
      <ReportDocument report={revision.data} />
    </>
  );
}
