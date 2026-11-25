import Link from "next/link";
import { actionLabels } from "@/features/visits/model";
import { RegisterSection } from "./register-ui";
import type { HistoryEntry } from "./model";

export function RegisterOpenActions({ entries, office }: { entries: HistoryEntry[]; office: boolean }) {
  const open = entries.filter(entry => entry.followUp?.state === "open");
  return <RegisterSection id="register-open-actions" title={`Otvorene radnje · ${open.length}`}>
    {!open.length && <p>Nema otvorenih radnji iz predatih nalaza.</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">{open.map(entry => <article key={entry.itemId} className="min-w-0 rounded-xl border border-[#dce4df] bg-white p-5">
      <h3>{entry.code} · {actionLabels[entry.followUp!.kind]}</h3>
      <p>{entry.finding || entry.noAccessReason || entry.work}</p>
      <p>Rok: {entry.followUp!.dueDate}</p>
      {entry.followUp!.customerAction && <p>Potrebno od klijenta: {entry.followUp!.customerAction}</p>}
      {office && <Link className="underline" href={`/visits/${entry.visitId}/review#system-${entry.itemId}`}>Otvori izvorni nalaz</Link>}
    </article>)}</div>
  </RegisterSection>;
}
