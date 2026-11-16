import { z } from "zod";
import { emailSchema } from "@/features/auth/validation";
export const idSchema = z.string().uuid("Neispravan identifikator.");
export const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Poziv nije važeći.");
export const roleSchema = z.enum(["owner", "coordinator", "technician"]);
export const workspaceSchema = z.object({
  operationId: idSchema,
  name: z
    .string()
    .trim()
    .min(1, "Unesite naziv firme.")
    .max(120, "Naziv može imati najviše 120 znakova."),
  timeZone: z
    .string()
    .min(1, "Unesite vremensku zonu.")
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("sr-Latn", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Unesite važeću vremensku zonu, na primer Europe/Belgrade."),
});
export const inviteSchema = z.object({
  organizationId: idSchema,
  operationId: idSchema,
  email: emailSchema,
  role: roleSchema,
  token: tokenSchema,
});
export const memberSchema = z.object({
  organizationId: idSchema,
  membershipId: idSchema,
  role: roleSchema,
  active: z.enum(["true", "false"]),
  version: z.coerce.number().int().positive(),
});
export const updateWorkspaceSchema = workspaceSchema
  .omit({ operationId: true })
  .extend({
    organizationId: idSchema,
    version: z.coerce.number().int().positive(),
  });
export const roleLabels = {
  owner: "Vlasnik",
  coordinator: "Koordinator",
  technician: "Tehničar",
} as const;
