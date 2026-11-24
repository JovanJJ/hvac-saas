import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicLayout } from "@/features/public-site/public-layout";
import { legalPagesAvailable } from "@/features/public-site/availability";

export type LegalSection = { id: string; title: string; content: ReactNode };
export const legalRevision = { date: "2026-11-24", label: "24. novembar 2026.", version: "Radni nacrt 1" };

export function LegalReadingLayout({ title, introduction, sections }: {
  title: string; introduction: string; sections: LegalSection[];
}) {
  // Unreviewed operator/commercial facts must never become a public production notice.
  if (!legalPagesAvailable) notFound();
  return (
    <PublicLayout>
      <article className="mx-auto max-w-[72ch] break-words pb-12 text-base leading-7">
        <header className="mb-8">
          <p className="public-eyebrow">{legalRevision.version}</p>
          <h1>{title}</h1>
          <p className="mb-4 text-sm">Poslednja izmena: <time dateTime={legalRevision.date}>{legalRevision.label}</time></p>
          <p>{introduction}</p>
        </header>
        <aside aria-label="Status dokumenta" className="mb-8 rounded-xl border border-[#b9c8bc] bg-[#e6f0eb] p-5">
          <p className="font-semibold">Radna verzija za lokalnu proveru</p>
          <p>Podaci o operateru, kontaktima i konačni pravni i komercijalni uslovi čekaju potvrdu. Ovaj nacrt nije objavljeno obaveštenje o privatnosti niti važeći uslovi poslovanja.</p>
        </aside>
        <nav aria-label="Sadržaj dokumenta" className="mb-10 rounded-xl border border-[#cbd9d3] p-5">
          <h2 className="text-xl">Sadržaj</h2>
          <ol className="list-outside list-decimal space-y-2 pl-6">
            {sections.map(section => <li key={section.id}><a href={`#${section.id}`} className="block py-1 underline">{section.title}</a></li>)}
          </ol>
        </nav>
        <div className="space-y-10">
          {sections.map(section => (
            <section key={section.id} aria-labelledby={section.id} className="space-y-4">
              <h2 id={section.id} tabIndex={-1} className="scroll-mt-6">{section.title}</h2>
              {section.content}
            </section>
          ))}
        </div>
        <nav aria-label="Povezani dokumenti" className="mt-12 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#cbd9d3] pt-6 underline">
          <Link href="/privatnost">Privatnost</Link><Link href="/uslovi">Uslovi korišćenja</Link><Link href="/">Povratak na početnu</Link>
        </nav>
      </article>
    </PublicLayout>
  );
}
