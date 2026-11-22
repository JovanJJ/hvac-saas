import { z } from "zod";
export const generationWindowSchema = z
  .object({ from: z.iso.date(), until: z.iso.date() })
  .refine(
    (data) =>
      data.until >= data.from &&
      Date.parse(data.until) - Date.parse(data.from) < 90 * 86400000,
    {
      message:
        "Izaberite period od najviše 90 dana; završetak mora biti posle početka.",
    },
  );
export const generationLabels = {
  queued: "Čeka obradu",
  running: "Priprema u toku",
  ready: "Završeno",
  failed: "Priprema nije uspela",
  superseded: "Zamenjeno novom verzijom plana",
};
export type GenerationState = {
  today: string;
  windowUntil: string;
  nextScanAt: string;
  totalVisits: number;
  jobs: {
    id: string;
    version: number;
    from: string;
    until: string;
    state: keyof typeof generationLabels;
    attempts: number;
    error: string | null;
    result: { created: number; existing: number; skippedPast: number } | null;
  }[];
  visits: {
    id: string;
    intendedDate: string;
    planVersion: number;
    timeZone: string;
    start: string;
    end: string;
    status: import("@/features/visits/model").VisitBundle["status"];
  }[];
};
