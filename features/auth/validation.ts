import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Unesite ispravnu email adresu.")
  .max(254);
export const passwordSchema = z
  .string()
  .min(12, "Lozinka mora imati najmanje 12 znakova.")
  .max(72, "Lozinka može imati najviše 72 znaka.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Lozinka može imati najviše 72 bajta.",
  );
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Unesite lozinku.").max(1024),
});
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Lozinke se ne podudaraju.",
  });
export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Lozinke se ne podudaraju.",
  });

// Only known staff paths and high-entropy invitation paths may survive authentication.
export function safeDestination(value: unknown) {
  if (typeof value !== "string") return "/account";
  if (
    /^\/office\/(?:reports|actions|handover)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value;
  if (
    [
      "/account",
      "/reset-password",
      "/office",
      "/office/actions",
      "/office/handover",
      "/customers",
      "/sites",
      "/systems",
      "/schedule",
      "/visits/new",
      "/today",
      "/onboarding",
      "/settings/team",
      "/settings/workspace",
      "/settings/exports",
    ].includes(value)
  )
    return value;
  if (
    /^\/visits\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/(?:review|preview))?$/i.test(
      value,
    )
  )
    return value;
  return /^\/invite\/[A-Za-z0-9_-]{43}$/.test(value) ? value : "/account";
}
