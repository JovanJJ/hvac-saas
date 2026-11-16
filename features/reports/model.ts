import type { VisitItem } from "@/features/visits/model";
export type ReportPhoto = {
  id: string;
  caption: string;
  width: number;
  height: number;
  provider: "cloudinary";
  deliveryType: "authenticated";
  publicId: string;
  assetId: string;
  assetVersion: number;
  format: "jpg" | "png" | "webp";
  bytes: number;
};
export type ReportItem = Pick<
  VisitItem,
  | "code"
  | "room"
  | "model"
  | "serial"
  | "planned"
  | "outcome"
  | "work"
  | "finding"
  | "noAccessReason"
  | "parts"
> & {
  readings: (Omit<VisitItem["readings"][number], "unit"> & {
    unit: string | null;
  })[];
  photos: ReportPhoto[];
  followUp: {
    kind: "quote" | "repair" | "revisit";
    owner: string;
    dueDate: string | null;
    customerAction: string;
  } | null;
};
// Matches the single database allowlist in hvac_private.customer_report_data.
export type CustomerReport = {
  schemaVersion: 1;
  templateVersion: "service-report-v1";
  locale: "sr-Latn-RS";
  branding: { displayName: string; logo: null; accentColor: string };
  company: string;
  visitId: string;
  reference: string;
  revision: number | null;
  issuedAt: string | null;
  issuer: string | null;
  customer: string;
  contact: string;
  site: string;
  address: string;
  start: string;
  actualStart: string | null;
  timeZone: string;
  visitType: string;
  technicians: string[];
  completedAt: string | null;
  totals: { planned: number; inspected: number; actions: number };
  items: ReportItem[];
};
export type ReportPreview = {
  visitVersion: number;
  revisionId: string | null;
  data: CustomerReport;
};
export type ReportRevision = {
  id: string;
  visitId: string;
  issuedBy: string;
  issuedAt: string;
  revision: number;
  renderState: "queued";
  data: CustomerReport;
};
export type ReportListEntry = {
  id: string;
  number: string;
  site: string;
  issuedAt: string;
  renderState: "queued";
};
