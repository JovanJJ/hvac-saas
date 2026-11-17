import { randomUUID } from "node:crypto";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import sharp from "sharp";
import { cloudinarySettings } from "../lib/cloudinary-settings";
import type { createReportFixture } from "./report-fixture";
export async function attachFictionalReportPhoto(
  fixture: Awaited<ReturnType<typeof createReportFixture>>,
) {
  const id = randomUUID(),
    publicId = `hvac/${fixture.org}/${id}`,
    config = cloudinarySettings(process.env);
  // Synthetic equipment, no identifying source photograph.
  const svg =
    '<svg width="800" height="500" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="500" fill="#edf2ef"/><rect x="90" y="90" width="620" height="320" rx="25" fill="#fff" stroke="#2a6454" stroke-width="6"/><path d="M130 170H670M130 210H670M130 250H670M130 290H670M130 330H670" stroke="#718f82" stroke-width="15"/><circle cx="660" cy="120" r="8" fill="#2a8a54"/></svg>';
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  const cleanup = async () => {
    await cloudinary.uploader.destroy(publicId, {
      ...config,
      type: "authenticated",
      resource_type: "image",
      invalidate: true,
    });
  };
  try {
    const photo = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          ...config,
          public_id: publicId,
          type: "authenticated",
          overwrite: false,
          upload_preset: "hvac_evidence_v1",
        },
        (error, result) =>
          error || !result
            ? reject(new Error("Fixture upload failed"))
            : resolve(result),
      );
      stream.end(bytes);
    });
    for (const visibility of ["customer", "internal"])
      await fixture.db.query(
        "insert into public.attachments(id,organization_id,visit_id,item_id,author_id,caption,visibility,expected_bytes,mime_type,state,asset_id,asset_version,format,width,height,verified_bytes) values($1,$2,$3,$4,'a1000000-0000-4000-8000-000000000102',$5,$6,$7,'image/png','verified',$8,$9,'png',$10,$11,$7)",
        [
          visibility === "customer" ? id : randomUUID(),
          fixture.org,
          fixture.visitId,
          fixture.itemIds[0],
          visibility === "customer"
            ? "Čist filter · potvrđena fotografija čćšžđ"
            : "SECRET-PHOTO",
          visibility,
          photo.bytes,
          photo.asset_id,
          photo.version,
          photo.width,
          photo.height,
        ],
      );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
