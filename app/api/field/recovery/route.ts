import { z } from "zod";
import { offlineContext, offlineHeaders } from "@/lib/offline/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/supabase/config";
import { boundedBody, BodyTooLarge } from "@/features/evidence/request";
import { syncOperationSchema } from "@/features/offline/sync-model";
const schema = z
  .object({
    userId: z.string().uuid(),
    organizationId: z.string().uuid(),
    epoch: z.string().uuid(),
    visitId: z.string().uuid(),
    operation: syncOperationSchema.nullable(),
    photoIds: z.array(z.string().uuid()).max(100),
  })
  .strict();
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: offlineHeaders });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    return json({ error: "origin_denied" }, 403);
  const identity = await offlineContext();
  if (!identity) return json({ error: "identity_unavailable" }, 401);
  let raw: unknown;
  try {
    raw = JSON.parse((await boundedBody(request, 50000)).toString("utf8"));
  } catch (error) {
    return json(
      { error: "invalid_input" },
      error instanceof BodyTooLarge ? 413 : 422,
    );
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_input" }, 422);
  const input = parsed.data;
  if (
    input.userId !== identity.userId ||
    input.organizationId !== identity.organizationId ||
    input.epoch !== identity.epoch
  )
    return json({ error: "identity_changed" }, 409);
  const client = await createSupabaseServerClient();
  const result = await client.rpc("field_recovery_context", {
    p_organization_id: identity.organizationId,
    p_visit_id: input.visitId,
    p_operation: input.operation,
    p_photo_ids: input.photoIds,
  });
  if (result.error)
    return json(
      { error: "visit_unavailable" },
      result.error.code === "42501" ? 404 : 503,
    );
  return json(result.data);
}
