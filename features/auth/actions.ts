"use server";
import { rotateOfflineEpoch } from "@/lib/offline/server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentUser } from "./dal";
import { landingPath, workspaceCookie } from "@/features/workspaces/dal";
import { revalidatePath } from "next/cache";
import {
  appOrigin,
  authCookieOptions,
  hasSupabaseConfig,
} from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  emailSchema,
  passwordSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  safeDestination,
} from "./validation";
import type { AuthFormState } from "./types";

const unavailable: AuthFormState = {
  status: "error",
  message: "Prijava trenutno nije dostupna. Obratite se administratoru.",
};
const authFailure: AuthFormState = {
  status: "error",
  message:
    "Prijava nije uspela. Proverite email, lozinku i potvrdu email adrese.",
};
const serviceFailure: AuthFormState = {
  status: "error",
  message: "Usluga trenutno nije dostupna. Pokušajte ponovo.",
};

export async function signIn(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const input = signInSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      status: "error",
      errors: input.error.flatten().fieldErrors,
      email: String(form.get("email") ?? ""),
    };
  if (!hasSupabaseConfig()) return unavailable;
  try {
    const supabase = await createSupabaseServerClient({ writable: true });
    const { data, error } = await supabase.auth.signInWithPassword(input.data);
    if (error || !data.user?.email_confirmed_at) {
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      return { ...authFailure, email: input.data.email };
    }
  } catch {
    return { ...serviceFailure, email: input.data.email };
  }
  await rotateOfflineEpoch();
  revalidatePath("/", "layout");
  const next =
    form.get("next") || (await cookies()).get("teren_auth_next")?.value;
  (await cookies()).delete("teren_auth_next");
  redirect(next ? safeDestination(next) : await landingPath());
}

export async function signUp(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const input = signUpSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return {
      status: "error",
      errors: input.error.flatten().fieldErrors,
      email: String(form.get("email") ?? ""),
    };
  if (!hasSupabaseConfig()) return unavailable;
  const next = form.get("next");
  if (next)
    (await cookies()).set("teren_auth_next", safeDestination(next), {
      ...authCookieOptions(),
      maxAge: 3600,
    });
  else (await cookies()).delete("teren_auth_next");
  try {
    const supabase = await createSupabaseServerClient({ writable: true });
    const { data, error } = await supabase.auth.signUp({
      email: input.data.email,
      password: input.data.password,
      options: { emailRedirectTo: `${appOrigin()}/auth/callback` },
    });
    if (error)
      return {
        status: "error",
        message:
          "Nalog nije moguće napraviti. Pokušajte kasnije ili otvorite prijavu i oporavak lozinke.",
        email: input.data.email,
      };
    // Preserve the PKCE verifier while confirmation is pending. Signing out clears it.
    // Auto-confirming stacks may return a session; require explicit sign-in in that case.
    if (data.session) await supabase.auth.signOut({ scope: "local" });
  } catch {
    return serviceFailure;
  }
  await rotateOfflineEpoch();
  return {
    status: "success",
    message:
      "Proverite imejl i potvrdite adresu. Ako je registracija moguća, uputstvo za potvrdu stiže na vašu email adresu. Zatim se prijavite.",
    email: input.data.email,
  };
}

export async function requestRecovery(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const input = emailSchema.safeParse(form.get("email"));
  if (!input.success)
    return {
      status: "error",
      errors: { email: ["Unesite ispravnu email adresu."] },
      email: String(form.get("email") ?? ""),
    };
  if (!hasSupabaseConfig()) return unavailable;
  const next = form.get("next");
  if (next) (await cookies()).set("teren_auth_next", safeDestination(next), {
    ...authCookieOptions(), maxAge: 3600,
  });
  else (await cookies()).delete("teren_auth_next");
  try {
    const supabase = await createSupabaseServerClient({ writable: true });
    await supabase.auth.resetPasswordForEmail(input.data, {
      redirectTo: `${appOrigin()}/auth/callback?next=/reset-password`,
    });
  } catch {
    return serviceFailure;
  }
  // Same response for an absent account, rate limits and provider errors; never disclose existence.
  return {
    status: "success",
    message:
      "Ako postoji nalog sa ovom adresom, dobićete uputstvo za promenu lozinke.",
    email: input.data,
  };
}

export async function resetPassword(
  _previous: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const input = resetPasswordSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    return { status: "error", errors: input.error.flatten().fieldErrors };
  if (!hasSupabaseConfig()) return unavailable;
  try {
    const supabase = await createSupabaseServerClient({ writable: true });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email_confirmed_at)
      return {
        status: "error",
        message:
          "Link nije važeći ili je istekao. Zatražite novi link za oporavak.",
      };
    const { error } = await supabase.auth.updateUser({
      password: passwordSchema.parse(input.data.password),
    });
    if (error)
      return {
        status: "error",
        message:
          "Lozinka nije promenjena. Koristite novu lozinku i pokušajte ponovo.",
      };
    await supabase.auth.signOut({ scope: "global" });
  } catch {
    return serviceFailure;
  }
  await rotateOfflineEpoch();
  revalidatePath("/", "layout");
  const next = (await cookies()).get("teren_auth_next")?.value;
  redirect(next ? `/sign-in?message=password-updated&next=${encodeURIComponent(safeDestination(next))}` : "/sign-in?message=password-updated");
}

export async function signOut(form?: FormData) {
  const user = await currentUser();
  if (user) (await cookies()).delete(workspaceCookie(user.id));
  (await cookies()).delete("teren_auth_next");
  if (hasSupabaseConfig()) {
    const supabase = await createSupabaseServerClient({ writable: true });
    await supabase.auth.signOut({ scope: "local" });
  }
  await rotateOfflineEpoch();
  revalidatePath("/", "layout");
  const next = form?.get("next");
  redirect(
    next
      ? `/sign-in?next=${encodeURIComponent(safeDestination(next))}`
      : "/sign-in",
  );
}
