"use client";

import { useActionState } from "react";
import { FormField } from "@/components/ui/form-field";
import { requestRecovery, resetPassword, signIn, signUp } from "./actions";
import { initialAuthState, type AuthMode } from "./types";

const actions = {
  "sign-in": signIn,
  "sign-up": signUp,
  "forgot-password": requestRecovery,
  "reset-password": resetPassword,
};
const labels = {
  "sign-in": "Prijavi se",
  "sign-up": "Napravi nalog",
  "forgot-password": "Pošalji uputstvo",
  "reset-password": "Sačuvaj novu lozinku",
};
export function AuthForm({
  mode,
  configured,
  nextPath = "",
}: {
  mode: AuthMode;
  configured: boolean;
  nextPath?: string;
}) {
  const [state, action, pending] = useActionState(
    actions[mode],
    initialAuthState,
  );
  const isNewPassword = mode === "sign-up" || mode === "reset-password";
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={nextPath} />
      {mode !== "reset-password" && (
        <FormField
          id="email"
          name="email"
          label="Email adresa"
          type="email"
          autoComplete="email"
          maxLength={254}
          defaultValue={state.email}
          required
          errors={state.errors?.email}
        />
      )}
      {mode !== "forgot-password" && (
        <FormField
          id="password"
          name="password"
          label={mode === "reset-password" ? "Nova lozinka" : "Lozinka"}
          type="password"
          autoComplete={isNewPassword ? "new-password" : "current-password"}
          required
          errors={state.errors?.password}
          hint={
            isNewPassword ? "Najmanje 12 znakova, najviše 72 bajta." : undefined
          }
        />
      )}
      {isNewPassword && (
        <FormField
          id="confirmPassword"
          name="confirmPassword"
          label="Ponovite lozinku"
          type="password"
          autoComplete="new-password"
          required
          errors={state.errors?.confirmPassword}
        />
      )}
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={
            state.status === "error"
              ? "rounded-md bg-[#fff0eb] p-3 text-sm text-[#8a3528]"
              : "rounded-md bg-[#e7f1e5] p-3 text-sm text-[#305a34]"
          }
        >
          {state.message}
        </p>
      )}
      <button
        className="button primary w-full"
        type="submit"
        disabled={pending || !configured}
      >
        {pending ? "Obrada…" : labels[mode]}
      </button>
    </form>
  );
}
