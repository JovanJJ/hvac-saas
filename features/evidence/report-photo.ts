// Server/worker-only processing of a frozen customer-visible photo reference.
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { cloudinarySettings } from "@/lib/cloudinary-settings";
import type { ReportPhoto } from "@/features/reports/model";
export async function reportPhoto(photo: ReportPhoto, organizationId: string) {
  if (
    photo.publicId !== `hvac/${organizationId}/${photo.id}` ||
    photo.bytes > 8 * 1024 * 1024 ||
    photo.width * photo.height > 40_000_000
  )
    throw new Error("evidence_mismatch");
  const config = cloudinarySettings(process.env);
  let original: Buffer;
  try {
    const resource = await cloudinary.api.resource(photo.publicId, {
      ...config,
      type: "authenticated",
      resource_type: "image",
    });
    if (
      resource.asset_id !== photo.assetId ||
      resource.version !== photo.assetVersion ||
      resource.format !== photo.format ||
      resource.width !== photo.width ||
      resource.height !== photo.height ||
      resource.bytes !== photo.bytes ||
      resource.public_id !== photo.publicId ||
      resource.type !== "authenticated"
    )
      throw new Error("evidence_mismatch");
    const url = cloudinary.utils.private_download_url(
      photo.publicId,
      photo.format,
      {
        ...config,
        type: "authenticated",
        expires_at: Math.floor(Date.now() / 1000) + 60,
        attachment: false,
      },
    );
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok || !response.body) throw new Error("evidence_unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        size += chunk.length;
        if (size > photo.bytes) throw new Error("evidence_mismatch");
        chunks.push(chunk);
      }
    } finally {
      await reader.cancel();
    }
    if (size !== photo.bytes) throw new Error("evidence_mismatch");
    original = Buffer.concat(chunks);
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === "evidence_mismatch"
        ? "evidence_mismatch"
        : "evidence_unavailable",
    );
  }
  return await sharp(original, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 82 })
    .toBuffer();
}
