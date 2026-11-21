export type RegisterRow = {
  id: string;
  version?: number;
  archived_at?: string | null;
  manufacturer?: string;
  system_type?: string;
  access_note?: string;
  name?: string;
  code?: string;
  customer_id?: string;
  site_id?: string;
  address?: string;
  time_zone?: string;
  room?: string;
  model?: string;
  serial?: string;
  contact?: string;
};
export type ScheduledVisit = {
  status?: import("@/features/visits/model").VisitBundle["status"];
  cancellationReason?: string;
  assigned: boolean;
  id: string;
  site: string;
  address: string;
  accessNote: string;
  timeZone: string;
  start: string;
  end: string;
  visitType: string;
  systems: { id: string; code: string; room: string }[];
};
export type Snapshot = {
  customers: RegisterRow[];
  sites: RegisterRow[];
  systems: RegisterRow[];
  visits: ScheduledVisit[];
};
