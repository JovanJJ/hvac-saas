import { pilotPlans } from "@/features/public-site/pilot-plans";
import type { LegalSection } from "./reading-layout";

export const termsSections: LegalSection[] = [
  {
    id: "proba-i-cene", title: "Predlog probe i cena",
    content: <>
      <p>Za pilot je predložena proba od 30 dana bez kartice. Početak probe i uslovi nastavka potvrđuju se pre uključenja. Pravljenje naloga trenutno ne pokreće probni rok, pretplatu ili automatsku naplatu.</p>
      <ul className="list-inside list-disc space-y-2">{pilotPlans.map(plan => <li key={plan.id}><strong>{plan.name}: {plan.price} mesečno.</strong> {plan.seats}.</li>)}</ul>
      <p>Ovo su predložene cene za pilot. Poreski tretman, rok plaćanja i početak plaćenog perioda još nisu potvrđeni. Aplikacija ne obrađuje kartična plaćanja i ne izdaje poreske račune.</p>
    </>,
  },
  {
    id: "otkazivanje", title: "Otkazivanje i nastavak korišćenja",
    content: <p>Uslovi otkazivanja, datum prestanka pristupa, postupanje sa već plaćenim periodom i rokovi za izvoz i brisanje podataka još nisu dogovoreni. Konačni tekst mora sadržati javni kontakt i postupak za otkazivanje pre početka plaćenog korišćenja. Ovaj nacrt ne uvodi pretplatu niti obećava neograničen pristup posle probe.</p>,
  },
  {
    id: "pruzalac", title: "Pružalac i namena usluge",
    content: <p>teren. je aplikacija namenjena serviserima i servisnim firmama za poslovnu upotrebu: raspored poseta, nalaze sa terena, izveštaje i sledeće radnje. Registrovano poslovno ime, adresa, matični broj, PIB i kontakt pružaoca čekaju potvrdu. Ovaj dokument nije konačna ponuda za plaćenu uslugu.</p>,
  },
  {
    id: "pristup", title: "Pristup i radni prostor",
    content: <>
      <p>Svaki korisnik ima svoj nalog. Vlasnik radnog prostora poziva članove i određuje njihove uloge. Tehničar vidi dodeljene posete; kancelarijske funkcije zavise od uloge. Poziv se prihvata nalogom sa odgovarajućom imejl adresom.</p>
      <p>Servisna firma bira podatke koje unosi, dodeljuje rad i bira kome šalje izveštaj. Posle rada bez interneta potrebno je proveriti sinhronizaciju i predaju kancelariji. Preuzeta radna kopija nije zamena za potvrdu da je server primio unos.</p>
    </>,
  },
  {
    id: "izvestaji", title: "Izveštaji i potvrda prijema",
    content: <>
      <p>Kancelarija proverava nalaze i izdaje reviziju servisnog izveštaja. Naknadna ispravka stvara novu reviziju; prethodni izdati sadržaj se zadržava. PDF i link za klijenta koriste se kada je arhiva spremna.</p>
      <p>Otvaranje ili preuzimanje izveštaja nije potvrda prijema. Dobrovoljna potvrda odnosi se na prikazanu reviziju i ne odobrava ponudu, dodatne radove ili naplatu. Servis dodatne radove posebno dogovara sa klijentom. Izveštaj i interna provera naplate nisu poreski račun.</p>
    </>,
  },
  {
    id: "podaci-i-podrska", title: "Podaci, izvoz i podrška",
    content: <>
      <p>Vlasnik radnog prostora može da izveze klijente, lokacije, sisteme, komponente, posete i nalaze u CSV ili ZIP formatu. Izdate PDF revizije preuzimaju se odvojeno. Rok dostupnosti izvoza po prestanku korišćenja mora biti dogovoren.</p>
      <p>Kontakt za tehničku podršku i prigovore, radno vreme i način rešavanja zahteva još nisu potvrđeni. Ovaj nacrt ne obećava rok odgovora ili ugovoreni nivo dostupnosti.</p>
    </>,
  },
];
