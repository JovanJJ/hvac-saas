"use client";
import { useEffect, useRef, useState } from "react";
import {
  activeIdentity,
  deviceWork,
  discardDeviceWork,
  lockIdentity,
  removeBundle,
  type DeviceWork,
} from "@/lib/offline/storage";
import { syncDevice } from "@/lib/offline/sync";
import {
  hasUnsaved,
  lifecycleEvent,
  requestLifecycle,
  type LifecycleRequest,
} from "@/lib/offline/lifecycle";
type Pending = { request: LifecycleRequest; resolve: (value: boolean) => void };
const titles = {
  remove: "Uklanjanje preuzete posete",
  switch: "Promena radnog prostora",
  leave: "Promena sesije",
  cleanup: "Čišćenje uređaja",
};
export function LifecycleHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [work, setWork] = useState<DeviceWork | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = useRef<Pending | null>(null);
  function finish(value: boolean) {
    const request = current.current;
    current.current = null;
    dialog.current?.close();
    setPending(null);
    request?.resolve(value);
  }
  useEffect(() => {
    async function receive(event: Event) {
      const next = (event as CustomEvent<Pending>).detail;
      if (current.current) {
        next.resolve(false);
        return;
      }
      current.current = next;
      try {
        if (hasUnsaved()) throw new Error("unsaved");
        if (!next.request.identity && next.request.kind !== "cleanup")
          next.request.identity = (await activeIdentity()) ?? undefined;
        // No active partition on a login page: retain locked work without exposing it.
        if (!next.request.identity && next.request.kind !== "cleanup") {
          await lockIdentity();
          current.current = null;
          next.resolve(true);
          return;
        }
        const summary = await deviceWork(
          next.request.identity,
          next.request.visitId,
        );
        if (
          !summary.pending &&
          next.request.kind !== "cleanup" &&
          next.request.kind !== "leave"
        ) {
          if (next.request.kind === "remove")
            await removeBundle(next.request.identity!, next.request.visitId!);
          else await lockIdentity();
          current.current = null;
          next.resolve(true);
          return;
        }
        if (!summary.records && next.request.kind === "leave") {
          await lockIdentity();
          current.current = null;
          next.resolve(true);
          return;
        }
        setWork(summary);
        setMessage("");
      } catch (error) {
        setWork(null);
        setMessage(
          error instanceof Error && error.message === "unsaved"
            ? "Obrazac sadrži unos koji još nije sačuvan na telefonu. Sačuvajte ili ponovo otvorite obrazac pre nastavka."
            : "Memorija nije dostupna. Zatvorite ostale prozore aplikacije i pokušajte ponovo. Podaci nisu obrisani.",
        );
      }
      setConfirmed(false);
      setPending(next);
    }
    const listener = (event: Event) => {
      void receive(event);
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (hasUnsaved()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener(lifecycleEvent, listener);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener(lifecycleEvent, listener);
      window.removeEventListener("beforeunload", unload);
      current.current?.resolve(false);
      current.current = null;
    };
  }, []);
  useEffect(() => {
    if (pending) dialog.current?.showModal();
  }, [pending]);
  async function act(choice: "keep" | "sync" | "discard") {
    const request = current.current?.request;
    if (!request || (!work && choice !== "keep")) return;
    setBusy(true);
    try {
      if (hasUnsaved())
        throw new Error("Sačuvajte unos u obrascu pre nastavka.");
      if (
        choice === "keep" &&
        (request.kind === "leave" || request.kind === "switch")
      ) {
        // Authentication must remain usable when private storage cannot be opened.
        // lockIdentity rotates the cross-tab marker before attempting its database transaction.
        await lockIdentity().catch(() => {});
        finish(true);
        return;
      }
      if (choice === "sync") {
        if (!navigator.onLine)
          throw new Error("Povežite se pre sinhronizacije. Rad je zadržan.");
        const result = await syncDevice();
        const latest = await deviceWork(request.identity, request.visitId);
        setWork(latest);
        if (latest.pending)
          throw new Error(
            `${result} Pripremite nacrte ili rešite greške u poseti pre nastavka.`,
          );
      }
      if (choice === "discard") {
        await discardDeviceWork(request.identity, request.visitId);
      }
      if (request.kind === "remove") {
        if (choice === "keep") {
          finish(false);
          return;
        }
        if (choice !== "discard")
          await removeBundle(request.identity!, request.visitId!);
      } else if (request.kind !== "cleanup") {
        await lockIdentity().catch(() => {});
      }
      finish(true);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "attempted_work_pending"
          ? "Slanje je već pokušano. Sinhronizujte ili usaglasite rad pre brisanja; zahtev je možda već potvrđen na serveru."
          : error instanceof Error &&
              /^(Povežite|Sačuvajte|Potvrđeno|Nema spremnih)/.test(
                error.message,
              )
            ? error.message
            : "Promena nije završena. Podaci su zadržani; proverite memoriju, nalog i pristup pa pokušajte ponovo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="device-lifecycle-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) finish(false);
      }}
      style={{
        maxWidth: "min(34rem, calc(100vw - 2rem))",
        maxHeight: "85dvh",
        overflow: "auto",
        padding: "1.25rem",
        borderRadius: "12px",
      }}
    >
      {pending && (
        <>
          <h2 id="device-lifecycle-title">{titles[pending.request.kind]}</h2>
          {!work &&
            (pending.request.kind === "leave" ||
              pending.request.kind === "switch") && (
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => void act("keep")}
              >
                Zadrži na uređaju i nastavi
              </button>
            )}
          {work && (
            <>
              <p>
                Neposlatih stavki: {work.pending}. Sačuvanih zapisa:{" "}
                {work.records}.
              </p>
              <p>
                Čuvanje zadržava privatne kopije na ovom uređaju, zaključane za
                isti nalog i radni prostor. Brisanje uklanja samo lokalne
                podatke; ne povlači nalaze već poslate kancelariji.
              </p>
              {!!work.uncertain && (
                <p>
                  Slanje je već pokušano za {work.uncertain} stavki. Pre
                  brisanja proverite potvrdu servera sinhronizacijom ili
                  usaglašavanjem.
                </p>
              )}
              {pending.request.kind !== "cleanup" && (
                <button
                  type="button"
                  disabled={busy}
                  className="button secondary"
                  onClick={() => void act("keep")}
                >
                  {pending.request.kind === "remove"
                    ? "Zadrži posetu"
                    : "Zadrži na uređaju i nastavi"}
                </button>
              )}
              {pending.request.kind !== "cleanup" && (
                <button
                  type="button"
                  disabled={busy}
                  className="button secondary"
                  onClick={() => void act("sync")}
                >
                  Sinhronizuj pa nastavi
                </button>
              )}
              <p>
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.5rem",
                  }}
                >
                  <input
                    type="checkbox"
                    style={{
                      width: 20,
                      height: 20,
                      minHeight: 20,
                      padding: 0,
                      flexShrink: 0,
                      marginTop: 3,
                    }}
                    checked={confirmed}
                    disabled={busy || !!work.uncertain}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{" "}
                  Potvrđujem brisanje lokalnih kopija i neposlatog rada
                  {pending.request.kind === "cleanup"
                    ? " svih naloga na ovom uređaju"
                    : pending.request.kind === "remove"
                      ? " ove posete"
                      : " u ovom radnom prostoru"}
                  .
                </label>
              </p>
              <button
                type="button"
                disabled={busy || !confirmed || !!work.uncertain}
                onClick={() => void act("discard")}
              >
                Obriši lokalno i nastavi
              </button>
            </>
          )}
          {message && <p role="alert">{message}</p>}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            autoFocus
            onClick={() => finish(false)}
          >
            Otkaži
          </button>
        </>
      )}
    </dialog>
  );
}
export function DeviceCleanupControl() {
  const [message, setMessage] = useState("");
  const [upgrade, setUpgrade] = useState(false);
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!("serviceWorker" in navigator)) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        if (navigator.onLine) await registration?.update();
        if (active) setUpgrade(!!registration?.waiting);
      } catch {
        /* The currently installed shell remains usable offline. */
      }
    };
    void check();
    const timer = setInterval(() => {
      void check();
    }, 30000);
    window.addEventListener("online", check);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", check);
    };
  }, []);
  return (
    <aside aria-label="Podaci na uređaju">
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          if (await requestLifecycle({ kind: "cleanup" }))
            setMessage(
              "Privatni podaci svih naloga uklonjeni su sa ovog uređaja. Podaci na serveru su sačuvani.",
            );
        }}
      >
        Očisti podatke ovog uređaja
      </button>
      <button
        type="button"
        className="button secondary"
        onClick={async () => {
          try {
            const persistent = await navigator.storage?.persist?.();
            const estimate = await navigator.storage?.estimate?.();
            const used =
              estimate?.usage === undefined
                ? "nepoznato"
                : `${Math.ceil(estimate.usage / 1048576)} MB`;
            const available =
              estimate?.quota === undefined
                ? "nepoznato"
                : `${Math.max(0, Math.floor((estimate.quota - (estimate.usage ?? 0)) / 1048576))} MB`;
            setMessage(
              `Prostor aplikacije: ${used}; približno slobodno: ${available}. ${persistent ? "Trajno čuvanje je odobreno." : "Pregledač nije odobrio trajno čuvanje."} Brisanje podataka pregledača i dalje uklanja neposlat rad. Sinhronizujte čim možete.`,
            );
          } catch {
            setMessage(
              "Procena memorije nije dostupna. Sinhronizujte čim možete; neuspešan unos ostaje označen kao nesačuvan.",
            );
          }
        }}
      >
        Proveri memoriju uređaja
      </button>
      {upgrade && (
        <p role="status">
          Nova verzija je spremna. Sačuvajte obrasce, zatvorite sve prozore
          aplikacije, pa je ponovo otvorite. Neposlati rad ostaje na uređaju.
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </aside>
  );
}
