import { FieldIssueLink } from "./issue-link";
import { ReportTotals } from "@/features/reports/document";
import { outcomeLabels } from "@/features/visits/model";

export type FieldItem = {
  id: string; code: string; room: string; outcome: keyof typeof outcomeLabels; planned: boolean;
  finding?: string; noAccessReason?: string;
  followUp: { ownerId?: string | null; dueDate?: string | null; state?: string; managedAt?: string | null } | null;
};
export type FieldIssue = { itemId: string; field: "outcome" | "followUp" | "owner" | "deadline" | "finding" | "noAccessReason"; message: string };
export const fieldTarget = (itemId: string, field: string) => `field-${itemId}-${field}`;
export function fieldIssues(items: FieldItem[]): FieldIssue[] {
  return items.flatMap(item => {
    const issues: FieldIssue[] = [];
    const add = (field: FieldIssue["field"], message: string) => issues.push({ itemId: item.id, field, message: `${item.code}: ${message}` });
    if (item.outcome === "pending") add("outcome", "unesite ishod.");
    if (["repair_needed", "no_access"].includes(item.outcome) && !item.followUp) add("followUp", "dodajte sledeću radnju.");
    if (item.followUp && !item.followUp.ownerId) add("owner", "izaberite odgovornog člana tima.");
    if (item.followUp && !item.followUp.dueDate) add("deadline", "unesite rok radnje.");
    if (item.outcome === "repair_needed" && !item.finding?.trim()) add("finding", "opišite nalaz.");
    if (item.outcome === "no_access" && !item.noAccessReason?.trim()) add("noAccessReason", "unesite razlog bez pristupa.");
    return issues;
  });
}
export function FieldValidation({ issues }: { issues: FieldIssue[] }) {
  if (!issues.length) return null;
  return <ul className="field-validation" aria-label="Potrebne dopune">{issues.map(issue => <li key={`${issue.itemId}-${issue.field}`}><FieldIssueLink href={`#${fieldTarget(issue.itemId, issue.field)}`}>{issue.message}</FieldIssueLink></li>)}</ul>;
}
export function FieldIdentity({ code, room, model, serial, planned }: { code: string; room: string; model?: string; serial?: string; planned: boolean }) {
  return <header className="field-identity"><p className="field-eyebrow">{planned ? "Planiran sistem" : "Dodat na terenu"}</p><h2>{code} · {room}</h2><p>{[model,serial].filter(Boolean).join(" · ") || "Model i serijski broj nisu uneti."}</p></header>;
}
export function FieldSummary({ items, local = false, editable = true, showTotals = true }: { items: FieldItem[]; local?: boolean; editable?: boolean; showTotals?: boolean }) {
  const issues = editable ? fieldIssues(items) : [];
  const title = editable ? "Pregled pre predaje" : "Pregled predate posete";
  return <section className="card field-summary" aria-label={title}>
    <h2>{title}</h2>
    <p>{!editable ? "Predato kancelariji · dostupan je pregled potvrđenih podataka." : local ? "Lokalni pregled · sačuvano na telefonu nije potvrda prijema kancelarije." : "Pregled sačuvanih podataka na serveru. Sačuvajte izmene svakog sistema pre predaje."}</p>
    {showTotals && <ReportTotals counts={{ planned: items.filter(item=>item.planned).length, inspected: items.filter(item=>["serviced","repair_needed"].includes(item.outcome)).length, actions: items.filter(item=>item.followUp && item.followUp.state!=="completed").length }} />}
    <nav aria-label="Sistemi posete" className="field-system-links">{items.map(item => <a key={item.id} href={`#system-${item.id}`}>{item.code} · {item.room}<span>{outcomeLabels[item.outcome]}</span></a>)}</nav>
    <FieldValidation issues={issues} />
    {editable && !issues.length && <p>Ishodi, odgovorni članovi i rokovi su uneti. Proverite fotografije i završite predaju.</p>}
  </section>;
}
