export type AuthMode =
  "sign-in" | "sign-up" | "forgot-password" | "reset-password";
export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Partial<Record<"email" | "password" | "confirmPassword", string[]>>;
  email?: string;
};
export const initialAuthState: AuthFormState = { status: "idle" };
