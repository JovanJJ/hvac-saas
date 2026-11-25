"use client";
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { FieldSummary } from "@/features/field/presentation";
import { SystemResult } from "@/features/reports/document";
import { LifecycleHost, DeviceCleanupControl } from "./lifecycle-control";
import { requestLifecycle } from "@/lib/offline/lifecycle";
import { RecoveryPanel } from "./recovery-panel";
import { RetainedWorkPanel } from "./retained-work";
import { SyncControl } from "./sync-control";
import { SubmissionControl } from "./submission-control";
import { LocalPhotoPanel } from "./photo-panel";
import { DraftEditor } from "./draft-editor";
import type { OfflineBundle, OfflineIdentity } from "./model";
import {
  activeIdentity,
  listBundles,
  listDrafts,
  verifyIdentity,
  currentEpoch,
  changeEvent,
  type FieldDraft,
} from "@/lib/offline/storage";
const entry = "/offline/v2/index.html";
const visitId =
  location.pathname.match(/^\/visits\/([0-9a-f-]{36})$/i)?.[1] ||
  new URL(location.href).searchParams.get("visit");
const date = (value: string, zone: string) =>
  new Date(value).toLocaleString("sr-Latn-RS", { timeZone: zone });
function VisitDetails({
  identity,
  bundle,
  drafts,
  persist,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
  drafts: FieldDraft[];
  persist: (draft: FieldDraft | null, id: string) => void;
}) {
  const visit = bundle.visit,
    editable = ["scheduled", "in_progress"].includes(visit.status);
  const items = visit.items.map((i) => {
    const draft = drafts.find((d) => d.itemId === i.id);
    return draft
      ? {
          ...i,
          ...draft.values,
          followUp: draft.values.followUp
            ? { ...i.followUp, ...draft.values.followUp }
            : null,
        }
      : i;
  });
  return (
    <>
      <a className="button" href={entry}>
        Preuzete posete
      </a>
      <h1>{visit.site}</h1>
      <p>
        {visit.customer} · {visit.address}
      </p>
      <p>
        {date(visit.start, visit.timeZone)} · {visit.timeZone}
      </p>
      <p>Preuzeto: {date(bundle.downloadedAt, visit.timeZone)}</p>
      {visit.contact && <p>Kontakt: {visit.contact}</p>}
      {visit.accessNote && <p className="card">Pristup: {visit.accessNote}</p>}
      {visit.correctionReason && (
        <p className="card">Zatražena dopuna: {visit.correctionReason}</p>
      )}
      {bundle.source && (
        <section className="card">
          <h2>Izvorni nalaz · {bundle.source.code}</h2>
          <p>
            {bundle.source.finding ||
              bundle.source.noAccessReason ||
              bundle.source.work}
          </p>
          <p>{bundle.source.customerAction}</p>
        </section>
      )}
      {drafts.length > 0 && (
        <p>Lokalni pregled · izmene još nisu potvrđene na serveru.</p>
      )}
      <div id={`visit-${visit.id}-summary`} tabIndex={-1}><FieldSummary items={items} local editable={editable} /></div>
      <RecoveryPanel identity={identity} bundle={bundle} />
      {visit.items.map((item) =>
        editable ? (
          <div key={item.id} id={`system-${item.id}`} tabIndex={-1} className="field-system">
            <DraftEditor
              key={`${item.id}:${item.version}:${drafts.find((d) => d.itemId === item.id)?.reconcileFrom ?? ""}`}
              identity={identity}
              bundle={bundle}
              item={item}
              draft={drafts.find((d) => d.itemId === item.id)}
              onPersist={persist}
            />
            <LocalPhotoPanel
              identity={identity}
              bundle={bundle}
              itemId={item.id}
              code={item.code}
              editable
            />
          </div>
        ) : (
          <section className="card" key={item.id} id={`system-${item.id}`} tabIndex={-1}>
            <SystemResult item={item} />
            <LocalPhotoPanel
              identity={identity}
              bundle={bundle}
              itemId={item.id}
              code={item.code}
              editable={false}
            />
            {item.followUp && (
              <p>
                {item.followUp.kind === "quote"
                  ? "Priprema ponude"
                  : item.followUp.kind === "repair"
                    ? "Popravka"
                    : "Ponovni dolazak"}{" "}
                · Rok: {item.followUp.dueDate}
              </p>
            )}
          </section>
        ),
      )}
      {!editable && (
        <p>Poseta je predata ili izdata. Dostupan je samo pregled.</p>
      )}
      {drafts.some((d) => d.status === "queued") && (
        <p role="status">Čeka slanje. Podaci još nisu poslati kancelariji.</p>
      )}
      {editable && <SubmissionControl identity={identity} visitId={visit.id} />}
      <p>
        Fotografije na serveru: {bundle.photoCount}. Fotografije sa ovog
        telefona prikazane su uz sistem; ostale zahtevaju vezu.
      </p>
      {drafts.length ? (
        <p>
          Otvorite nacrte da nastavite rad. Predaja posete zahteva potvrdu
          servera.
        </p>
      ) : (
        <a className="button" href={`/visits/${visit.id}`}>
          Otvori unos uz vezu
        </a>
      )}
    </>
  );
}
function App() {
  const [identity, setIdentity] = useState<OfflineIdentity | null>(null),
    [bundles, setBundles] = useState<OfflineBundle[]>([]),
    [drafts, setDrafts] = useState<FieldDraft[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let mounted = true,
      epoch = currentEpoch(),
      version = 0;
    async function load() {
      const current = ++version;
      try {
        const scope = await activeIdentity();
        const records = scope ? await listBundles(scope) : [];
        const local = scope && visitId ? await listDrafts(scope, visitId) : [];
        if (
          !mounted ||
          current !== version ||
          (scope && scope.epoch !== currentEpoch())
        )
          return;
        setIdentity(scope);
        setBundles(records);
        setDrafts(local);
        setError("");
        setLoading(false);
      } catch {
        if (mounted && current === version) {
          setIdentity(null);
          setError(
            "Memorija telefona nije dostupna. Nijedan nacrt nije prikazan.",
          );
          setLoading(false);
        }
      }
    }
    async function refresh() {
      try {
        if (navigator.onLine) await verifyIdentity();
      } catch {
        /* A 401 locks the partition; a network failure preserves offline work. */
      }
      await load();
    }
    const changed = () => {
      void load();
    };
    const hide = () => {
      setIdentity(null);
      setBundles([]);
      setDrafts([]);
    };
    const timer = setInterval(() => {
      if (epoch !== currentEpoch()) {
        epoch = currentEpoch();
        hide();
        void refresh();
      }
    }, 300);
    window.addEventListener(changeEvent, changed);
    window.addEventListener("storage", changed);
    window.addEventListener("online", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("pagehide", hide);
    void load();
    void refresh();
    return () => {
      mounted = false;
      clearInterval(timer);
      window.removeEventListener(changeEvent, changed);
      window.removeEventListener("storage", changed);
      window.removeEventListener("online", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  function persist(draft: FieldDraft | null, itemId: string) {
    setDrafts((current) => [
      ...current.filter((d) => d.itemId !== itemId),
      ...(draft ? [draft] : []),
    ]);
  }
  if (loading) return <p role="status">Učitavanje sa telefona…</p>;
  if (error)
    return (
      <>
        <h1>Preuzete posete</h1>
        <p role="alert">{error}</p>
        <a href="/today">Otvori Danas uz vezu</a>
      </>
    );
  if (!identity)
    return (
      <>
        <h1>Preuzete posete</h1>
        <p>
          Povežite se i otvorite Danas da biste potvrdili nalog i radni prostor
          za ovaj telefon.
        </p>
        <a href="/today">Otvori Danas uz vezu</a>
        <p>
          Sesija može biti istekla. Neposlati rad je zadržan; nastavite istim
          nalogom i radnim prostorom.
        </p>
        <a href="/sign-in">Prijavi se ponovo</a>
      </>
    );
  const selected = bundles.find((b) => b.visit.id === visitId);
  return (
    <>
      <header>
        <p className="muted">teren. · {identity.organizationName}</p>
        <p className="muted">Nalog: {identity.userLabel}</p>
        <p>
          Unos se čuva na telefonu. Podaci nisu poslati dok ih server ne
          potvrdi.
        </p>
      </header>
      <SyncControl />
      <RetainedWorkPanel identity={identity} />
      {visitId ? (
        selected ? (
          <VisitDetails
            identity={identity}
            bundle={selected}
            drafts={drafts}
            persist={persist}
          />
        ) : (
          <>
            <h1>Poseta nije preuzeta</h1>
            <p>
              Ova poseta nije dostupna bez veze u trenutnom nalogu i radnom
              prostoru. Preuzmite je na ekranu Danas dok ste povezani.
            </p>
            <a className="button" href={entry}>
              Preuzete posete
            </a>
          </>
        )
      ) : (
        <>
          <h1>Preuzete posete</h1>
          {!bundles.length && (
            <p>
              Nema preuzetih poseta za ovaj nalog i radni prostor. Preuzmite
              posetu na ekranu Danas uz vezu.
            </p>
          )}
          {bundles
            .sort((a, b) => a.visit.start.localeCompare(b.visit.start))
            .map((b) => (
              <DownloadedVisit
                key={b.visit.id}
                identity={identity}
                bundle={b}
                removed={() =>
                  setBundles((all) =>
                    all.filter((row) => row.visit.id !== b.visit.id),
                  )
                }
              />
            ))}
          <a className="button" href="/today">
            Otvori Danas uz vezu
          </a>
        </>
      )}
    </>
  );
}
function DownloadedVisit({
  identity,
  bundle,
  removed,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
  removed: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <article className="card">
      <h2>{bundle.visit.site}</h2>
      <p>{bundle.visit.address}</p>
      <p>{date(bundle.visit.start, bundle.visit.timeZone)}</p>
      <p>
        {bundle.visit.items.length} sistema · Preuzeto:{" "}
        {date(bundle.downloadedAt, bundle.visit.timeZone)}
      </p>
      <a className="button" href={`${entry}?visit=${bundle.visit.id}`}>
        Otvori preuzetu posetu
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            if (
              await requestLifecycle({
                kind: "remove",
                identity,
                visitId: bundle.visit.id,
              })
            )
              removed();
          } catch (e) {
            setError(
              e instanceof Error && e.message === "local_work_pending"
                ? "Poseta ima neposlate nacrte. Otvorite ih pre uklanjanja kopije."
                : "Uklanjanje nije uspelo. Kopija je zadržana; pokušajte ponovo.",
            );
          }
        }}
      >
        Ukloni sa telefona
      </button>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
createRoot(document.getElementById("app")!).render(
  <>
    <LifecycleHost />
    <DeviceCleanupControl />
    <App />
  </>,
);
