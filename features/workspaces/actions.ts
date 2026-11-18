"use server";
import { rotateOfflineEpoch } from "@/lib/offline/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authCookieOptions, appOrigin } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { accountWorkspaces, requireUser } from "@/features/auth/dal";
import {
  hashInvitation,
  landingPath,
  onboardingCookie,
  workspaceCookie,
} from "./dal";
import {
  idSchema,
  inviteSchema,
  memberSchema,
  tokenSchema,
  updateWorkspaceSchema,
  workspaceSchema,
} from "./validation";
import type { MutationState } from "./types";

const fail = (
  message = "Promena nije sačuvana. Osvežite stranicu i pokušajte ponovo.",
): MutationState => ({ status: "error", message });
function databaseFailure(error: {
  code?: string;
  message?: string;
}): MutationState {
  if (error.message === "last_active_owner")
    return fail("Radni prostor mora imati najmanje jednog aktivnog vlasnika.");
  if (error.message === "invitation_email_mismatch")
    return fail(
      "Email naloga ne odgovara pozivu. Prijavite se pozvanom adresom.",
    );
  if (error.message === "invitation_unavailable")
    return fail(
      "Poziv je istekao, opozvan ili više nije dostupan. Zatražite novi poziv.",
    );
  if (error.code === "42501") return fail("Nemate dozvolu za ovu promenu.");
  if (error.code === "PT409")
    return fail(
      "Podaci su u međuvremenu promenjeni. Osvežite stranicu i pokušajte ponovo.",
    );
  if (error.message === "operation_payload_conflict")
    return fail(
      "Ovaj zahtev je već korišćen sa drugim podacima. Proverite svoje radne prostore ili započnite novi unos.",
    );
  return fail();
}
async function selectOrganization(userId: string, organizationId: string) {
  await rotateOfflineEpoch();
  (await cookies()).set(workspaceCookie(userId), organizationId, {
    ...authCookieOptions(),
    maxAge: 60 * 60 * 24 * 30,
  });
}
export async function beginOnboarding(form: FormData) {
  const user = await requireUser();
  const operation = idSchema.safeParse(form.get("operationId"));
  if (!operation.success) redirect("/account");
  (await cookies()).set(onboardingCookie(user.id), operation.data, {
    ...authCookieOptions(),
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/onboarding");
}
export async function createWorkspace(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  const user = await requireUser();
  const values = Object.fromEntries(form) as Record<string, string>;
  const parsed = workspaceSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      errors: parsed.error.flatten().fieldErrors,
      values,
    };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_workspace", {
    p_operation_id: parsed.data.operationId,
    p_name: parsed.data.name,
    p_time_zone: parsed.data.timeZone,
  });
  if (error) return { ...databaseFailure(error), values };
  await selectOrganization(user.id, data);
  revalidatePath("/", "layout");
  redirect("/office");
}
export async function switchWorkspace(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(form.get("organizationId"));
  if (!parsed.success) return fail("Izaberite radni prostor.");
  const rows = await accountWorkspaces();
  const target = rows.find((row) => row.organization.id === parsed.data);
  if (!target) return fail("Radni prostor više nije dostupan ovom nalogu.");
  await selectOrganization(user.id, target.organization.id);
  revalidatePath("/", "layout");
  redirect(target.role === "technician" ? "/today" : "/office");
}
export async function updateWorkspace(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  await requireUser();
  const values = Object.fromEntries(form) as Record<string, string>;
  const parsed = updateWorkspaceSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      errors: parsed.error.flatten().fieldErrors,
      values,
    };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_workspace", {
    p_organization_id: parsed.data.organizationId,
    p_name: parsed.data.name,
    p_time_zone: parsed.data.timeZone,
    p_version: parsed.data.version,
  });
  if (error) return { ...databaseFailure(error), values };
  revalidatePath("/", "layout");
  return { status: "success", message: "Podaci firme su sačuvani.", values };
}
export async function createInvitation(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  await requireUser();
  const values = Object.fromEntries(form) as Record<string, string>;
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success)
    return {
      status: "error",
      errors: parsed.error.flatten().fieldErrors,
      values,
    };
  const { organizationId, operationId, email, role, token } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_workspace_invitation", {
    p_organization_id: organizationId,
    p_operation_id: operationId,
    p_email: email,
    p_role: role,
    p_token_hash: hashInvitation(token),
  });
  if (error) return { ...databaseFailure(error), values };
  revalidatePath("/settings/team");
  return {
    status: "success",
    message:
      "Poziv je napravljen. Kopirajte link i prosledite ga pozvanoj osobi.",
    invitationUrl: `${appOrigin()}/invite/${token}`,
    values,
  };
}
export async function acceptInvitation(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  const user = await requireUser();
  const parsed = tokenSchema.safeParse(form.get("token"));
  if (!parsed.success) return fail("Poziv nije važeći.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_workspace_invitation", {
    p_token_hash: hashInvitation(parsed.data),
  });
  if (error) return databaseFailure(error);
  await selectOrganization(user.id, data);
  revalidatePath("/", "layout");
  redirect(await landingPath());
}
export async function revokeInvitation(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  await requireUser();
  const organizationId = idSchema.safeParse(form.get("organizationId"));
  const invitationId = idSchema.safeParse(form.get("invitationId"));
  if (!organizationId.success || !invitationId.success) return fail();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_workspace_invitation", {
    p_organization_id: organizationId.data,
    p_invitation_id: invitationId.data,
  });
  if (error) return databaseFailure(error);
  revalidatePath("/settings/team");
  return {
    status: "success",
    message: "Link poziva je opozvan. Članstvo se menja odvojeno.",
  };
}
export async function updateMember(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  await requireUser();
  const parsed = memberSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return fail("Proverite ulogu i stanje članstva.");
  const { organizationId, membershipId, role, active, version } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_workspace_member", {
    p_organization_id: organizationId,
    p_membership_id: membershipId,
    p_role: role,
    p_active: active === "true",
    p_version: version,
  });
  if (error) return databaseFailure(error);
  revalidatePath("/", "layout");
  return { status: "success", message: "Članstvo je sačuvano." };
}
