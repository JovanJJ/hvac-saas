import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
export async function archivedPdf(
  client: SupabaseClient<Database>,
  artifact: { path: string; sha256: string; size: number },
) {
  const { data } = await client.storage
    .from("report-pdfs")
    .download(artifact.path);
  if (!data) return null;
  const bytes = await data.arrayBuffer();
  if (
    bytes.byteLength !== artifact.size ||
    createHash("sha256").update(Buffer.from(bytes)).digest("hex") !==
      artifact.sha256
  )
    return null;
  return bytes;
}
export function pdfFilename(reference: string, revision: number) {
  return `${reference.replace(/[^A-Za-z0-9-]/g, "")}-r${revision}.pdf`;
}
export const guestHeaders = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
