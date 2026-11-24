"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function OverviewError({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <div role="alert" className="my-5 rounded-xl border border-[#dce4df] bg-white p-5">
    <p>Prikaz „{label}“ trenutno nije dostupan. Pokušajte ponovo.</p>
    <button type="button" disabled={pending} className="button secondary mt-3" onClick={() => startTransition(() => router.refresh())}>{pending ? "Učitavanje…" : "Pokušaj ponovo"}</button>
  </div>;
}
