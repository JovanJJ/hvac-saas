import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/features/public-site/public-layout";

export default function Demo() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <PublicLayout>
      <section className="public-intro">
        <p className="public-eyebrow">Razvojni pregled</p>
        <h1>Dogovorite demonstraciju</h1>
        <p>Obrazac za zahtev biće dostupan u narednom koraku izrade. Ova stranica trenutno ne prima zahteve.</p>
        <Link href="/">Povratak na početnu</Link>
      </section>
    </PublicLayout>
  );
}
