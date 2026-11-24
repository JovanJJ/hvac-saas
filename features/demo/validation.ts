import { z } from "zod";

export const demoSchema = z.object({
  operationId: z.uuid(),
  name: z.string().trim().min(1, "Unesite ime.").max(100, "Unesite najviše 100 znakova."),
  email: z.string().trim().max(254).pipe(z.email("Unesite ispravnu imejl adresu.")),
  company: z.string().trim().min(1, "Unesite naziv servisa.").max(160, "Unesite najviše 160 znakova."),
  plan: z.enum(["", "solo", "tim"], { error: "Izaberite ponuđeni plan." }),
  website: z.literal(""),
});
export type DemoState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Partial<Record<"name" | "email" | "company" | "plan", string[]>>;
};
