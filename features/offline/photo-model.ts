import type { SyncAck } from "./sync-model";
export type PhotoPhase = "reserve" | "complete" | "remove";
export type PhotoAck = {
  id: string;
  visitId: string;
  itemId: string;
  actorId: string;
  phase: PhotoPhase;
  state: "reserved" | "verified" | "removed";
  effects: Partial<Record<PhotoPhase, number>>;
  visit: SyncAck["visit"];
  confirmedAt: string;
};
export type LocalPhoto = {
  id: string;
  visitId: string;
  itemId: string;
  userId: string;
  organizationId: string;
  actorLabel: string;
  caption: string;
  visibility: "customer" | "internal";
  bytes: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  blob: Blob | null;
  createdAt: string;
  attemptedAt: string | null;
  action: "upload" | "remove";
  state: "queued" | "verified" | "removed";
  effects: Partial<Record<PhotoPhase, number>>;
  serverVersion: number;
  error?: string;
  errorStatus?: number;
  cleanupPending?: boolean;
};
export function photoPending(photo: LocalPhoto) {
  return photo.action === "remove"
    ? photo.state !== "removed"
    : photo.state !== "verified";
}
