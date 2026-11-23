"use client";
import { useState, type FormEvent } from "react";
import { datasetIds, datasetLabels, type ExportCatalog } from "./model";
export function ExportForm({ catalog }: { catalog: ExportCatalog }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function download(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const query = new URLSearchParams();
    for (const dataset of form.getAll("dataset")) query.append("dataset", String(dataset));
    if (!query.has("dataset")) { setMessage("Izaberite najmanje jedan skup podataka."); return; }
    query.set("site", catalog.siteId || "");
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/office/exports?${query}`, { cache: "no-store" });
      if (!response.ok) { const result = await response.json(); setMessage(result.message || "Izvoz nije završen."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("Content-Disposition")?.match(/filename="([a-zA-Z0-9._-]+)"/)?.[1] || "teren-export.zip";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setMessage("Preuzimanje je pokrenuto.");
    } catch { setMessage("Veza je prekinuta. Podaci nisu promenjeni; pokušajte ponovo."); }
    finally { setPending(false); }
  }
  return <form onSubmit={download} className="card my-5 space-y-4" aria-label="Preuzimanje izvoza">
    <fieldset disabled={pending}>
      <legend>Skupovi podataka</legend>
      {datasetIds.map(dataset => <label key={dataset} className="my-3 flex items-center gap-3">
        <input type="checkbox" name="dataset" value={dataset} defaultChecked className="w-5" />
        {datasetLabels[dataset]} · {catalog.counts[dataset]} zapisa
      </label>)}
    </fieldset>
    <p>Jedan skup: CSV. Više skupova: ZIP sa CSV fajlovima i opisom obuhvata. Prazan skup sadrži zaglavlja kolona.</p>
    <p>Najviše 10.000 zapisa po skupu; preveliki izvozi traže uži obuhvat i ne preuzimaju se delimično.</p>
    {message && <p role="status">{message}</p>}
    <button className="button primary" disabled={pending}>{pending ? "Priprema izvoza…" : "Preuzmi izvoz"}</button>
  </form>;
}
