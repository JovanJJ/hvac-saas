import {
  outcomeLabels,
  readingLabels,
  actionLabels,
} from "@/features/visits/model";
import { PhotoGallery } from "@/features/evidence/photo-gallery";
import type { CustomerReport, ReportItem } from "./model";
export function ReportTotals({ counts }: { counts: CustomerReport["totals"] }) {
  return (
    <dl className="totals my-5" aria-label="Pregled rezultata">
      <div>
        <dt>Planirano</dt>
        <dd>{counts.planned}</dd>
      </div>
      <div>
        <dt>Pregledano</dt>
        <dd>{counts.inspected}</dd>
      </div>
      <div>
        <dt>Otvorene radnje</dt>
        <dd>{counts.actions}</dd>
      </div>
    </dl>
  );
}
export function SystemResult({
  item,
}: {
  item: Pick<
    ReportItem,
    | "code"
    | "room"
    | "model"
    | "serial"
    | "planned"
    | "outcome"
    | "work"
    | "finding"
    | "noAccessReason"
    | "readings"
    | "parts"
  >;
}) {
  return (
    <section className="card my-4 break-inside-avoid">
      <h2>
        {item.code} · {item.room}
      </h2>
      {(item.model || item.serial) && (
        <p>
          Model: {item.model || "Nije unet"} · Serijski broj:{" "}
          {item.serial || "Nije unet"}
        </p>
      )}
      <p>
        {outcomeLabels[item.outcome]}
        {!item.planned && " · Dodat na terenu"}
      </p>
      {item.work && <p>Radovi: {item.work}</p>}
      {item.finding && <p>Nalaz: {item.finding}</p>}
      {item.noAccessReason && <p>Bez pristupa: {item.noAccessReason}</p>}
      {item.outcome !== "no_access" &&
        item.readings.map((r, index) => (
          <p key={index}>
            {r.kind}:{" "}
            {r.status === "measured"
              ? `${r.value!.toLocaleString("sr-Latn-RS")} ${r.unit}`
              : readingLabels[r.status]}{" "}
            · {r.mode}
          </p>
        ))}
      {item.parts.map((p, index) => (
        <p key={index}>
          Materijal: {p.name} · {p.quantity.toLocaleString("sr-Latn-RS")}{" "}
          {p.unit}
        </p>
      ))}
    </section>
  );
}

export function ReportDocument({ report }: { report: CustomerReport }) {
  return (
    <article
      className="report mx-auto my-6 max-w-[210mm] bg-white p-5 sm:p-10"
      aria-label={
        report.revision
          ? "Izdat servisni izveštaj"
          : "Nacrt servisnog izveštaja"
      }
    >
      <header
        style={{ borderBottom: `2px solid ${report.branding.accentColor}` }}
      >
        <p className="eyebrow" style={{ color: report.branding.accentColor }}>
          {report.branding.displayName}
        </p>
        <h2>
          Servisni izveštaj
          {report.revision ? ` · Revizija ${report.revision}` : " · nacrt"}
        </h2>
        <p>Poseta: {report.reference}</p>
        <p>
          {report.customer} · {report.site}
        </p>
        <p>{report.address}</p>
        {report.contact && <p>Kontakt klijenta: {report.contact}</p>}
        {report.issuedAt && (
          <p>
            Izdato:{" "}
            {new Date(report.issuedAt).toLocaleString(report.locale, {
              timeZone: report.timeZone,
            })}{" "}
            · {report.issuer}
          </p>
        )}
        <p>
          Vrsta posete:{" "}
          {report.visitType === "maintenance"
            ? "Održavanje"
            : report.visitType === "repair"
              ? "Popravka"
              : "Ugradnja"}
        </p>
        <p>Serviseri: {report.technicians.join(", ")}</p>
        <p>
          {new Date(report.start).toLocaleString(report.locale, {
            timeZone: report.timeZone,
          })}
        </p>
      </header>
      <ReportTotals counts={report.totals} />
      {report.items.map((item) => (
        <div key={item.code}>
          <SystemResult item={item} />
          <PhotoGallery
            visitId={report.visitId}
            photos={item.photos}
            customerOnly
          />
          {item.followUp && (
            <p className="mb-5">
              Sledeća radnja: {actionLabels[item.followUp.kind]} ·{" "}
              {item.followUp.owner} · Rok: {item.followUp.dueDate} ·{" "}
              {item.followUp.customerAction}
            </p>
          )}
        </div>
      ))}
      {report.completedAt && (
        <p>
          Predato:{" "}
          {new Date(report.completedAt).toLocaleString(report.locale, {
            timeZone: report.timeZone,
          })}
        </p>
      )}
      <p>Čeka potvrdu klijenta.</p>
    </article>
  );
}
