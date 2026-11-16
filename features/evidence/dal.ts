import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Attachment } from "./model";
export async function attachments(org: string, visit: string, id?: string) {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("attachment_read", {
    p_organization_id: org,
    p_visit_id: visit,
    p_attachment_id: id,
  });
  if (error)
    throw new Error(
      error.code === "42501" ? "attachment_denied" : "attachment_unavailable",
    );
  return data as unknown as Attachment[];
}
