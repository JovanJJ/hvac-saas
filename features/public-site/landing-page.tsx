import { demoAvailable } from "./availability";
import {
  PublicActionLink,
  PublicSectionHeading,
} from "./components";
import { PublicReportPreview, SampleReportLink } from "./public-report-preview";
import { WorkflowCapture, type WorkflowStage } from "./workflow-capture";
import { WorkedExample } from "./worked-example";
import { PricingSection } from "./pricing-section";
import { FaqSection } from "./faq-section";

const workflow = [
  {
    stage: "schedule",
    title: "Kancelarija zakazuje posetu",
    description: "Izaberite objekat, označite klime za servis i dodelite nalog tehničaru. U rasporedu se vidi ko ide na teren i kada.",
  },
  {
    stage: "field",
    title: "Tehničar beleži ishod",
    description: "Na telefonu otvara dodeljeni nalog, bira uređaj i upisuje nalaz. Ako prostorija nije dostupna, beleži razlog i sledeći korak.",
  },
  {
    stage: "office",
    title: "Klijent dobija izveštaj",
    description: "Kancelarija proverava nalog i šalje link do PDF-a. Otvorena ponuda ili povratna poseta ostaje vezana za odgovarajući uređaj.",
  },
] satisfies { stage: WorkflowStage; title: string; description: string }[];

function LandingHero() {
  return (
    <section className="public-hero" aria-labelledby="public-title">
      <div className="public-hero-copy">
        <h1 id="public-title">Servisni nalog na telefonu. PDF izveštaj za klijenta.</h1>
        <p className="public-lead">Tehničar na objektu beleži šta je urađeno na svakoj klimi. Kancelarija iz istog naloga priprema izveštaj i vidi za koje uređaje treba poslati ponudu ili zakazati novi dolazak.</p>
        <div className="public-hero-actions">
          {demoAvailable && <PublicActionLink href="/demo">Zatraži demonstraciju</PublicActionLink>}
          <SampleReportLink />
        </div>
      </div>
      <PublicReportPreview />
    </section>
  );
}

function WorkflowSection() {
  return (
    <section className="public-section public-workflow" aria-labelledby="kako-radi">
      <PublicSectionHeading id="kako-radi">Od zakazane posete do poslatog izveštaja</PublicSectionHeading>
      <ol className="public-workflow-steps">
        {workflow.map((step, index) => (
          <li key={step.title}>
            <span className="public-step-number" aria-hidden="true">{index + 1}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <WorkflowCapture stage={step.stage} />
          </li>
        ))}
      </ol>
      <p className="public-example-caption">Stvarni ekrani aplikacije · izmišljeni podaci</p>
      <div className="public-workflow-actions"><SampleReportLink /></div>
    </section>
  );
}

function ClosingSection() {
  return (
    <section className="public-closing" aria-labelledby="public-closing-title">
      <PublicSectionHeading id="public-closing-title">Pogledajte kako izgleda jedna servisna poseta.</PublicSectionHeading>
      <p>Za 15 minuta proći ćemo kroz nalog na telefonu, pregled u kancelariji i izveštaj koji dobija klijent.</p>
      {demoAvailable && <PublicActionLink href="/demo">Zatraži demonstraciju</PublicActionLink>}
    </section>
  );
}

export function LandingPage() {
  return (
    <>
      <LandingHero />
      <WorkflowSection />
      <WorkedExample />
      <PricingSection />
      <FaqSection />
      <ClosingSection />
    </>
  );
}
