import { guestClient, guestReport } from "@/features/reports/guest-dal";
import {
  archivedPdf,
  pdfFilename,
  guestHeaders,
} from "@/features/reports/archive";
export async function GET(
  _request: Request,
  { params }: RouteContext<"/r/[token]/pdf">,
) {
  const { token } = await params;
  const report = await guestReport(token);
  if (!report)
    return new Response(null, { status: 404, headers: guestHeaders });
  const bytes = await archivedPdf(guestClient(token), report.artifact);
  // Recheck after fetching bytes so a concurrent revocation/expiry closes delivery.
  if (!(await guestReport(token)))
    return new Response(null, { status: 404, headers: guestHeaders });
  if (!bytes) return new Response(null, { status: 503, headers: guestHeaders });
  return new Response(bytes, {
    headers: {
      ...guestHeaders,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${pdfFilename(report.data.reference, report.data.revision!)}"`,
    },
  });
}
