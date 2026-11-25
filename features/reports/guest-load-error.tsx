"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function GuestLoadError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <section className="guest-message" aria-labelledby="guest-error-heading">
    <h1 id="guest-error-heading">Izveštaj trenutno nije dostupan</h1>
    <p role="alert">Provera linka nije uspela. Proverite internet vezu i pokušajte ponovo.</p>
    <button className="button primary" disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Provera…" : "Pokušaj ponovo"}</button>
    <p className="guest-help">Ako problem ostane, obratite se servisnom timu koji vam je poslao link.</p>
  </section>;
}
