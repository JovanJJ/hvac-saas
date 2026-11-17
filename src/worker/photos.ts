import { reportPhoto } from "@/features/evidence/report-photo";
import type { CustomerReport } from "@/features/reports/model";
export async function photoSources(
  report: CustomerReport,
  organizationId: string,
) {
  const photos = report.items.flatMap((item) => item.photos);
  if (photos.length > 100) throw new Error("render_limit");
  const sources: Record<string, string> = {};
  let total = 0;
  const deadline = Date.now() + 120000;
  for (const photo of photos) {
    if (Date.now() > deadline) throw new Error("render_limit");
    const bytes = await reportPhoto(photo, organizationId);
    total += bytes.length;
    if (total > 40 * 1024 * 1024) throw new Error("render_limit");
    sources[photo.id] = `data:image/jpeg;base64,${bytes.toString("base64")}`;
  }
  return sources;
}
