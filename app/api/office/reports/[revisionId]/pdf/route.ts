import { archivedPdf, pdfFilename } from "@/features/reports/archive";
import { z } from "zod";
import { currentUser } from "@/features/auth/dal";
import { selectedWorkspace } from "@/features/workspaces/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ReportRevision } from "@/features/reports/model";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/office/reports/[revisionId]/pdf">,
) {
  if (!(await currentUser()))
    return new Response(null, { status: 401, headers });
  const { revisionId } = await params;
  if (!z.string().uuid().safeParse(revisionId).success)
    return new Response(null, { status: 404, headers });
  const { workspace } = await selectedWorkspace();
  if (!workspace || !["owner", "coordinator"].includes(workspace.role))
    return new Response(null, { status: 404, headers });
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("report_revision", {
    p_organization_id: workspace.organization.id,
    p_revision_id: revisionId,
  });
  if (error || !data) return new Response(null, { status: 404, headers });
  const report = data as ReportRevision;
  if (report.renderState !== "ready" || !report.artifact)
    return new Response(null, { status: 409, headers });
  const bytes = await archivedPdf(client, report.artifact);
  if (!bytes) return new Response(null, { status: 503, headers });
  const filename = pdfFilename(report.data.reference, report.revision);
  const disposition = new URL(request.url).searchParams.get("view") === "preview" ? "inline" : "attachment";
  return new Response(bytes, {
    headers: {
      ...headers,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${disposition}; filename="${filename}"`,
    },
  });
}
