import type { ReactNode } from "react";
import type { CustomerReport } from "./model";

export function GuestFrame({ children }: { children: ReactNode }) {
  return <main className="guest-page">{children}</main>;
}
export function GuestReportHeading({ report, token, confirmed }: { report: CustomerReport; token: string; confirmed: boolean }) {
  const date = new Date(report.start).toLocaleString(report.locale, { timeZone: report.timeZone });
  return <header className="guest-heading">
    <p className="guest-company">{report.branding.displayName}</p>
    <h1>Servisni izveštaj</h1>
    <p className="guest-reference">{report.reference} · Revizija {report.revision}</p>
    <div className="guest-context">
      <p><strong>Lokacija</strong><span>{report.site} · {report.address}</span></p>
      <p><strong>Klijent</strong><span>{report.customer}</span></p>
      <p><strong>Datum posete</strong><span>{date} · {report.timeZone}</span></p>
    </div>
    <div className="guest-actions">
      <a className="button primary" href={`/r/${token}/pdf`}>Preuzmi PDF</a>
      <a className="button secondary" href="#guest-receipt">{confirmed ? "Pogledaj potvrdu prijema" : "Potvrda prijema (opciono)"}</a>
    </div>
    <p className="guest-help">Otvaranje i preuzimanje izveštaja ne potvrđuju prijem i ne odobravaju dodatne radove.</p>
  </header>;
}
export function GuestUnavailable() {
  return <GuestFrame><section className="guest-message" aria-labelledby="guest-unavailable-heading">
    <p className="guest-company">Link za servisni izveštaj</p>
    <h1 id="guest-unavailable-heading">Link nije dostupan</h1>
    <p>Link je neispravan, istekao ili opozvan. Zatražite novi link od servisnog tima.</p>
    <p className="guest-help">Za otvaranje ispravnog linka nije potreban nalog. Proverite da li ste kopirali ceo link iz poruke servisa.</p>
  </section></GuestFrame>;
}
