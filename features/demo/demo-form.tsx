"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { legalPagesAvailable } from "@/features/public-site/availability";
import { submitDemo } from "./actions";
import type { DemoState } from "./validation";

export function DemoForm({ operationId, plan }: { operationId: string; plan: string }) {
  const [state, action, pending] = useActionState(async (previous: DemoState, form: FormData): Promise<DemoState> => {
    try { return await submitDemo(previous, form); }
    catch { return { status: "error", message: "Zahtev nije poslat. Pokušajte ponovo." }; }
  }, { status: "idle" });
  const [values, setValues] = useState({ name: "", email: "", company: "", plan, website: "" });
  const [operation, setOperation] = useState(operationId);
  function change(field: keyof typeof values, value: string) {
    setValues(previous => ({ ...previous, [field]: value }));
    setOperation(crypto.randomUUID());
  }
  if (state.status === "success") return (
    <div role="status" className="space-y-5 rounded-xl border border-[#a8c4bd] bg-[#e6f0ec] p-6">
      <p>Zahtev je primljen. Javićemo vam se na navedenu imejl adresu da dogovorimo termin.</p>
      <Link href="/" className="public-button public-button-secondary">Povratak na početnu</Link>
    </div>
  );
  return (
    <form action={action} noValidate className="space-y-5">
      <input type="hidden" name="operationId" value={operation} />
      <fieldset disabled={pending} className="m-0 min-w-0 space-y-5 border-0 p-0">
        <FormField id="demo-name" name="name" label="Ime" autoComplete="name" required maxLength={100} value={values.name} onChange={event => change("name", event.target.value)} errors={state.errors?.name} />
        <FormField id="demo-email" name="email" label="Imejl za dogovor" type="email" autoComplete="email" required maxLength={254} value={values.email} onChange={event => change("email", event.target.value)} errors={state.errors?.email} />
        <FormField id="demo-company" name="company" label="Naziv servisa" autoComplete="organization" required maxLength={160} value={values.company} onChange={event => change("company", event.target.value)} errors={state.errors?.company} />
        <div className="space-y-2">
          <label htmlFor="demo-plan" className="block text-sm font-semibold">Plan koji vas zanima (opciono)</label>
          <select id="demo-plan" name="plan" value={values.plan} onChange={event => change("plan", event.target.value)} aria-invalid={Boolean(state.errors?.plan)} aria-describedby={state.errors?.plan ? "demo-plan-error" : undefined} className="w-full rounded-md border border-[#b9c8bc] bg-white p-3 text-base">
            <option value="">Još ne znam</option><option value="solo">Solo</option><option value="tim">Tim</option>
          </select>
          {state.errors?.plan && <p id="demo-plan-error">{state.errors.plan.join(" ")}</p>}
        </div>
        <div hidden aria-hidden="true"><label htmlFor="demo-website">Website</label><input id="demo-website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={event => change("website", event.target.value)} /></div>
        <p className="text-sm">Ove podatke koristimo da odgovorimo na vaš zahtev. {legalPagesAvailable && <Link href="/privatnost">Kako koristimo podatke</Link>}</p>
        <button className="public-button public-button-primary border-0" type="submit">{pending ? "Slanje…" : "Pošalji zahtev"}</button>
      </fieldset>
      {state.status === "error" && <p role="alert" className="text-[#8a3528]">{state.message}</p>}
      <span role="status" className="sr-only">{pending ? "Slanje…" : ""}</span>
    </form>
  );
}
