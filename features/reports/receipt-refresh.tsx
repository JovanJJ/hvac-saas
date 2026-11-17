"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
export function ReceiptRefresh() {
  const router = useRouter(),
    [pending, startTransition] = useTransition();
  return (
    <button
      className="button my-3"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Osvežavanje…" : "Osveži potvrde"}
    </button>
  );
}
