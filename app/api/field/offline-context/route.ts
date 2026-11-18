import { offlineContext, offlineHeaders } from "@/lib/offline/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET() {
  const identity = await offlineContext();
  if (!identity)
    return Response.json(
      { error: "identity_unavailable" },
      { status: 401, headers: offlineHeaders },
    );
  const client = await createSupabaseServerClient();
  const checkedAt = Date.now();
  const { data: assignments, error } = await client.rpc(
    "offline_assignment_ids",
    { p_organization_id: identity.organizationId },
  );
  if (error)
    return Response.json(
      { error: "identity_unavailable" },
      { status: error.code === "42501" ? 401 : 503, headers: offlineHeaders },
    );
  return Response.json(
    { identity, assignments, checkedAt },
    { headers: offlineHeaders },
  );
}
