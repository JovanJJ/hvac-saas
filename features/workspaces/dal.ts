import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  accountWorkspaces,
  currentUser,
  requireUser,
} from "@/features/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StaffRole } from "@/lib/supabase/database.types";
import { idSchema, tokenSchema } from "./validation";

export const workspaceCookie = (userId: string) => `teren_workspace_${userId}`;
export const onboardingCookie = (userId: string) =>
  `teren_onboarding_${userId}`;
export const hashInvitation = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function newInvitation() {
  return {
    operationId: randomUUID(),
    token: randomBytes(32).toString("base64url"),
  };
}
export const selectedWorkspace = cache(async () => {
  const user = await requireUser();
  const workspaces = await accountWorkspaces();
  const selected = (await cookies()).get(workspaceCookie(user.id))?.value;
  return {
    user,
    workspaces,
    workspace: selected
      ? workspaces.find((row) => row.organization.id === selected)
      : workspaces[0],
  };
});
export async function requireWorkspace(roles?: StaffRole[]) {
  const context = await selectedWorkspace();
  if (!context.workspaces.length) redirect("/onboarding");
  if (!context.workspace || (roles && !roles.includes(context.workspace.role)))
    notFound();
  return { ...context, workspace: context.workspace };
}
export async function landingPath() {
  const user = await currentUser();
  if (!user) return "/sign-in";
  const context = await selectedWorkspace();
  if (!context.workspaces.length) return "/onboarding";
  if (!context.workspace) return "/account";
  return context.workspace.role === "technician" ? "/today" : "/office";
}
export async function ownerRoster(organizationId: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("workspace_roster", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error("Nije moguće učitati članove tima.");
  return data;
}
export async function ownerInvitations(organizationId: string) {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("workspace_invitations", {
    p_organization_id: organizationId,
  });
  if (error) throw new Error("Nije moguće učitati pozive.");
  return data.map((invitation) => ({
    ...invitation,
    expired: new Date(invitation.expires_at).getTime() <= Date.now(),
  }));
}
export async function invitationPreview(token: string) {
  if (!tokenSchema.safeParse(token).success) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("lookup_workspace_invitation", {
    p_token_hash: hashInvitation(token),
  });
  if (error) throw new Error("Poziv trenutno nije dostupan. Pokušajte ponovo.");
  return data?.[0] ?? null;
}
export async function onboardingOperation() {
  const user = await requireUser("/onboarding");
  const value = (await cookies()).get(onboardingCookie(user.id))?.value;
  return value && idSchema.safeParse(value).success ? value : user.id;
}
