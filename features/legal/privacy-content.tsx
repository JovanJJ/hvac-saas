import type { LegalSection } from "./reading-layout";

export const privacySections: LegalSection[] = [
  {
    id: "odgovornost", title: "Odgovornost i kontakt",
    content: <p>Ovaj nacrt opisuje trenutni način rada aplikacije teren. Poslovno ime, adresa operatera i javni kontakt za privatnost još nisu potvrđeni. Pre objavljivanja potrebno je utvrditi uloge rukovaoca i obrađivača, pravni osnov za svaku svrhu i način podnošenja zahteva.</p>,
  },
  {
    id: "demo", title: "Zahtevi za demonstraciju",
    content: <>
      <p>Obrazac traži ime, imejl za dogovor, naziv servisa i opcioni izbor plana. Kontakt je potreban da bi operater odgovorio i dogovorio termin. Zahtev se čuva u privatnoj bazi, uz vreme prijema i identifikator koji sprečava dupliranje ponovljenog slanja.</p>
      <p>Ovlašćeni operater preuzima zahteve kroz zaštićenu administratorsku komandu i odgovara ručno. Obrazac ne šalje automatsku imejl poruku, ne pravi nalog i ne prijavljuje vas na bilten. Za ograničenje broja zahteva koristi se imejl adresa; ova zaštita ne prikuplja IP adresu kroz obrazac. To nije tvrdnja da infrastruktura ne vodi pristupne dnevnike.</p>
    </>,
  },
  {
    id: "nalozi", title: "Korisnički nalozi i imejl poruke",
    content: <>
      <p>Supabase Auth obrađuje prijavu, lozinku, potvrdu imejl adrese, oporavak pristupa i sesiju. Aplikacija koristi imejl, članstvo i ulogu u izabranoj firmi da odredi pristup podacima. Svaki član tima koristi sopstveni nalog.</p>
      <p>Poruke za potvrdu i oporavak šalje Supabase Auth preko podešenog SMTP servisa. U razvojnoj postavci koristi se Gmail SMTP. Pristup aplikaciji i prijem zahteva za demonstraciju su odvojeni tokovi; podešavanje SMTP servisa ne uključuje automatsko slanje odgovora na demo zahteve.</p>
    </>,
  },
  {
    id: "servisni-podaci", title: "Podaci iz servisnih naloga",
    content: <>
      <p>Servisna firma unosi klijente, lokacije, kontakte, uređaje, raspored, nalaze, fotografije i sledeće radnje. Pristup zavisi od firme i uloge; tehničar pristupa dodeljenim posetama. Za podatke koje servis unosi u svoj radni prostor potrebno je ugovorno potvrditi postupanje prema njegovim uputstvima.</p>
      <p>Izdata revizija izveštaja čuva sadržaj koji je važio pri izdavanju. Ispravka pravi novu reviziju. Primalac preko posebnog linka pristupa jednoj reviziji i može dobrovoljno ostaviti ime, ulogu kod klijenta i potvrdu prijema. Za pitanje o konkretnom izveštaju obratite se i servisu koji ga je izdao.</p>
    </>,
  },
  {
    id: "uredjaj", title: "Kolačići i čuvanje na uređaju",
    content: <>
      <p>Kolačići održavaju sesiju, izbor radnog prostora i bezbedan nastavak prijave ili poziva. Oznaka offline sesije pomaže razdvajanju lokalnih podataka pri promeni naloga. Ove funkcije služe radu aplikacije.</p>
      <p>Za izričito preuzete posete IndexedDB čuva radnu kopiju, nalaze, red za sinhronizaciju i fotografije koje čekaju slanje. Local storage čuva oznake za razdvajanje podataka i obaveštavanje drugih kartica. Service worker čuva verzionisanu offline aplikaciju; kancelarijski izvodi i javni linkovi izveštaja ne ulaze u taj offline keš.</p>
      <p>Brisanje podataka pregledača može ukloniti neposlate nalaze i fotografije. Pre odjave proverite sinhronizaciju ili svesno odbacite lokalne izmene. Sinhronizacija se izvršava dok je aplikacija aktivna i povezana; ne obećava se slanje dok je pregledač zatvoren.</p>
      <p>U trenutnoj implementaciji nema marketinške analitike niti ugrađenog spoljnog video plejera. Primer PDF-a i slike na javnoj stranici služe se iz aplikacije.</p>
    </>,
  },
  {
    id: "cuvanje", title: "Čuvanje, pružaoci usluga i prenos",
    content: <>
      <p>Trenutna razvojna postavka koristi samostalno hostovan Supabase u Dockeru za bazu, Auth i privatne PDF arhive, Cloudinary za fotografije i podešeni SMTP servis za autentifikacione poruke. Samostalno hostovan Supabase ne znači da se baza nalazi u Supabase Cloud-u.</p>
      <p>Produkcioni hosting i države obrade još nisu odabrani. Rokovi čuvanja kontakata za demonstraciju, naloga, servisnih podataka, dnevnika i rezervnih kopija, kao i postupak brisanja i eventualni međunarodni prenos, čekaju potvrdu. Aplikacija trenutno ne sprovodi automatsko brisanje demo zahteva po isteku nekog unapred određenog roka.</p>
    </>,
  },
  {
    id: "prava", title: "Vaša prava",
    content: <>
      <p>Možete tražiti pristup, ispravku i dopunu podataka, a pod uslovima propisanim zakonom i brisanje, ograničenje obrade, prenosivost ili prekid obrade. Možete se obratiti Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti. Opis postupka dostupan je u <a className="underline" href="https://poverenik.rs/zastita-podataka/kako-da-ostvarite-svoja-prava/?script=lat">zvaničnom vodiču Poverenika</a>.</p>
      <p>Javni kontakt operatera za ove zahteve mora biti potvrđen i dodat pre objavljivanja konačnog obaveštenja.</p>
    </>,
  },
];
