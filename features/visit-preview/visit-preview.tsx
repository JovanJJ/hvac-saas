"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  CustomerReport,
  ItemDetails,
  Status,
  Totals,
} from "./components";
import ItemForm from "./item-form";
import { createItems, Item, validateItem, visit } from "./model";

type View = "today" | "visit" | "item" | "summary" | "office" | "report";
const titles: Record<View, string> = {
  today: "Danas",
  visit: "Radna poseta",
  item: "Unos nalaza",
  summary: "Pregled i predaja",
  office: "Kancelarijska provera",
  report: "Pregled za klijenta",
};
export default function VisitPreview() {
  const [items, setItems] = useState(createItems);
  const [view, setView] = useState<View>("today");
  const [selected, setSelected] = useState("KL-01");
  const [submitted, setSubmitted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const errors = items.flatMap((item) =>
    validateItem(item).map((message) => ({ code: item.code, message })),
  );
  function navigate(next: View) {
    setView(next);
    requestAnimationFrame(() => {
      heading.current?.focus();
      window.scrollTo(0, 0);
    });
  }
  function edit(code: string) {
    setSelected(code);
    navigate("item");
  }
  function update(item: Item) {
    setItems((current) =>
      current.map((i) => (i.code === item.code ? item : i)),
    );
  }
  function reset() {
    setItems(createItems());
    setSubmitted(false);
    setShowErrors(false);
    navigate("today");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          t<span>e</span>ren<span className="brand-dot">.</span>
        </Link>
        <p className="sidebar-caption">HVAC SERVIS</p>
        <nav aria-label="Probna navigacija">
          <button
            aria-current={
              ["today", "visit", "item", "summary"].includes(view)
                ? "page"
                : undefined
            }
            onClick={() => navigate("today")}
          >
            <span aria-hidden="true">◷</span> Danas
          </button>
          <button
            aria-current={
              ["office", "report"].includes(view) ? "page" : undefined
            }
            onClick={() => navigate("office")}
          >
            <span aria-hidden="true">▤</span> Kancelarija{" "}
            {submitted && <span className="nav-count">1</span>}
          </button>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">MP</div>
          <div>
            <strong>{visit.technician}</strong>
            <small>Probni tehničar</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <div className="demo-banner">
          <span>
            <strong>Probni radni prostor</strong> · Izmišljeni podaci, bez
            slanja i čuvanja na serveru.
          </span>
          <button onClick={reset}>Počni ponovo ↻</button>
        </div>
        <header className="topbar">
          <span>
            Primer servis{" "}
            <span className="muted">
              /{" "}
              {view === "office" || view === "report" ? "Kancelarija" : "Teren"}
            </span>
          </span>
          <span className="desktop-only">Ponedeljak, 16. novembar 2026.</span>
        </header>
        <main id="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {view === "today" ? "VAŠ RASPORED" : visit.reference}
              </span>
              <h1 tabIndex={-1} ref={heading}>
                {titles[view]}
              </h1>
              <p>
                {view === "today"
                  ? "Jedna poseta. Četiri sistema. Sve na jednom mestu."
                  : `${visit.site} · Jagodina`}
              </p>
            </div>
            {view !== "today" && (
              <Button
                secondary
                onClick={() => navigate(view === "report" ? "office" : "today")}
              >
                {view === "report" ? "← Nazad na proveru" : "← Danas"}
              </Button>
            )}
          </div>
          {view === "today" && (
            <>
              <div className="section-label">
                <h2>Zakazana poseta</h2>
                <span>1 poseta</span>
              </div>
              <article className="card visit-card">
                <div className="visit-time">
                  <strong>09:00</strong>
                  <span>do 11:00</span>
                </div>
                <div className="visit-info">
                  <span className="eyebrow">
                    ODRŽAVANJE · {visit.reference}
                  </span>
                  <h2>{visit.site}</h2>
                  <p>{visit.address}</p>
                  <div className="tags">
                    <span>JA-02</span>
                    <span>4 sistema</span>
                    <span>{submitted ? "Predato na proveru" : "Zakazano"}</span>
                  </div>
                  <p className="muted">
                    Kontakt: predstavnik lokacije · dogovor preko kancelarije
                  </p>
                  <p className="access-note">{visit.accessNote}</p>
                  <Button
                    onClick={() => navigate(submitted ? "office" : "visit")}
                  >
                    {submitted ? "Otvori predatu posetu →" : "Otvori posetu →"}
                  </Button>
                </div>
              </article>
              <p className="session-note">
                Probna sesija · Izmene se brišu osvežavanjem stranice.
              </p>
            </>
          )}
          {view === "visit" && (
            <>
              <div className="card site-strip">
                <div>
                  <strong>{visit.siteCode} · Održavanje</strong>
                  <p>
                    {visit.date} · {visit.window} · {visit.technician}
                  </p>
                </div>
                <span className="status">
                  {submitted ? "Predato na proveru" : "Radni unos"}
                </span>
              </div>
              <Totals items={items} />
              <div className="section-label">
                <h2>Sistemi na lokaciji</h2>
                <span>Sva 4 sistema su planirana</span>
              </div>
              <div className="system-grid">
                {items.map((item) => (
                  <button
                    key={item.code}
                    className="card system-card"
                    onClick={() =>
                      submitted ? navigate("office") : edit(item.code)
                    }
                  >
                    <div className="row">
                      <span className="system-code">{item.code}</span>
                      <span aria-hidden="true">↗</span>
                    </div>
                    <h3>{item.room}</h3>
                    <p>{item.model}</p>
                    <Status item={item} />
                  </button>
                ))}
              </div>
              <div className="actions">
                <Button
                  onClick={() => navigate(submitted ? "office" : "summary")}
                >
                  {submitted
                    ? "Otvori kancelarijsku proveru"
                    : "Pregledaj i predaj →"}
                </Button>
              </div>
            </>
          )}
          {view === "item" && !submitted && (
            <ItemForm
              key={selected}
              item={items.find((i) => i.code === selected)!}
              onChange={update}
              onSave={() => navigate("visit")}
            />
          )}
          {view === "summary" && (
            <>
              <Totals items={items} />
              {items.map((item) => (
                <div key={item.code} className="summary-item">
                  <ItemDetails item={item} />
                  <Button secondary onClick={() => edit(item.code)}>
                    Izmeni {item.code}
                  </Button>
                </div>
              ))}
              {showErrors && errors.length > 0 && (
                <div className="errors" role="alert">
                  <h2>Poseta još nije spremna za predaju</h2>
                  <ul>
                    {errors.map(({ code, message }) => (
                      <li key={`${code}-${message}`}>
                        <button onClick={() => edit(code)}>
                          {code}: {message}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="card handover">
                <h2>Predaja kancelariji</h2>
                <p>
                  Otvorene radnje ostaju vidljive sa odgovornim osobama i
                  rokovima.
                </p>
                <Button
                  onClick={() => {
                    setShowErrors(true);
                    if (!errors.length) {
                      setSubmitted(true);
                      navigate("office");
                    }
                  }}
                >
                  Predaj na proveru
                </Button>
              </div>
            </>
          )}
          {view === "office" &&
            (!submitted ? (
              <div className="card empty-state">
                <h2>Nema poseta za proveru</h2>
                <p>
                  Unesite ishode i predajte probnu posetu iz terenskog pregleda.
                </p>
                <Button onClick={() => navigate("visit")}>Otvori posetu</Button>
              </div>
            ) : (
              <>
                <div className="success" role="status">
                  Poseta je predata na proveru u ovoj probnoj sesiji.
                </div>
                <Totals items={items} />
                <div className="section-label">
                  <h2>Rezultati terenskog rada</h2>
                  <span>Tehničar: {visit.technician}</span>
                </div>
                {items.map((item) => (
                  <ItemDetails key={item.code} item={item} />
                ))}
                <div className="card handover">
                  <h2>Spremno za pregled izveštaja</h2>
                  <p>
                    Proverite nalaze i naredne korake pre budućeg izdavanja.
                  </p>
                  <div className="actions">
                    <Button onClick={() => navigate("report")}>
                      Pregled za klijenta →
                    </Button>
                    <Button
                      secondary
                      onClick={() => {
                        setSubmitted(false);
                        navigate("visit");
                      }}
                    >
                      Vrati na doradu
                    </Button>
                  </div>
                </div>
              </>
            ))}
          {view === "report" && submitted && (
            <>
              <p className="preview-note">
                Probni A4 prikaz · Izdavanje i slanje izveštaja dolaze u
                narednim fazama.
              </p>
              <CustomerReport items={items} />
            </>
          )}
        </main>
        <footer className="workspace-footer">
          TEREN · Probni prikaz M0 <span>Podaci nisu trajno sačuvani</span>
        </footer>
      </div>
    </div>
  );
}
