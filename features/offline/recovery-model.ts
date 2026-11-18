import type { OfflineBundle } from "./model";
import type { SyncAck, SyncOperation } from "./sync-model";
import type { PhotoAck } from "./photo-model";
export type RecoveryContext = {
  bundle: OfflineBundle;
  photos: {
    id: string;
    itemId: string;
    caption: string;
    visibility: "customer" | "internal";
    state: "reserved" | "verified";
  }[];
  operation: {
    status: "absent" | "committed" | "mismatch";
    acknowledgement?: SyncAck;
  } | null;
  photoReceipts: PhotoAck[];
};
export type RecoveryTarget = SyncOperation;
export type RetainedWork = {
  visitId: string;
  drafts: number;
  photos: number;
  submission: boolean;
  assigned: boolean;
};
