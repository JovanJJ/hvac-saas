import type { VisitBundle, VisitItem } from "@/features/visits/model";
import type { ReturnSource } from "@/features/follow-ups/model";
export type OfflineIdentity = {
  userId: string;
  userLabel: string;
  organizationId: string;
  organizationName: string;
  epoch: string;
};
// The read-only wire snapshot preserves nullable incomplete draft fields.
// The draft editor normalizes these nullable fields only at its form boundary.
type CapturedFollowUp = NonNullable<VisitItem["followUp"]>;
type OfflineItem = { confirmedAt?: string } & Omit<
  VisitItem,
  "followUp" | "readings"
> & {
    readings: (Omit<VisitItem["readings"][number], "unit"> & {
      unit: string | null;
    })[];
    followUp:
      | (Omit<CapturedFollowUp, "ownerId" | "dueDate"> & {
          ownerId: string | null;
          dueDate: string | null;
        })
      | null;
  };
export type OfflineBundle = {
  schemaVersion: 1;
  userId: string;
  organizationId: string;
  downloadedAt: string;
  visit: Omit<VisitBundle, "availableSystems" | "items"> & {
    items: OfflineItem[];
  };
  source: ReturnSource | null;
  photoCount: number;
};
