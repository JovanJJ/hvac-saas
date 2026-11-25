import { OfficeFacts, OfficeNavigation } from "@/components/ui/office-work";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ownerRoster } from "@/features/workspaces/dal";
import { followUps } from "./dal";
import { FollowUpForm } from "./forms";
import { taskLabels } from "./model";
export async function FollowUpDetail({ actionId }: { actionId: string }) {
  if (!z.string().uuid().safeParse(actionId).success) notFound();
  const { context, actions } = await followUps();
  const task = actions.find((a) => a.id === actionId);
  if (!task) notFound();
  const roster = await ownerRoster(context.workspace.organization.id);
  const members = roster
    .filter((m) => m.active)
    .map((m) => ({ id: m.membership_id, label: m.email }));
  return (
    <>
      <Link href="/office/actions">Sve radnje</Link>
      <h1>
        {taskLabels[task.kind]} · {task.code}
      </h1>
      <p>
        {task.customer} · {task.site} · {task.room}
      </p>
      <OfficeNavigation items={[
        { label: "Izvorni sistem i fotografije", href: `/visits/${task.visitId}/review#system-${task.itemId}` },
        { label: "Sve radnje", href: "/office/actions" },
      ]} />
      <section className="card my-5">
        <h2>Izvorni nalaz</h2>
        <p>{task.finding || task.noAccessReason || task.work}</p>
        {task.customerAction && (
          <p>Potrebno od klijenta: {task.customerAction}</p>
        )}
        <Link href={`/visits/${task.visitId}/review#system-${task.itemId}`}>
          Otvori izvorni sistem
        </Link>
      </section>
      <OfficeFacts items={[
        { label: "Stanje radnje", value: task.state === "open" ? "Otvoreno" : "Završeno" },
        { label: "Odgovoran", value: task.owner || "Nedostaje" },
        { label: "Rok radnje", value: task.dueDate || "Nedostaje" },
      ]} />
      <p className="office-state">Rok radnje i termin povratne posete nisu isti podatak. Zakazivanje samo po sebi ne završava radnju.</p>
      {task.returnVisitId && (
        <section className="card my-5">
          <h2>Zakazana povratna poseta</h2>
          <p>
            {new Date(task.returnStart!).toLocaleString("sr-Latn-RS", {
              timeZone: task.timeZone,
            })}{" "}
            · {task.timeZone}
          </p>
          <Link href={`/visits/${task.returnVisitId}`}>
            Otvori povratnu posetu
          </Link>
        </section>
      )}
      {task.state === "completed" ? (
        <section className="card my-5">
          <h2>Završena radnja</h2>
          <p>{task.completionNote}</p>
          <p>
            {task.completedBy} ·{" "}
            {new Date(task.completedAt!).toLocaleString("sr-Latn-RS", {
              timeZone: task.timeZone,
            })}
          </p>
        </section>
      ) : (
        <>
          <FollowUpForm
            key={`assign:${task.version}`}
            task={task}
            kind="assign"
            members={members}
            operationId={randomUUID()}
          />
          <FollowUpForm
            key={`complete:${task.version}`}
            task={task}
            kind="complete"
            members={members}
            operationId={randomUUID()}
          />
          {task.kind !== "quote" && !task.returnVisitId && (
            <FollowUpForm
              key={`book:${task.version}`}
              task={task}
              kind="book"
              members={members}
              operationId={randomUUID()}
            />
          )}
        </>
      )}
      <p>Promene radnje ne menjaju već izdate izveštaje.</p>
    </>
  );
}
