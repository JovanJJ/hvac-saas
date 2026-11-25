import { publicMetadata } from "@/features/public-site/metadata";
import { randomUUID } from "node:crypto";
import { Suspense } from "react";
import { connection } from "next/server";
import { PublicLayout } from "@/features/public-site/public-layout";
import { PublicReportPreview, SampleReportLink } from "@/features/public-site/public-report-preview";
import { readDemoPlan } from "@/features/public-site/pilot-plans";
import { DemoForm } from "@/features/demo/demo-form";

async function RequestForm({ searchParams }: PageProps<"/demo">) {
  await connection();
  const plan = readDemoPlan((await searchParams).plan) ?? "";
  return <DemoForm operationId={randomUUID()} plan={plan} />;
}

export const metadata = publicMetadata("Dogovorite demonstraciju", "Pogledajte kako teren. povezuje raspored, nalaze tehničara i servisni izveštaj za klijenta u demonstraciji od 15 minuta.", "/demo");

export default function Demo(props: PageProps<"/demo">) {
  return (
    <PublicLayout>
      <section className="public-intro max-w-3xl">
        <h1>Dogovorite demonstraciju</h1>
        <p>Ostavite kontakt i predložićemo termin. Za 15 minuta pokazaćemo vam kako se jedan nalog prenosi sa terena u kancelariju.</p>
      </section>
      <div className="grid items-start gap-10 pb-16 lg:grid-cols-2 lg:gap-16">
        <Suspense fallback={<p role="status">Učitavanje obrasca…</p>}><RequestForm {...props} /></Suspense>
        <aside aria-labelledby="demo-agenda" className="grid min-w-0 gap-6">
          <PublicReportPreview />
          <h2 id="demo-agenda" className="text-2xl font-semibold">Šta ćemo pokazati</h2>
          <ol className="list-inside list-decimal space-y-3">
            <li>Kako se dodeljuje nalog.</li>
            <li>Kako tehničar beleži nalaz za svaki uređaj.</li>
            <li>Kako kancelarija šalje PDF klijentu.</li>
          </ol>
          <SampleReportLink />
        </aside>
      </div>
    </PublicLayout>
  );
}
