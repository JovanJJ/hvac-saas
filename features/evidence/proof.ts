import { createHmac } from "node:crypto";
export type VerifiedPhoto = {
  assetId: string;
  version: number;
  bytes: number;
  format: string;
  width: number;
  height: number;
  expires: number;
};
export function verificationProof(
  secret: string,
  org: string,
  visit: string,
  attachment: string,
  actor: string,
  data: VerifiedPhoto,
) {
  const message = [
    org,
    visit,
    attachment,
    actor,
    data.assetId,
    data.version,
    data.bytes,
    data.format,
    data.width,
    data.height,
    data.expires,
  ].join("\n");
  return createHmac("sha256", secret).update(message).digest("hex");
}
