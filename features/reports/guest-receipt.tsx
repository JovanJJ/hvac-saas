"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ReceiptDetails } from "./receipt-details";
import type { ReportReceipt } from "./receipt-model";
export function GuestReceipt({
  token,
  initialReceipt,
  reference,
  revision,
  timeZone,
}: {
  token: string;
  initialReceipt: ReportReceipt | null;
  reference: string;
  revision: number;
  timeZone: string;
}) {
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/r/${token}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          role: form.get("role"),
          acknowledged: form.get("acknowledged") === "on",
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(
          result.message || "Potvrda nije sačuvana. Pokušajte ponovo.",
        );
        return;
      }
      setReceipt(result.receipt);
      router.refresh();
    } catch {
      setMessage(
        "Odgovor nije primljen. Proverite vezu i ponovite potvrdu; ponavljanje ne pravi duplikat.",
      );
    } finally {
      setPending(false);
    }
  }
  const recorded = initialReceipt || receipt;
  return (
    <section
      className="card mx-auto my-6 max-w-[210mm]"
      aria-label="Potvrda prijema"
    >
      <h2>Potvrda prijema</h2>
      <p>
        {reference} · Revizija {revision}
      </p>
      {recorded ? (
        <ReceiptDetails receipt={recorded} timeZone={timeZone} />
      ) : (
        <>
          <p className="my-3">
            Potvrdite samo prijem ove revizije izveštaja. Potvrda ne odobrava
            popravku, ponudu, dodatne troškove ili obračun.
          </p>
          <form onSubmit={submit}>
            <label className="block my-3">
              Ime i prezime
              <input name="name" autoComplete="name" required maxLength={120} />
            </label>
            <label className="block my-3">
              Uloga kod klijenta
              <input
                name="role"
                autoComplete="organization-title"
                required
                maxLength={120}
              />
            </label>
            <label className="my-4 flex min-h-11 items-start gap-3">
              <input
                className="mt-1 !h-5 !min-h-0 !w-5 shrink-0 !p-0"
                type="checkbox"
                name="acknowledged"
                required
              />
              <span>
                Potvrđujem da sam primio/la izveštaj {reference}, revizija{" "}
                {revision}.
              </span>
            </label>
            <button className="button primary" disabled={pending}>
              {pending ? "Čuvanje potvrde…" : "Potvrdi prijem izveštaja"}
            </button>
            {message && (
              <p role="alert" className="my-3">
                {message}
              </p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
