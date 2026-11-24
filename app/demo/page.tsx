import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicLayout } from "@/features/public-site/public-layout";
import { pilotPlans, readDemoPlan } from "@/features/public-site/pilot-plans";

async function SelectedPlan({ searchParams }: PageProps<"/demo">) {
  const plan = readDemoPlan((await searchParams).plan);
  const selected = pilotPlans.find(item => item.id === plan);
  return selected ? <p className="public-demo-plan">Plan koji vas zanima: <strong>{selected.name}</strong></p> : null;
}

export default function Demo(props: PageProps<"/demo">) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <PublicLayout>
      <section className="public-intro">
        <p className="public-eyebrow">Razvojni pregled</p>
        <h1>Dogovorite demonstraciju</h1>
        <Suspense fallback={null}><SelectedPlan {...props} /></Suspense>
        <p>Obrazac za zahtev biće dostupan u narednom koraku izrade. Ova stranica trenutno ne prima zahteve.</p>
        <Link href="/">Povratak na početnu</Link>
      </section>
    </PublicLayout>
  );
}
