import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/config";
import { currentUser } from "@/features/auth/dal";
import { selectedWorkspace } from "@/features/workspaces/dal";
export const offlineEpochCookie = "teren_offline_epoch";
export async function rotateOfflineEpoch() {
  const epoch = randomUUID();
  (await cookies()).set(offlineEpochCookie, epoch, {
    ...authCookieOptions(),
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30,
  });
  return epoch;
}
export async function offlineContext() {
  const user = await currentUser();
  if (!user) return null;
  const context = await selectedWorkspace();
  if (!context.workspace) return null;
  const jar = await cookies();
  const epoch =
    jar.get(offlineEpochCookie)?.value || (await rotateOfflineEpoch());
  return {
    userId: user.id,
    userLabel: user.email,
    organizationId: context.workspace.organization.id,
    organizationName: context.workspace.organization.display_name,
    epoch,
  };
}
export const offlineHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
