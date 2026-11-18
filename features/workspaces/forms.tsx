"use client";
import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import type { StaffRole } from "@/lib/supabase/database.types";
import {
  acceptInvitation,
  createInvitation,
  createWorkspace,
  revokeInvitation,
  switchWorkspace,
  updateMember,
  updateWorkspace,
} from "./actions";
import { initialMutationState, type MutationState } from "./types";
import { roleLabels } from "./validation";

export function Feedback({ state }: { state: MutationState }) {
  return state.message ? (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`rounded-md p-3 text-sm ${state.status === "error" ? "bg-[#fff0eb] text-[#8a3528]" : "bg-[#e7f1e5] text-[#305a34]"}`}
    >
      {state.message}
    </p>
  ) : null;
}
function Submit({
  pending,
  children,
}: {
  pending: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? "Obrada…" : children}
    </button>
  );
}
function RoleSelect({
  name = "role",
  value = "technician",
}: {
  name?: string;
  value?: StaffRole;
}) {
  return (
    <SelectField label="Uloga" name={name} defaultValue={value}>
      {Object.entries(roleLabels).map(([role, label]) => (
        <option key={role} value={role}>
          {label}
        </option>
      ))}
    </SelectField>
  );
}
export function WorkspaceForm({
  operationId,
  workspace,
}: {
  operationId?: string;
  workspace?: {
    id: string;
    display_name: string;
    time_zone: string;
    version: number;
  };
}) {
  const [state, action, pending] = useActionState(
    workspace ? updateWorkspace : createWorkspace,
    initialMutationState,
  );
  return (
    <form action={action} className="space-y-5" noValidate>
      {workspace ? (
        <>
          <input type="hidden" name="organizationId" value={workspace.id} />
          <input type="hidden" name="version" value={workspace.version} />
        </>
      ) : (
        <input type="hidden" name="operationId" value={operationId} />
      )}
      <FormField
        id="name"
        name="name"
        label="Naziv firme"
        required
        maxLength={120}
        defaultValue={state.values?.name ?? workspace?.display_name ?? ""}
        errors={state.errors?.name}
      />
      <FormField
        id="timeZone"
        name="timeZone"
        label="Vremenska zona"
        required
        defaultValue={
          state.values?.timeZone ?? workspace?.time_zone ?? "Europe/Belgrade"
        }
        errors={state.errors?.timeZone}
        hint="Na primer Europe/Belgrade ili Europe/Paris."
      />
      <Feedback state={state} />
      <Submit pending={pending}>
        {workspace ? "Sačuvaj podatke" : "Napravi radni prostor"}
      </Submit>
    </form>
  );
}
export function WorkspaceSwitcher({
  workspaces,
  selected,
}: {
  workspaces: {
    role: StaffRole;
    organization: { id: string; display_name: string };
  }[];
  selected?: string;
}) {
  const [state, action, pending] = useActionState(
    switchWorkspace,
    initialMutationState,
  );
  return (
    <form
      action={action}
      data-offline-boundary="switch"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="w-full min-w-0 flex-1">
        <SelectField
          label="Radni prostor"
          name="organizationId"
          defaultValue={selected ?? ""}
        >
          <option value="" disabled>
            Izaberite radni prostor
          </option>
          {workspaces.map((row) => (
            <option key={row.organization.id} value={row.organization.id}>
              {row.organization.display_name} · {roleLabels[row.role]}
            </option>
          ))}
        </SelectField>
      </div>
      <Submit pending={pending}>Otvori radni prostor</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function InvitationForm({
  organizationId,
  operationId,
  token,
  email,
  role,
}: {
  organizationId: string;
  operationId: string;
  token: string;
  email?: string;
  role?: StaffRole;
}) {
  const [state, action, pending] = useActionState(
    createInvitation,
    initialMutationState,
  );
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="operationId" value={operationId} />
      <input type="hidden" name="token" value={token} />
      {email ? (
        <>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="role" value={role} />
        </>
      ) : (
        <>
          <FormField
            id={`invite-email-${operationId}`}
            name="email"
            type="email"
            label="Email nove osobe"
            defaultValue={state.values?.email}
            errors={state.errors?.email}
          />
          <RoleSelect />
        </>
      )}
      <Feedback state={state} />
      {state.invitationUrl && (
        <div className="rounded-md border border-[#dce4df] bg-[#f4f6f3] p-3">
          <label>
            Link poziva
            <input value={state.invitationUrl} readOnly className="min-w-0" />
          </label>
          <button
            type="button"
            className="button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.invitationUrl!);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Kopirano" : "Kopiraj link"}
          </button>
          <p className="text-xs">
            Link je prikazan samo ovde. Novi poziv opoziva prethodni
            neprihvaćeni link za istu adresu.
          </p>
        </div>
      )}
      <Submit pending={pending}>
        {email ? "Ponovo pozovi" : "Napravi poziv"}
      </Submit>
    </form>
  );
}
export function RevokeInvitationForm({
  organizationId,
  invitationId,
}: {
  organizationId: string;
  invitationId: string;
}) {
  const [state, action, pending] = useActionState(
    revokeInvitation,
    initialMutationState,
  );
  return (
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="invitationId" value={invitationId} />
      <Submit pending={pending}>Opozovi link</Submit>
      <Feedback state={state} />
    </form>
  );
}
export function MemberForm({
  organizationId,
  member,
}: {
  organizationId: string;
  member: {
    membership_id: string;
    role: string;
    active: boolean;
    version: number;
  };
}) {
  const [state, action, pending] = useActionState(
    updateMember,
    initialMutationState,
  );
  return (
    <form key={member.version} action={action} className="space-y-3">
      <input type="hidden" name="organizationId" value={organizationId} />
      <input type="hidden" name="membershipId" value={member.membership_id} />
      <input type="hidden" name="version" value={member.version} />
      <div className="form-grid">
        <RoleSelect value={member.role as StaffRole} />
        <SelectField
          label="Stanje članstva"
          name="active"
          defaultValue={String(member.active)}
        >
          <option value="true">Aktivno</option>
          <option value="false">Opozvano</option>
        </SelectField>
      </div>
      <Feedback state={state} />
      <Submit pending={pending}>Sačuvaj članstvo</Submit>
    </form>
  );
}
export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(
    acceptInvitation,
    initialMutationState,
  );
  return (
    <form action={action} className="mt-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <Feedback state={state} />
      <Submit pending={pending}>Prihvati poziv</Submit>
    </form>
  );
}
