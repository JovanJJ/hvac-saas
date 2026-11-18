"use client";
import Link from "next/link";
import { useActionState, useId } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { ScheduleFields } from "@/features/operations/schedule-fields";
import { manageFollowUp } from "./actions";
import type { FollowUp } from "./model";
export function FollowUpForm({
  task,
  kind,
  operationId,
  members,
}: {
  task: FollowUp;
  kind: "assign" | "complete" | "book";
  operationId: string;
  members: { id: string; label: string }[];
}) {
  const id = useId();
  const [state, action, pending] = useActionState(manageFollowUp, {});
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="card my-5 space-y-4"
    >
      <h2>
        {kind === "assign"
          ? "Odgovornost i rok"
          : kind === "complete"
            ? "Završi radnju"
            : "Zakaži povratnu posetu"}
      </h2>
      <input type="hidden" name="actionId" value={task.id} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="version" value={task.version} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "assign" && (
        <>
          <SelectField
            name="ownerId"
            label="Odgovoran"
            defaultValue={task.ownerId}
            required
          >
            <option value="">Izaberite člana tima</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </SelectField>
          <FormField
            id={`${id}-due`}
            name="dueDate"
            label="Rok radnje"
            type="date"
            defaultValue={task.dueDate}
            required
          />
        </>
      )}
      {kind === "complete" && (
        <>
          {task.kind === "quote" && (
            <p>
              Završetak potvrđuje pripremu ponude. Odobrenje ponude je zaseban
              postupak.
            </p>
          )}
          <FormField
            id={`${id}-note`}
            name="note"
            defaultValue={""}
            label="Interna beleška o završetku"
            maxLength={2000}
            required
          />
        </>
      )}
      {kind === "book" && (
        <>
          <p>
            Termin je u zoni {task.timeZone}, za sistem {task.code}. Zakazivanje
            zadržava rok radnje i ostavlja radnju otvorenom.
          </p>
          <ScheduleFields members={members} />
        </>
      )}
      {state.message && (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      )}
      {state.visitId && (
        <Link href={`/visits/${state.visitId}`}>Otvori povratnu posetu</Link>
      )}
      <button
        className="button primary"
        disabled={pending || state.success}
        type="submit"
      >
        {pending
          ? "Čuvanje…"
          : kind === "assign"
            ? "Sačuvaj odgovornost i rok"
            : kind === "complete"
              ? "Potvrdi završetak"
              : "Zakaži povratnu posetu"}
      </button>
    </form>
  );
}
