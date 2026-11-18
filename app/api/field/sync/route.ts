import { revalidatePath } from "next/cache";
import { offlineContext, offlineHeaders } from "@/lib/offline/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/supabase/config";
import { boundedBody, BodyTooLarge } from "@/features/evidence/request";
import {
  syncRequestSchema,
  syncOperationSchema,
  type SyncAck,
  type SyncResult,
} from "@/features/offline/sync-model";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: offlineHeaders });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== appOrigin())
    return json({ error: "origin_denied" }, 403);
  const identity = await offlineContext();
  if (!identity) return json({ error: "identity_unavailable" }, 401);
  let raw: unknown;
  try {
    raw = JSON.parse((await boundedBody(request, 200000)).toString("utf8"));
  } catch (error) {
    return json(
      { error: "invalid_input" },
      error instanceof BodyTooLarge ? 413 : 422,
    );
  }
  const parsed = syncRequestSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "invalid_input" }, 422);
  if (
    parsed.data.userId !== identity.userId ||
    parsed.data.organizationId !== identity.organizationId ||
    parsed.data.epoch !== identity.epoch
  )
    return json({ error: "identity_changed" }, 409);
  const client = await createSupabaseServerClient();
  const results: SyncResult[] = [];
  let blocked = false;
  for (const operation of parsed.data.operations) {
    if (blocked) {
      results.push({
        operationId: operation.operationId,
        status: 424,
        error: "dependency_failed",
      });
      continue;
    }
    const validated = syncOperationSchema.safeParse(operation);
    if (!validated.success) {
      results.push({
        operationId: operation.operationId,
        status: 422,
        error: "invalid_input",
      });
      blocked = true;
      continue;
    }
    const { data, error } = await client.rpc("replay_field_command", {
      p_organization_id: identity.organizationId,
      p_visit_id: operation.entityId,
      p_operation_id: operation.operationId,
      p_kind: operation.type,
      p_version: operation.baseVersion,
      p_data: validated.data.payload,
    });
    if (error) {
      const status =
        error.code === "42501"
          ? 404
          : error.code === "PT409"
            ? 409
            : ["22023", "22007", "22008", "22P02"].includes(error.code)
              ? 422
              : 503;
      const safe = [
        "visit_denied",
        "stale_version",
        "operation_conflict",
        "visit_locked",
        "pending_items",
        "missing_follow_up",
        "pending_attachments",
      ].includes(error.message)
        ? error.message
        : "invalid_input";
      results.push({ operationId: operation.operationId, status, error: safe });
      blocked = true;
    } else {
      results.push({
        operationId: operation.operationId,
        status: 200,
        acknowledgement: data as SyncAck,
      });
      for (const path of [
        `/visits/${operation.entityId}`,
        `/visits/${operation.entityId}/review`,
        `/visits/${operation.entityId}/preview`,
        "/office",
        "/today",
        "/schedule",
      ])
        revalidatePath(path);
    }
  }
  return json({ results });
}
