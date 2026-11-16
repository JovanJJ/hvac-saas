import { randomUUID } from "node:crypto";
import { operationSnapshot } from "./dal";
import { OperationForm } from "./form";
import { ownerRoster } from "@/features/workspaces/dal";
import type { StaffContext } from "@/features/workspaces/staff-shell";
import { RegisterList } from "./register-list";
import { VisitList } from "./visit-list";
export async function RegisterContent({
  kind,
}: {
  kind: "customer" | "site" | "system";
}) {
  const snapshot = await operationSnapshot();
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
      {(kind === "site" && !snapshot.customers.length) ||
      (kind === "system" && !snapshot.sites.length) ? (
        <p>Prvo dodajte {kind === "site" ? "klijenta" : "lokaciju"}.</p>
      ) : (
        <OperationForm
          kind={kind}
          operationId={randomUUID()}
          snapshot={snapshot}
        />
      )}
      <RegisterList
        rows={rows}
        sites={snapshot.sites}
        customers={snapshot.customers}
      />
    </>
  );
}
export async function SchedulingContent({
  context,
}: {
  context: StaffContext;
}) {
  const snapshot = await operationSnapshot();
  const members = await ownerRoster(context.workspace.organization.id);
  return (
    <>
      <h1>Zakaži posetu</h1>
      {snapshot.systems.length ? (
        <OperationForm
          kind="visit"
          operationId={randomUUID()}
          snapshot={snapshot}
          members={members}
        />
      ) : (
        <p>Prvo dodajte klijenta, lokaciju i sisteme.</p>
      )}
    </>
  );
}
export async function ScheduleContent() {
  const snapshot = await operationSnapshot();
  return (
    <>
      <h1>Raspored</h1>
      <VisitList visits={snapshot.visits} />
    </>
  );
}
