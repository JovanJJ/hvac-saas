import type { RenderState } from "./model";
export const renderLabels: Record<RenderState, string> = {
  queued: "Čeka izradu PDF-a",
  rendering: "PDF se izrađuje",
  ready: "PDF je spreman",
  failed: "Izrada PDF-a nije uspela",
};
