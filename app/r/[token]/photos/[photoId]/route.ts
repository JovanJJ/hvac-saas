import { z } from "zod";
import { guestReport } from "@/features/reports/guest-dal";
import { guestHeaders } from "@/features/reports/archive";
import { reportPhoto } from "@/features/evidence/report-photo";
export async function GET(
  _request: Request,
  { params }: RouteContext<"/r/[token]/photos/[photoId]">,
) {
  const { token, photoId } = await params;
  if (!z.string().uuid().safeParse(photoId).success)
    return new Response(null, { status: 404, headers: guestHeaders });
  const report = await guestReport(token);
  const photo = report?.data.items
    .flatMap((item) => item.photos)
    .find((photo) => photo.id === photoId);
  if (!report || !photo)
    return new Response(null, { status: 404, headers: guestHeaders });
  try {
    const bytes = await reportPhoto(photo, report.artifact.path.split("/")[0]);
    if (!(await guestReport(token)))
      return new Response(null, { status: 404, headers: guestHeaders });
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...guestHeaders,
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.length),
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return new Response(null, { status: 503, headers: guestHeaders });
  }
}
