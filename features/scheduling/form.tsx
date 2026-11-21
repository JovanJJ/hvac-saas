"use client";
import { useActionState, useId, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { changeSchedule } from "./actions";
import {
  changeLabels,
  localInput,
  type ScheduleDetail,
  type ChangeKind,
} from "./model";
export function ScheduleChangeForm({
  detail,
  kind,
  operationId,
  staff,
}: {
  detail: ScheduleDetail;
  kind: ChangeKind;
  operationId: string;
  staff: { membership_id: string; email: string; active: boolean }[];
}) {
  const [base] = useState(() => ({ detail, operationId }));
  const [state, action, pending] = useActionState(changeSchedule, {});
  const [draft, setDraft] = useState({
    start: localInput(detail.start, detail.timeZone),
    end: localInput(detail.end, detail.timeZone),
    members: detail.members,
    reason: "",
  });
  const id = useId();
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="card my-5 space-y-4"
      aria-label={changeLabels[kind]}
    >
      <h2>{changeLabels[kind]}</h2>
      <input type="hidden" name="visitId" value={base.detail.id} />
      <input type="hidden" name="operationId" value={base.operationId} />
      <input type="hidden" name="version" value={base.detail.version} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="timeZone" value={base.detail.timeZone} />
      <fieldset disabled={pending || state.success} className="m-0 space-y-4">
        {kind === "reschedule" && (
          <>
            <p>Vremenska zona lokacije: {base.detail.timeZone}</p>
            <FormField
              id={`${id}-start`}
              type="datetime-local"
              name="start"
              label="Novi početak"
              required
              value={draft.start}
              onChange={(event) =>
                setDraft({ ...draft, start: event.target.value })
              }
              errors={state.errors?.start}
            />
            <FormField
              id={`${id}-end`}
              type="datetime-local"
              name="end"
              label="Novi završetak"
              required
              value={draft.end}
              onChange={(event) =>
                setDraft({ ...draft, end: event.target.value })
              }
              errors={state.errors?.end}
            />
          </>
        )}
        {kind === "reassign" && (
          <fieldset>
            <legend>Dodeljeni članovi tima</legend>
            <p>
              Prethodno dodeljeni tehničari gube pravo slanja kada se dodela
              promeni. Njihovi sačuvani nalazi ostaju evidentirani.
            </p>
            {staff
              .filter((member) => member.active)
              .map((member) => (
                <label
                  className="flex items-center gap-3 break-all"
                  key={member.membership_id}
                >
                  <input
                    className="w-5"
                    type="checkbox"
                    name="members"
                    value={member.membership_id}
                    checked={draft.members.includes(member.membership_id)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        members: event.target.checked
                          ? [...draft.members, member.membership_id]
                          : draft.members.filter(
                              (value) => value !== member.membership_id,
                            ),
                      })
                    }
                  />
                  {member.email}
                </label>
              ))}
            {state.errors?.members && (
              <p role="alert">Izaberite najmanje jednog aktivnog člana tima.</p>
            )}
          </fieldset>
        )}
        {kind === "cancel" && (
          <>
            <label htmlFor={`${id}-reason`}>Razlog otkazivanja</label>
            <textarea
              id={`${id}-reason`}
              name="reason"
              required
              maxLength={2000}
              value={draft.reason}
              onChange={(event) =>
                setDraft({ ...draft, reason: event.target.value })
              }
              aria-invalid={!!state.errors?.reason}
            />
            {state.errors?.reason && <p>Unesite razlog otkazivanja.</p>}
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="w-5 shrink-0"
                name="confirmed"
                required
              />
              Potvrđujem otkazivanje. Uneti nalazi, fotografije i istorija
              ostaju sačuvani.
            </label>
          </>
        )}
        <button className="button primary" type="submit">
          {pending
            ? "Čuvanje…"
            : kind === "reschedule"
              ? "Sačuvaj novi termin"
              : kind === "reassign"
                ? "Sačuvaj dodelu"
                : "Otkaži posetu"}
        </button>
      </fieldset>
      {state.message && (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      )}
      {state.success && <p>Osvežite stranicu pre sledeće promene.</p>}
    </form>
  );
}
