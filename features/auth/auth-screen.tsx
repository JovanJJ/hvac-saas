import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthForm } from "./auth-form";
import type { AuthMode } from "./types";
import { hasSupabaseConfig } from "@/lib/supabase/config";

const copy = {
  "sign-in": {
    title: "Dobro došli nazad.",
    description: "Prijavite se da nastavite rad u svom timu.",
  },
  "sign-up": {
    title: "Napravite svoj nalog.",
    description: "Potvrdite email adresu pre prvog ulaska.",
  },
  "forgot-password": {
    title: "Oporavak lozinke",
    description: "Poslaćemo vam uputstvo na email adresu naloga.",
  },
  "reset-password": {
    title: "Izaberite novu lozinku.",
    description: "Posle promene prijavite se ponovo na svojim uređajima.",
  },
};
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="w-full max-w-md rounded-xl border border-[#dce4df] bg-white p-6 shadow-sm sm:p-9">
        <Link
          href="/"
          className="mb-8 inline-block text-3xl font-extrabold tracking-tight no-underline"
        >
          teren<span className="text-[#19664e]">.</span>
        </Link>
        {children}
      </div>
    </main>
  );
}
export async function AuthScreen({
  mode,
  notice,
  nextPath = "",
}: {
  mode: AuthMode;
  notice?: React.ReactNode;
  nextPath?: string;
}) {
  await connection();
  const configured = hasSupabaseConfig();
  return (
    <>
      <span className="eyebrow">HVAC SERVIS</span>
      <h1 className="mb-3 text-3xl">{copy[mode].title}</h1>
      <p className="mb-7 text-sm text-[#60716c]">{copy[mode].description}</p>
      {!configured && (
        <p role="status" className="mb-5 rounded-md bg-[#fff0d8] p-3 text-sm">
          Prijava još nije podešena. Obratite se administratoru.
        </p>
      )}
      {notice}
      <AuthForm mode={mode} configured={configured} nextPath={nextPath} />
      {process.env.NODE_ENV === "development" &&
        process.env.LOCAL_AUTH_INBOX_URL &&
        (mode === "sign-up" || mode === "forgot-password") && (
          <p className="mt-5 rounded-md bg-[#e7f1e5] p-3 text-sm">
            Razvojno okruženje: poruke za potvrdu i oporavak stižu u lokalno
            sanduče.{" "}
            <a
              href={process.env.LOCAL_AUTH_INBOX_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Otvori sanduče
            </a>
          </p>
        )}
      <nav
        aria-label="Nalog"
        className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm underline"
      >
        {mode !== "sign-in" && (
          <Link
            href={
              nextPath
                ? `/sign-in?next=${encodeURIComponent(nextPath)}`
                : "/sign-in"
            }
          >
            Prijava
          </Link>
        )}
        {mode === "sign-in" && (
          <>
            <Link href="/forgot-password">Zaboravljena lozinka?</Link>
            <Link
              href={
                nextPath
                  ? `/sign-up?next=${encodeURIComponent(nextPath)}`
                  : "/sign-up"
              }
            >
              Novi nalog
            </Link>
          </>
        )}
        {mode === "reset-password" && (
          <Link href="/forgot-password">Zatraži novi link</Link>
        )}
      </nav>
      {process.env.NODE_ENV === "development" && (
        <Link
          href="/preview"
          className="mt-8 block border-t border-[#dce4df] pt-5 text-xs text-[#60716c] underline"
        >
          Otvori probnu posetu M0 →
        </Link>
      )}
    </>
  );
}
export function AuthLoading() {
  return <p role="status">Učitavanje naloga…</p>;
}
export function AuthBoundary({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell>
      <Suspense fallback={<AuthLoading />}>{children}</Suspense>
    </AuthShell>
  );
}
