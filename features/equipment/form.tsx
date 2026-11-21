"use client";
import { useActionState, useId, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { maintainRegister } from "./actions";
import { fields } from "./model";
export function RegisterForm({
  entity,
  entityId,
  version,
  operationId,
  action = "update",
  initial = {},
  title,
}: {
  entity: keyof typeof fields;
  entityId: string;
  version: number;
  operationId: string;
  action?: "update" | "archive" | "restore" | "create" | "replace";
  initial?: Record<string, unknown>;
  title: string;
}) {
  const [state, submit, pending] = useActionState(maintainRegister, {});
  // A server refresh must not rebase an open editor or replace its retry identity.
  const [base] = useState(() => ({ version, operationId, initial }));
  const [draft, setDraft] = useState<Record<string, string>>({});
  const id = useId();
  const simple = action === "archive" || action === "restore";
  return (
    <form
      action={submit}
      onReset={(event) => event.preventDefault()}
      className="card my-5 space-y-4"
      aria-label={title}
    >
      <h3>{title}</h3>
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="operationId" value={base.operationId} />
      <input type="hidden" name="version" value={base.version} />
      <input type="hidden" name="action" value={action} />
      <fieldset disabled={pending || state.success} className="m-0 space-y-4">
        {!simple && (
          <>
            {entity === "unit" && (
              <SelectField
                label="Vrsta komponente"
                name="role"
                value={draft.role ?? String(base.initial.role ?? "indoor")}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              >
                <option value="indoor">Unutrašnja jedinica</option>
                <option value="outdoor">Spoljašnja jedinica</option>
              </SelectField>
            )}
            {fields[entity].map(([name, label]) => (
              <FormField
                key={name}
                id={`${id}-${name}`}
                name={name}
                label={label}
                maxLength={
                  name === "accessNote" || name === "contact" ? 2000 : 120
                }
                required={[
                  "name",
                  "code",
                  "room",
                  "address",
                  "timeZone",
                ].includes(name)}
                value={draft[name] ?? String(base.initial[name] ?? "")}
                onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
                errors={state.errors?.[name]}
              />
            ))}
          </>
        )}
        {(action === "archive" || action === "replace") && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="confirmed"
              required
              className="w-5 shrink-0"
            />{" "}
            {action === "replace"
              ? "Potvrđujem zamenu: stara komponenta ostaje u istoriji, a nova dobija svoj zapis."
              : "Potvrđujem arhiviranje. Prethodne posete i izdati izveštaji ostaju sačuvani."}
          </label>
        )}
        <button type="submit" className="button primary">
          {pending
            ? "Čuvanje…"
            : action === "archive"
              ? "Arhiviraj"
              : action === "restore"
                ? "Vrati u upotrebu"
                : action === "replace"
                  ? "Zameni komponentu"
                  : action === "create"
                    ? "Dodaj komponentu"
                    : "Sačuvaj izmene"}
        </button>
      </fieldset>
      {state.message && (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      )}
      {state.success && <p>Za novu izmenu osvežite stranicu.</p>}
    </form>
  );
}
