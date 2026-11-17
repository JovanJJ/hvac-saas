import "server-only";
import { cloudinarySettings } from "@/lib/cloudinary-settings";
import { v2 as cloudinary } from "cloudinary";
import { MAX_PHOTO_BYTES, type Attachment } from "./model";
import type { VerifiedPhoto } from "./proof";
const env = process.env;
export const uploadPreset = "hvac_evidence_v1";
function config() {
  return cloudinarySettings(env);
}
export function verifierSecret() {
  if (!/^[a-f0-9]{64}$/.test(env.EVIDENCE_VERIFICATION_SECRET ?? ""))
    throw new Error("evidence_configuration");
  return env.EVIDENCE_VERIFICATION_SECRET!;
}
export async function uploadPhoto(attachment: Attachment, bytes: Buffer) {
  await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        ...config(),
        public_id: attachment.public_id,
        type: "authenticated",
        overwrite: false,
        upload_preset: uploadPreset,
      },
      (error, result) =>
        error ? reject(new Error("photo_upload")) : resolve(result),
    );
    stream.end(bytes);
  });
}
export async function verifyObject(
  attachment: Attachment,
): Promise<VerifiedPhoto> {
  const result = await cloudinary.api.resource(attachment.public_id, {
    ...config(),
    resource_type: "image",
    type: "authenticated",
  });
  const expectedFormat =
    attachment.mime_type === "image/jpeg"
      ? "jpg"
      : attachment.mime_type.split("/")[1];
  if (
    result.public_id !== attachment.public_id ||
    result.type !== "authenticated" ||
    result.resource_type !== "image" ||
    result.format !== expectedFormat ||
    result.bytes < 1 ||
    result.bytes > MAX_PHOTO_BYTES ||
    !Number.isSafeInteger(result.version) ||
    !Number.isSafeInteger(result.width) ||
    !Number.isSafeInteger(result.height) ||
    result.width < 1 ||
    result.height < 1 ||
    result.width * result.height > 40_000_000 ||
    typeof result.asset_id !== "string"
  )
    throw new Error("invalid_photo");
  return {
    assetId: result.asset_id,
    version: result.version,
    bytes: result.bytes,
    format: result.format,
    width: result.width,
    height: result.height,
    expires: Math.floor(Date.now() / 1000) + 120,
  };
}
export async function privatePhoto(attachment: Attachment) {
  const options = config();
  const url = cloudinary.utils.private_download_url(
    attachment.public_id,
    attachment.format!,
    {
      ...options,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 60,
      attachment: false,
    },
  );
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("photo_unavailable");
  const bytes = await response.arrayBuffer();
  if (
    bytes.byteLength !== attachment.verified_bytes ||
    bytes.byteLength > MAX_PHOTO_BYTES
  )
    throw new Error("invalid_photo");
  return bytes;
}
export async function destroyPhoto(attachment: Attachment) {
  const result = await cloudinary.uploader.destroy(attachment.public_id, {
    ...config(),
    type: "authenticated",
    resource_type: "image",
    invalidate: true,
  });
  if (!["ok", "not found"].includes(result.result))
    throw new Error("photo_cleanup");
}
