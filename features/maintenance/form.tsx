"use client";
import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { FormField } from "@/components/ui/form-field";
import { planAction, type PlanState } from "./actions";
import { Occurrences } from "./occurrences";
import type { EditorOptions, PlanDetail, PlanInput } from "./model";
type PlanDraft = Omit<PlanInput, "intervalMonths" | "durationMinutes"> & {
  intervalMonths: string | number;
  durationMinutes: string | number;
};
export function PlanForm({
  options,
  detail,
  planId,
  operationId,
}: {
  options: EditorOptions;
  detail?: PlanDetail;
  planId: string;
  operationId: string;
}) {
  const id = useId();
  const [base] = useState({ version: detail?.version ?? 0, planId });
  const [draft, setDraft] = useState<PlanDraft>(() =>
    detail
      ? {
          ...detail,
          members: detail.members.filter((id) =>
            options.staff.some((m) => m.id === id),
          ),
        }
      : {
          siteId: options.site!.id,
          name: "Redovno održavanje",
          anchorDate: options.today,
          anchorTime: "08:00",
          intervalMonths: 6,
          durationMinutes: 60,
          timeZone: options.site!.timeZone,
          systems: [],
          members: options.defaultMember ? [options.defaultMember] : [],
        },
  );
  const [outsideOptions] = useState(() =>
    (detail?.systems ?? []).filter(
      (id) => !options.systems.some((system) => system.id === id),
    ),
  );
  const [zone] = useState(options.site!.timeZone);
  const [from, setFrom] = useState(options.today);
  const [operation, setOperation] = useState(operationId);
  const [revision, setRevision] = useState(operationId);
  const [state, action, pending] = useActionState(planAction, {} as PlanState);
  function change() {
    setRevision(crypto.randomUUID());
    setOperation(crypto.randomUUID());
  }
  function patch(
    key: keyof Omit<PlanDraft, "members" | "systems">,
    value: string | number,
  ) {
    setDraft({ ...draft, [key]: value });
    change();
  }
  function check(key: "systems" | "members", value: string, enabled: boolean) {
    setDraft({
      ...draft,
      [key]: enabled
        ? [...draft[key], value]
        : draft[key].filter((v) => v !== value),
    });
    change();
  }
  return (
    <form
      action={action}
      className="card my-5 space-y-4"
      onReset={(e) => e.preventDefault()}
      aria-label={detail ? "Izmena plana" : "Novi plan"}
    >
      <h2>{detail ? "Uredi plan" : "Novi plan"}</h2>
      <p>
        Lokacija: {options.site!.code} · {options.site!.name} · {zone}
      </p>
      <p>
        Datum i vreme su lokalno sidro ponavljanja. Kraj meseca se skraćuje bez
        pomeranja izvornog dana; nepostojeće vreme ide na prvo važeće, a kod
        dvostrukog vremena bira se raniji termin.
      </p>
      <input type="hidden" name="siteId" value={draft.siteId} />
      <input type="hidden" name="timeZone" value={zone} />
      <input type="hidden" name="planId" value={base.planId} />
      <input type="hidden" name="version" value={base.version} />
      <input type="hidden" name="operationId" value={operation} />
      <input type="hidden" name="revision" value={revision} />
      <fieldset disabled={pending || state.success} className="m-0 space-y-4">
        <FormField
          id={`${id}-name`}
          name="name"
          label="Naziv plana"
          maxLength={120}
          required
          value={draft.name}
          onChange={(e) => patch("name", e.target.value)}
          errors={state.errors?.name}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`${id}-date`}
            name="anchorDate"
            type="date"
            label="Početni datum (sidro)"
            min="2000-01-01"
            max="2100-12-31"
            required
            value={draft.anchorDate}
            onChange={(e) => patch("anchorDate", e.target.value)}
            errors={state.errors?.anchorDate}
          />
          <FormField
            id={`${id}-time`}
            name="anchorTime"
            type="time"
            label="Lokalno vreme početka"
            required
            value={draft.anchorTime}
            onChange={(e) => patch("anchorTime", e.target.value)}
            errors={state.errors?.anchorTime}
          />
          <FormField
            id={`${id}-interval`}
            name="intervalMonths"
            type="number"
            min={1}
            max={120}
            step={1}
            label="Ponavljanje na broj meseci"
            required
            value={draft.intervalMonths}
            onChange={(e) => patch("intervalMonths", e.target.value)}
            errors={state.errors?.intervalMonths}
          />
          <FormField
            id={`${id}-duration`}
            name="durationMinutes"
            type="number"
            min={15}
            max={1440}
            step={1}
            label="Trajanje posete (minuti)"
            required
            value={draft.durationMinutes}
            onChange={(e) => patch("durationMinutes", e.target.value)}
            errors={state.errors?.durationMinutes}
          />
        </div>
        <fieldset className="space-y-3">
          <legend>Obuhvaćeni sistemi</legend>
          {options.systems.map((s) => (
            <label key={s.id} className="flex items-start gap-3 font-normal">
              <input
                type="checkbox"
                name="systems"
                value={s.id}
                checked={draft.systems.includes(s.id)}
                onChange={(e) => check("systems", s.id, e.target.checked)}
                className="mt-1 w-auto shrink-0"
              />
              <span>
                {s.code} · {s.room}
                {!s.active ? " · Arhiviran — uklonite iz izbora" : ""}
              </span>
            </label>
          ))}
          {outsideOptions.length > 0 && (
            <p>
              Deo postojećeg izbora je van ograničenog prikaza. Ostaje izabran
              dok ga ne uklonite.
            </p>
          )}
          {outsideOptions.map((systemId) => (
            <div key={systemId} className="space-y-2">
              <label className="flex items-start gap-3 font-normal">
                <input
                  type="checkbox"
                  name="systems"
                  value={systemId}
                  checked={draft.systems.includes(systemId)}
                  onChange={(e) => check("systems", systemId, e.target.checked)}
                  className="mt-1 w-auto shrink-0"
                />
                Prethodno izabran sistem · {systemId.slice(0, 8)}
              </label>
              <Link href={`/systems/${systemId}`}>
                Detalji izabranog sistema
              </Link>
            </div>
          ))}
          {state.errors?.systems?.map((error) => (
            <p key={error} role="alert">
              {error}
            </p>
          ))}
        </fieldset>
        <fieldset className="space-y-3">
          <legend>Dodeljeni tim</legend>
          {options.staff.map((m) => (
            <label key={m.id} className="flex items-start gap-3 font-normal">
              <input
                type="checkbox"
                name="members"
                value={m.id}
                checked={draft.members.includes(m.id)}
                onChange={(e) => check("members", m.id, e.target.checked)}
                className="mt-1 w-auto shrink-0"
              />
              {m.label}
            </label>
          ))}
          {detail?.members.some(
            (id) => !options.staff.some((m) => m.id === id),
          ) && (
            <p>
              Plan sadrži neaktivnog člana. Pri čuvanju izaberite aktivan tim.
            </p>
          )}
          {state.errors?.members?.map((error) => (
            <p key={error} role="alert">
              {error}
            </p>
          ))}
        </fieldset>
        <FormField
          id={`${id}-from`}
          type="date"
          name="from"
          label="Pregled od datuma"
          min="2000-01-01"
          max="2200-12-31"
          required
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            change();
          }}
        />
        <div className="flex flex-wrap gap-3">
          <button name="intent" value="preview" className="button secondary">
            Pregledaj termine
          </button>
          <button
            name="intent"
            value={detail ? "edit" : "create"}
            className="button primary"
          >
            {pending ? "Obrada…" : "Sačuvaj plan"}
          </button>
        </div>
      </fieldset>
      {state.message && <p role="status">{state.message}</p>}
      {state.success && (
        <a href={`/maintenance/${base.planId}`}>Učitaj sačuvano stanje</a>
      )}
      {state.occurrences &&
        (state.revision === revision ? (
          <Occurrences
            rows={state.occurrences}
            title="Pregled unetih podataka"
          />
        ) : (
          <p>Podaci su promenjeni. Ponovite pregled termina.</p>
        ))}
    </form>
  );
}
export function PlanToggle({
  detail,
  operationId,
}: {
  detail: PlanDetail;
  operationId: string;
}) {
  const [state, action, pending] = useActionState(planAction, {} as PlanState);
  const label = detail.enabled ? "Pauziraj plan" : "Nastavi plan";
  return (
    <form action={action} className="my-5 space-y-3" aria-label={label}>
      <input type="hidden" name="intent" value="set_enabled" />
      <input type="hidden" name="planId" value={detail.id} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="version" value={detail.version} />
      <input type="hidden" name="enabled" value={String(!detail.enabled)} />
      <button className="button secondary" disabled={pending}>
        {pending ? "Čuvanje…" : label}
      </button>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
