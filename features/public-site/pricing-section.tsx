import { demoAvailable } from "./availability";
import { PublicActionLink, PublicSectionHeading } from "./components";
import { pilotPlans } from "./pilot-plans";
import { LegalLinks } from "./legal-links";

export function PricingSection() {
  return (
    <section className="public-section public-pricing" aria-labelledby="cene">
      <PublicSectionHeading id="cene">Izaberite plan za svoj servis</PublicSectionHeading>
      <p className="public-pilot-label">Predložene cene za pilot</p>
      <p className="public-pricing-intro">Za samostalne servisere i timove. Konačne cene, uslove probnog korišćenja i poreski tretman potvrđujemo pre uključenja u pilot.</p>
      <div className="public-price-cards">
        {pilotPlans.map(plan => (
          <article key={plan.id} className={`public-price-card ${plan.id === "tim" ? "public-price-featured" : ""}`} aria-labelledby={`public-plan-${plan.id}`}>
            <h3 id={`public-plan-${plan.id}`}>{plan.name}</h3>
            <p className="public-price"><strong>{plan.price}</strong><span>mesečno</span></p>
            <p className="public-plan-seats">{plan.seats}</p>
            <p className="public-plan-description">{plan.description}</p>
            {demoAvailable && (
              <PublicActionLink href={`/demo?plan=${plan.id}`} variant={plan.id === "tim" ? "primary" : "secondary"}>
                {plan.action}
              </PublicActionLink>
            )}
          </article>
        ))}
      </div>
      <p className="public-pricing-note">Oba predloga koriste isti tok servisne posete. Nastavak korišćenja posebno dogovaramo; nema automatskog zaduženja kartice.</p>
      <LegalLinks />
    </section>
  );
}
