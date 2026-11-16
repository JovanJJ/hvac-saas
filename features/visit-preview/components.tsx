import type { ReactNode } from "react";
import {
  counts,
  formatDate,
  Item,
  needsAction,
  outcomeLabels,
  readingText,
  toCustomerItem,
  visit,
} from "./model";

export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={secondary ? "button secondary" : "button primary"}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Totals({ items }: { items: Item[] }) {
  const totals = counts(items);
  return (
    <dl className="totals" aria-label="Pregled posete">
      <div>
        <dt>Planirano</dt>
        <dd>{totals.planned}</dd>
      </div>
      <div>
        <dt>Pregledano</dt>
        <dd>{totals.inspected}</dd>
      </div>
      <div>
        <dt>Otvorene radnje</dt>
        <dd>{totals.actions}</dd>
      </div>
    </dl>
  );
}
export function Status({ item }: { item: Item }) {
  return (
    <span className={`status ${item.outcome}`}>
      {outcomeLabels[item.outcome]}
    </span>
  );
}
export function ItemDetails({ item }: { item: Item }) {
  return (
    <article className="card detail">
      <div className="row">
        <h3>
          {item.code} · {item.room}
        </h3>
        <Status item={item} />
      </div>
      {item.outcome !== "no_access" && (
        <p>
          <strong>Radovi:</strong> {item.work || "Nisu zabeleženi"}
        </p>
      )}
      {item.finding && (
        <p>
          <strong>Nalaz:</strong> {item.finding}
        </p>
      )}
      <p>
        <strong>Temperatura izduva (hlađenje):</strong> {readingText(item)}
      </p>
      {needsAction(item) && (
        <p className="action-note">
          <strong>
            {item.outcome === "repair_needed" ? "Ponuda" : "Ponovna poseta"}:
          </strong>{" "}
          {item.action}
          <br />
          {item.owner || "Nedostaje odgovorna osoba"} · Rok:{" "}
          {formatDate(item.deadline) || "Nije unet"}
        </p>
      )}
      {item.internalNote && (
        <p className="muted">Interna beleška: {item.internalNote}</p>
      )}
    </article>
  );
}
export function CustomerReport({ items }: { items: Item[] }) {
  return (
    <article className="report" aria-label="Pregled izveštaja za klijenta">
      <header className="report-header">
        <div>
          <span className="eyebrow">PRIMER SERVIS · JAGODINA</span>
          <h2>Izveštaj o servisu</h2>
        </div>
        <strong>
          {visit.reference}
          <br />
          <small>Nacrt · nije izdat</small>
        </strong>
      </header>
      <div className="report-meta">
        <p>
          <strong>{visit.customer}</strong>
          <br />
          {visit.site} · {visit.siteCode}
          <br />
          {visit.address}
        </p>
        <p>
          Datum posete: {visit.date}
          <br />
          {visit.window} · Održavanje
          <br />
          Tehničar: {visit.technician}
        </p>
      </div>
      <Totals items={items} />
      {items.map(toCustomerItem).map((item) => (
        <section className="report-item" key={item.code}>
          <div className="row">
            <h3>
              {item.code} · {item.room}
            </h3>
            <span>{outcomeLabels[item.outcome]}</span>
          </div>
          <p className="muted">{item.model}</p>
          {item.work && (
            <p>
              <strong>Radovi:</strong> {item.work}
            </p>
          )}
          {item.finding && (
            <p>
              <strong>Nalaz:</strong> {item.finding}
            </p>
          )}
          <p>Temperatura izduva (hlađenje): {item.reading}</p>
          {item.action && (
            <p>
              <strong>Sledeći korak:</strong> {item.action}
              <br />
              Odgovorna osoba: {item.owner} · Rok: {formatDate(item.deadline)}
            </p>
          )}
        </section>
      ))}
      <footer>
        <strong>Čeka potvrdu</strong>
        <p>
          Potvrda prijema ne predstavlja odobrenje popravke ili dodatnih
          troškova.
        </p>
        <small>{visit.reference} · Probni pregled · Dokument nije izdat</small>
      </footer>
    </article>
  );
}
