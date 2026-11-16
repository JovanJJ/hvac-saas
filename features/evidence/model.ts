import { z } from "zod";
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const photoTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const reservePhotoSchema = z.object({
  visitId: z.string().uuid(),
  attachmentId: z.string().uuid(),
  itemId: z.string().uuid(),
  caption: z.string().trim().min(1).max(500),
  visibility: z.enum(["customer", "internal"]),
  bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES),
  mimeType: z.enum(photoTypes),
});
export const photoIdentitySchema = z.object({
  visitId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});
export type Attachment = {
  id: string;
  organization_id: string;
  visit_id: string;
  item_id: string;
  author_id: string;
  caption: string;
  visibility: "customer" | "internal";
  expected_bytes: number;
  verified_bytes: number | null;
  mime_type: string;
  state: "reserved" | "verified" | "removed";
  public_id: string;
  asset_id: string | null;
  asset_version: number | null;
  format: string | null;
  width: number | null;
  height: number | null;
};
export function photoUrl(
  visitId: string,
  attachmentId: string,
  customerOnly = false,
) {
  return `/api/field/attachments/${attachmentId}?visitId=${visitId}${customerOnly ? "&customer=1" : ""}`;
}
