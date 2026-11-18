import { z } from "zod";
import { offlineContext, offlineHeaders } from "@/lib/offline/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ visitId: string }> },
) {
  const identity = await offlineContext();
  if (!identity)
    return Response.json(
      { error: "identity_unavailable" },
      { status: 401, headers: offlineHeaders },
    );
  const { visitId } = await params;
  if (!z.string().uuid().safeParse(visitId).success)
    return Response.json(
      { error: "visit_unavailable" },
      { status: 404, headers: offlineHeaders },
    );
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("offline_visit_bundle", {
    p_organization_id: identity.organizationId,
    p_visit_id: visitId,
  });
  if (error)
    return Response.json(
      { error: "visit_unavailable" },
      { status: error.code === "42501" ? 404 : 503, headers: offlineHeaders },
    );
  return Response.json({ identity, bundle: data }, { headers: offlineHeaders });
}
