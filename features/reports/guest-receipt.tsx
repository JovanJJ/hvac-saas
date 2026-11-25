"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormField } from "@/components/ui/form-field";
import { ReceiptDetails } from "./receipt-details";
import { receiptSchema, type ReportReceipt } from "./receipt-model";

type ReceiptField = "name" | "role" | "acknowledged";
const validationLabels: Record<ReceiptField, string> = {
  name: "Unesite ime i prezime.",
  role: "Unesite ulogu kod klijenta.",
  acknowledged: "Označite izjavu samo ako želite da potvrdite prijem.",
};
export function GuestReceipt({ token, initialReceipt, reference, revision, timeZone }: {
  token: string; initialReceipt: ReportReceipt | null; reference: string; revision: number; timeZone: string;
}) {
  const router = useRouter();
  const id = useId();
  const confirmation = useRef<HTMLDivElement>(null);
  const [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<ReceiptField, string[]>>>({});
  useEffect(() => { if (receipt) confirmation.current?.focus(); }, [receipt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    const parsed = receiptSchema.safeParse({ name: form.get("name"), role: form.get("role"), acknowledged: form.get("acknowledged") === "on" });
    setMessage("");
    setNeedsRefresh(false);
    if (!parsed.success) {
      const fields: Partial<Record<ReceiptField, string[]>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as ReceiptField;
        if (field in validationLabels) fields[field] = [validationLabels[field]];
      }
      setErrors(fields);
      const first = Object.keys(fields)[0];
      const control = first && element.elements.namedItem(first);
      if (control instanceof HTMLInputElement) control.focus();
      setMessage("Proverite označena polja. Potvrda još nije sačuvana.");
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch(`/r/${token}/receipt`, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (!response.ok) {
        setNeedsRefresh(response.status === 404 || response.status === 409);
        setMessage(result.message || "Potvrda nije sačuvana. Pokušajte ponovo.");
        return;
      }
      setReceipt(result.receipt);
      router.refresh();
    } catch {
      setMessage("Odgovor nije primljen. Proverite vezu i ponovite potvrdu; ponavljanje ne pravi duplikat.");
    } finally { setPending(false); }
  }
  const recorded = initialReceipt || receipt;
  return <section id="guest-receipt" className="card guest-receipt mx-auto my-6" aria-label="Potvrda prijema">
    <h2>Potvrda prijema</h2>
    <p>{reference} · Revizija {revision}</p>
    {recorded ? <div ref={confirmation} tabIndex={-1} aria-label="Zabeležena potvrda prijema">
      <ReceiptDetails receipt={recorded} timeZone={timeZone} />
      <p className="guest-help">Za ovaj link prijem je već zabeležen. Ponovno otvaranje ne pravi novu potvrdu.</p>
    </div> : <>
      <p id={`${id}-purpose`} className="my-3">Opciono · potvrdite samo prijem ove revizije izveštaja. Potvrda ne odobrava popravku, ponudu, dodatne troškove ili obračun.</p>
      <form onSubmit={submit} aria-describedby={`${id}-purpose`}>
        <fieldset disabled={pending}>
          <div className="form-grid my-4">
            <FormField id={`${id}-name`} name="name" label="Ime i prezime" autoComplete="name" required maxLength={120} errors={errors.name} />
            <FormField id={`${id}-role`} name="role" label="Uloga kod klijenta" autoComplete="organization-title" required maxLength={120} errors={errors.role} hint="Na primer: upravnik objekta ili kontakt osoba." />
          </div>
          <label className="my-4 flex min-h-11 items-start gap-3">
            <input className="mt-1 !h-5 !min-h-0 !w-5 shrink-0 !p-0" type="checkbox" name="acknowledged" required aria-invalid={!!errors.acknowledged} aria-describedby={errors.acknowledged ? `${id}-consent-error` : undefined} />
            <span>Potvrđujem da sam primio/la izveštaj {reference}, revizija {revision}.</span>
          </label>
          {errors.acknowledged && <p id={`${id}-consent-error`} className="guest-field-error">{errors.acknowledged[0]}</p>}
          <button className="button primary" disabled={pending}>{pending ? "Čuvanje potvrde…" : "Potvrdi prijem izveštaja"}</button>
        </fieldset>
        {pending && <p role="status">Sačekajte potvrdu servera. Uneti podaci su zadržani.</p>}
        {message && <p role="alert" className="my-3">{message}</p>}
        {needsRefresh && <button className="button secondary" type="button" onClick={() => router.refresh()}>Proveri stanje izveštaja</button>}
      </form>
    </>}
  </section>;
}
