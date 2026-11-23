import { PublicLayout } from "@/features/public-site/public-layout";

export default function Home() {
  return (
    <PublicLayout>
      <section className="public-intro" aria-labelledby="public-title">
        <p className="public-eyebrow">Za servisere klima-uređaja</p>
        <h1 id="public-title">Servisni nalog na telefonu. PDF izveštaj za klijenta.</h1>
        <p>Tehničar na objektu beleži šta je urađeno na svakoj klimi. Kancelarija iz istog naloga priprema izveštaj i vidi za koje uređaje treba poslati ponudu ili zakazati novi dolazak.</p>
      </section>
      <section className="public-section" aria-labelledby="kako-radi">
        <h2 id="kako-radi" tabIndex={-1}>Kako radi</h2>
        <p>Kancelarija zakazuje posetu, tehničar beleži ishod, a klijent dobija izveštaj.</p>
      </section>
      <section className="public-section" aria-labelledby="cene">
        <h2 id="cene" tabIndex={-1}>Cene</h2>
        <p>Pilot je namenjen samostalnim serviserima i timovima. Komercijalni uslovi biće objavljeni pre početka prodaje.</p>
      </section>
      <section className="public-section" aria-labelledby="pitanja">
        <h2 id="pitanja" tabIndex={-1}>Pitanja</h2>
        <p>Već imate nalog? Prijavite se da otvorite svoj radni prostor. Ako ste dobili poziv firme, otvorite link iz poziva i koristite imejl adresu na koju je poslat.</p>
      </section>
    </PublicLayout>
  );
}
