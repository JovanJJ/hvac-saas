"use client";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormField } from "@/components/ui/form-field";
import { visitStatusLabels } from "@/features/visits/model";
import { generationAction } from "./generation-actions";
import { generationLabels, type GenerationState } from "./generation-model";
import type { PlanDetail } from "./model";
function GenerationForm({
  plan,
  data,
  operationId,
  jobId,
}: {
  plan: PlanDetail;
  data: GenerationState;
  operationId: string;
  jobId?: string;
}) {
  const [base] = useState({
    operationId,
    version: plan.version,
    planId: plan.id,
  });
  const [operation, setOperation] = useState(base.operationId);
  const [from, setFrom] = useState(data.today),
    [until, setUntil] = useState(data.windowUntil);
  const [state, action, pending] = useActionState(
    generationAction,
    {} as { message?: string },
  );
  return (
    <form
      action={action}
      className="space-y-4"
      onReset={(e) => e.preventDefault()}
      aria-label={jobId ? "Ponovni pokušaj pripreme" : "Period pripreme poseta"}
    >
      <input name="operationId" type="hidden" value={operation} />
      <input name="version" type="hidden" value={base.version} />
      <input name="planId" type="hidden" value={base.planId} />
      <input name="kind" type="hidden" value={jobId ? "retry" : "generate"} />
      <fieldset disabled={pending || !plan.enabled} className="m-0 space-y-4">
        {jobId ? (
          <input name="jobId" type="hidden" value={jobId} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={`generation-from-${plan.id}`}
              name="from"
              type="date"
              label="Priprema od datuma"
              min={data.today}
              required
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOperation(crypto.randomUUID());
              }}
            />
            <FormField
              id={`generation-until-${plan.id}`}
              name="until"
              type="date"
              label="Priprema do datuma"
              min={from}
              required
              value={until}
              onChange={(e) => {
                setUntil(e.target.value);
                setOperation(crypto.randomUUID());
              }}
            />
          </div>
        )}
        <button className="button primary" disabled={pending || !plan.enabled}>
          {pending ? "Slanje…" : jobId ? "Ponovi pripremu" : "Pripremi posete"}
        </button>
      </fieldset>
      {state.message && <p role="status">{state.message}</p>}
    </form>
  );
}
export function PlanGeneration({
  plan,
  data,
  operationId,
  page,
  retryOperations,
}: {
  plan: PlanDetail;
  data: GenerationState;
  operationId: string;
  page: number;
  retryOperations: Record<string, string>;
}) {
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  const active = data.jobs.some((j) => ["queued", "running"].includes(j.state));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return (
    <section className="my-5 min-w-0 space-y-4" aria-label="Generisanje poseta">
      <h2>Priprema ponavljajućih poseta</h2>
      <p>
        Aktivan plan automatski priprema posete za narednih 90 dana. Možete
        zatražiti period do 90 dana unutar narednih godinu dana. Postojeće
        posete se zadržavaju; ponavljanje zahteva ih ne duplira.
      </p>
      {!plan.enabled && (
        <p>
          Plan je pauziran. Nastavite plan pre nove pripreme; ranije kreirane
          posete ostaju u rasporedu.
        </p>
      )}
      <div className="card">
        <GenerationForm
          key={`generate-${plan.version}`}
          plan={plan}
          data={data}
          operationId={operationId}
        />
      </div>
      <button
        className="button secondary"
        onClick={() => refresh(() => router.refresh())}
        disabled={refreshing}
      >
        {refreshing ? "Osvežavanje…" : "Osveži rezultat pripreme"}
      </button>
      {active && (
        <p role="status">
          Priprema čeka obradu ili je u toku. Rezultat se automatski osvežava.
        </p>
      )}
      <details>
        <summary>Poslednji zahtevi za pripremu</summary>
        <p>Prikazano je najviše 20 poslednjih zahteva.</p>
        {data.jobs.map((job) => (
          <article
            key={job.id}
            data-job-id={job.id}
            className="card my-4 min-w-0 break-words space-y-3"
          >
            <h3>
              {job.from} – {job.until} · verzija plana {job.version}
            </h3>
            <p>
              {generationLabels[job.state]} · Pokušaj {job.attempts}/3
            </p>
            {job.result && (
              <p>
                Novo: {job.result.created} · Postojeće: {job.result.existing} ·
                Prošli termini preskočeni: {job.result.skippedPast}
              </p>
            )}
            {job.error === "configuration_invalid" && (
              <p>
                Proverite aktivnu lokaciju, sisteme, članove tima i vremensku
                zonu, pa sačuvajte plan ili ponovite pripremu.
              </p>
            )}
            {job.state === "failed" &&
              job.error !== "configuration_invalid" && (
                <p>Priprema nije završena. Ponovite zahtev.</p>
              )}
            {job.state === "failed" && job.version === plan.version && (
              <GenerationForm
                key={`retry-${job.id}-${plan.version}`}
                plan={plan}
                data={data}
                operationId={retryOperations[job.id]}
                jobId={job.id}
              />
            )}
          </article>
        ))}
      </details>
      <h3>Posete plana · {data.totalVisits}</h3>
      {!data.visits.length && <p>Za ovaj prikaz još nema kreiranih poseta.</p>}
      <ul className="space-y-3">
        {data.visits.map((visit) => (
          <li key={visit.id} className="break-words">
            <Link href={`/visits/${visit.id}`}>
              Poseta · {visit.intendedDate}
            </Link>{" "}
            · {visitStatusLabels[visit.status]}
            <p>
              {new Date(visit.start).toLocaleString("sr-Latn-RS", {
                timeZone: visit.timeZone,
              })}{" "}
              · {visit.timeZone}
            </p>
            <Link href={`/schedule/${visit.id}`}>Raspored posete</Link>
          </li>
        ))}
      </ul>
      <nav aria-label="Stranice poseta plana" className="flex flex-wrap gap-4">
        {page > 1 && (
          <Link href={`/maintenance/${plan.id}?visitsPage=${page - 1}`}>
            Prethodne posete
          </Link>
        )}
        {page * 30 < data.totalVisits && page < 1000 && (
          <Link href={`/maintenance/${plan.id}?visitsPage=${page + 1}`}>
            Sledeće posete
          </Link>
        )}
      </nav>
    </section>
  );
}
