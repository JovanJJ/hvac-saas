export const taskLabels = {
  quote: "Priprema ponude",
  repair: "Popravka",
  revisit: "Ponovni dolazak",
};
export type FollowUp = {
  id: string;
  version: number;
  kind: keyof typeof taskLabels;
  state: "open" | "completed";
  ownerId: string;
  owner: string;
  dueDate: string;
  customerAction: string;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string;
  returnVisitId: string | null;
  returnStart: string | null;
  returnEnd: string | null;
  visitId: string;
  itemId: string;
  systemId: string;
  code: string;
  room: string;
  site: string;
  customer: string;
  timeZone: string;
  finding: string;
  work: string;
  noAccessReason: string;
  outcome: string;
  sourceStart: string;
};
export type ReturnSource = Pick<
  FollowUp,
  | "kind"
  | "state"
  | "visitId"
  | "itemId"
  | "code"
  | "room"
  | "finding"
  | "work"
  | "noAccessReason"
  | "customerAction"
> & { actionId: string };
