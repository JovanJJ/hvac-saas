import Link from "next/link";
import { DeviceCleanupControl } from "@/features/offline/lifecycle-control";
import { Suspense } from "react";
import { connection } from "next/server";
import { AuthForm } from "./auth-form";
import type { AuthMode } from "./types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { LegalLinks } from "@/features/public-site/legal-links";
import "./auth.css";

const copy = {
  "sign-in": {
    title: "Prijava",
    description: "Prijavite se da nastavite rad u svom timu.",
  },
  "sign-up": {
    title: "Napravi nalog",
    description: "Ako ste dobili poziv od poslodavca, koristite imejl adresu navedenu u pozivu.",
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
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="auth-page auth-surface">
      <div className={`auth-panel ${wide ? "auth-panel-wide" : ""}`}>
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
      {mode === "sign-up" && <p className="auth-account-note">Pravljenje naloga ne pokreće probni period niti plaćenu pretplatu. Potvrdite imejl adresu pre prijave.</p>}
      <LegalLinks />
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
            <Link href={nextPath ? `/forgot-password?next=${encodeURIComponent(nextPath)}` : "/forgot-password"}>Zaboravili ste lozinku?</Link>
            <Link
              href={
                nextPath
                  ? `/sign-up?next=${encodeURIComponent(nextPath)}`
                  : "/sign-up"
              }
            >
              Napravi nalog
            </Link>
          </>
        )}
        {mode === "reset-password" && (
          <Link href="/forgot-password">Zatraži novi link</Link>
        )}
      </nav>
      <DeviceCleanupControl />
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
