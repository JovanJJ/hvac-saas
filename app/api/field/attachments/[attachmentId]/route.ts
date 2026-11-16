import { z } from "zod";
import { attachments } from "@/features/evidence/dal";
import {
  evidenceContext,
  json,
  privateHeaders,
} from "@/features/evidence/http";
import { privatePhoto } from "@/features/evidence/provider";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const context = await evidenceContext();
  if (!context) return json({ message: "Prijavite se ponovo." }, 401);
  const url = new URL(request.url);
  const id = z
    .string()
    .uuid()
    .safeParse((await params).attachmentId);
  const visit = z.string().uuid().safeParse(url.searchParams.get("visitId"));
  if (!id.success || !visit.success)
    return json({ message: "Fotografija nije dostupna." }, 404);
  try {
    const attachment = (await attachments(context.org, visit.data, id.data))[0];
    if (
      !attachment ||
      attachment.state !== "verified" ||
      (url.searchParams.get("customer") === "1" &&
        attachment.visibility !== "customer")
    )
      return json({ message: "Fotografija nije dostupna." }, 404);
    return new Response(await privatePhoto(attachment), {
      headers: {
        ...privateHeaders,
        "Content-Type": attachment.mime_type,
        "Content-Disposition": "inline",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return json({ message: "Fotografija trenutno nije dostupna." }, 404);
  }
}
