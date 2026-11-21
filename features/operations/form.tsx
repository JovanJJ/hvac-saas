"use client";
import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { ScheduleFields } from "./schedule-fields";
import { activeRegister } from "./active-register";
import { saveOperation } from "./actions";
import type { Snapshot } from "./types";
export function OperationForm({
  kind,
  operationId,
  snapshot: sourceSnapshot,
  members = [],
  initialSiteId,
  initialCustomerId,
}: {
  kind: "customer" | "site" | "system" | "visit";
  operationId: string;
  snapshot: Snapshot;
  initialSiteId?: string;
  initialCustomerId?: string;
  members?: { membership_id: string; email: string; active: boolean }[];
}) {
  const snapshot = activeRegister(sourceSnapshot);
  const [state, action, pending] = useActionState(saveOperation, {});
  const [site, setSite] = useState(
    snapshot.sites.find((row) => row.id === initialSiteId)?.id ??
      snapshot.sites[0]?.id ??
      "",
  );
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const selected = snapshot.sites.find((row) => row.id === site);
  const fields =
    kind === "customer"
      ? [
          ["name", "Naziv klijenta"],
          ["contact", "Kontakt"],
        ]
      : kind === "site"
        ? [
            ["code", "Oznaka lokacije"],
            ["name", "Naziv lokacije"],
            ["address", "Adresa"],
            ["timeZone", "Vremenska zona"],
            ["accessNote", "Interne napomene za pristup"],
            ["contact", "Kontakt lokacije"],
          ]
        : kind === "system"
          ? [
              ["code", "Oznaka sistema"],
              ["room", "Prostorija"],
              ["model", "Model"],
              ["serial", "Serijski broj"],
              ["manufacturer", "Proizvođač"],
              ["systemType", "Vrsta sistema"],
            ]
          : [];
  return (
    <form
      action={action}
      onReset={(event) => event.preventDefault()}
      className="card space-y-4"
    >
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === "site" && (
        <SelectField
          label="Klijent"
          name="customerId"
          required
          value={
            draft.customerId ??
            snapshot.customers.find((c) => c.id === initialCustomerId)?.id ??
            snapshot.customers[0]?.id ??
            ""
          }
          onChange={(e) => setDraft({ ...draft, customerId: e.target.value })}
        >
          {snapshot.customers.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </SelectField>
      )}
      {(kind === "system" || kind === "visit") && (
        <SelectField
          label="Lokacija"
          name="siteId"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          required
        >
          {snapshot.sites.map((row) => (
            <option key={row.id} value={row.id}>
              {row.code} · {row.name}
            </option>
          ))}
        </SelectField>
      )}
      {fields.map(([name, label]) => (
        <FormField
          key={name}
          name={name}
          id={name}
          label={label}
          value={draft[name] ?? (name === "timeZone" ? "Europe/Belgrade" : "")}
          onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
          maxLength={name === "accessNote" ? 2000 : 120}
          required={
            ![
              "contact",
              "accessNote",
              "model",
              "serial",
              "manufacturer",
              "systemType",
            ].includes(name)
          }
        />
      ))}
      {kind === "visit" && (
        <>
          <p>
            Vremenska zona lokacije: <strong>{selected?.time_zone}</strong>
          </p>
          <SelectField
            label="Vrsta posete"
            name="visitType"
            value={draft.visitType ?? "maintenance"}
            onChange={(e) => setDraft({ ...draft, visitType: e.target.value })}
          >
            <option value="maintenance">Održavanje</option>
            <option value="repair">Popravka</option>
            <option value="installation">Ugradnja</option>
          </SelectField>
          <fieldset key={site}>
            <legend>Sistemi za posetu</legend>
            {snapshot.systems
              .filter((row) => row.site_id === site)
              .map((row) => (
                <label key={row.id} className="flex items-center gap-3">
                  <input
                    className="w-5"
                    type="checkbox"
                    name="systems"
                    value={row.id}
                    defaultChecked={checks[row.id] ?? false}
                    onChange={(e) =>
                      setChecks({ ...checks, [row.id]: e.target.checked })
                    }
                  />
                  {row.code} · {row.room}
                </label>
              ))}
          </fieldset>
          <ScheduleFields
            members={members
              .filter((m) => m.active)
              .map((m) => ({ id: m.membership_id, label: m.email }))}
          />
        </>
      )}
      {state.message && (
        <p role={state.success ? "status" : "alert"}>{state.message}</p>
      )}
      <button
        type="submit"
        className="button primary"
        disabled={pending || state.success}
      >
        {pending ? "Čuvanje…" : "Sačuvaj"}
      </button>
      {state.success && <p>Za sledeći unos osvežite stranicu.</p>}
    </form>
  );
}
