import { randomUUID } from "node:crypto";
import { operationSnapshot } from "./dal";
import { OperationForm } from "./form";
import { ownerRoster } from "@/features/workspaces/dal";
import type { StaffContext } from "@/features/workspaces/staff-shell";
import { activeRegister } from "./active-register";
import { RegisterList } from "./register-list";
export async function RegisterContent({
  kind,
  selection,
}: {
  kind: "customer" | "site" | "system";
  selection?: Promise<{ site?: string; customer?: string }>;
}) {
  const snapshot = await operationSnapshot();
  const active = activeRegister(snapshot);
  const initial = await selection;
  const rows =
    kind === "customer"
      ? snapshot.customers
      : kind === "site"
        ? snapshot.sites
        : snapshot.systems;
  return (
    <>
      <h1>
        {kind === "customer"
          ? "Klijenti"
          : kind === "site"
            ? "Lokacije"
            : "Sistemi"}
      </h1>
      {(kind === "site" && !active.customers.length) ||
      (kind === "system" && !active.sites.length) ? (
        <p>Prvo dodajte {kind === "site" ? "klijenta" : "lokaciju"}.</p>
      ) : (
        <OperationForm
          kind={kind}
          operationId={randomUUID()}
          snapshot={snapshot}
          initialSiteId={initial?.site}
          initialCustomerId={initial?.customer}
        />
      )}
      <RegisterList
        rows={rows}
        sites={snapshot.sites}
        customers={snapshot.customers}
        kind={kind}
      />
    </>
  );
}
export async function SchedulingContent({
  context,
  selection,
}: {
  context: StaffContext;
  selection?: Promise<{ site?: string }>;
}) {
  const snapshot = await operationSnapshot();
  const active = activeRegister(snapshot);
  const initial = await selection;
  const members = await ownerRoster(context.workspace.organization.id);
  return (
    <>
      <h1>Zakaži posetu</h1>
      {active.systems.length ? (
        <OperationForm
          kind="visit"
          operationId={randomUUID()}
          snapshot={snapshot}
          members={members}
          initialSiteId={initial?.site}
        />
      ) : (
        <p>Prvo dodajte klijenta, lokaciju i sisteme.</p>
      )}
    </>
  );
}
