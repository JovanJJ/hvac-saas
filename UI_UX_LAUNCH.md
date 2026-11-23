# HVAC SaaS · Public website and product entry

**Implementation handoff.** English design notes, production copy in Serbian Latin. This plan adds a public front door to the existing Next.js application. The first audience is a Serbian AC service company that schedules technicians, maintains several units at one site and owes its customer a service report. The primary conversion is a requested 15-minute demonstration. Existing staff should reach their next job in one navigation action when already signed in.

Use the existing product name and logo. Where this brief or its visual reference says **Servisni nalog** as a wordmark, it is a working label. **Sever servis** in the sample PDF is the fictional issuing contractor. Keep that name inside the example. Prices in this document are proposed pilot prices for the operator to confirm before commercial release.

## 1. Navigation and page decisions

| Destination | Placement and purpose |
| --- | --- |
| `/` | Public landing page. Replace the old automatic redirect from the public root. A signed-in visitor can still view this page and has a direct link back to the app. Protected app URLs keep their existing access checks. |
| `/#kako-radi`, `/#cene`, `/#pitanja` | Desktop navigation labels **Kako radi**, **Cene**, **Pitanja**. Use real fragment links with heading scroll offsets. Pricing and FAQ fit on the landing page. |
| `/demo` | **Zatraži demonstraciju**. A dedicated, shareable request form is useful for a referral and for showing submission success. It also serves as the pilot's sales contact page. |
| Existing registration and login | **Prijava** and **Registracija** are separate visible header links for signed-out visitors. Both office and field staff use the same login. Logged-in visitors see one role-aware app link instead. |
| Sample report | **Otvori primer PDF-a** opens a static, public copy with fictional data. Use a branded, same-origin asset URL such as `/primeri/servisni-izvestaj.pdf`. The actual recipient report continues to use its scoped link. |
| `/privatnost`, `/uslovi` | Place **Privatnost** and **Uslovi korišćenja** in the footer and near relevant forms. Both pages can be read without an account. |
| About, FAQ, contact and video | Put the audience and purpose in the hero, common questions on the landing page, the operator contact in the footer, and the short video in “Kako radi”. A visitor can reach these directly without navigating through extra pages. |

**Desktop header.** Wordmark links home, three anchors in the middle, then Prijava, Registracija, and the filled demo button at the right. At widths where the links no longer fit, switch to the mobile header. **Mobile header.** Wordmark, visible Prijava, and a labeled Meni button. Its first action is Registracija, followed by the demo link and the three anchors. The hero also exposes the demo action immediately. Signed-in visitors see **Kancelarija**, **Danas**, **Izaberi firmu** or **Moj nalog**, according to the access flow in section 4. Keep the target available when navigating from other public pages.

## 2. Landing page · exact copy and layout

### Hero

- **H1:** Servisni nalog na telefonu. PDF izveštaj za klijenta.
- **Body:** Tehničar na objektu beleži šta je urađeno na svakoj klimi. Kancelarija iz istog naloga priprema izveštaj i vidi za koje uređaje treba poslati ponudu ili zakazati novi dolazak.
- **Primary action:** Zatraži demonstraciju → `/demo`. **Secondary:** Otvori primer PDF-a → public sample. If it opens a new tab, announce that in its accessible name.
- **Trial line:** 30 dana probnog korišćenja · bez kartice.
- **Visual:** Use the real four-system report crop: show the number, summary and specific outcomes. Caption: **Primer naloga iz Jagodine · izmišljeni podaci**. The PDF link gives access to the full, selectable document. On desktop put text and actions at left and report at right. On mobile put the heading, body and both actions before the report crop.

### How it works · anchor `kako-radi`

**H2:** Od zakazane posete do poslatog izveštaja

| Heading | Published copy | Visual |
| --- | --- | --- |
| Kancelarija zakazuje posetu | Izaberite objekat, označite klime za servis i dodelite nalog tehničaru. U rasporedu se vidi ko ide na teren i kada. | Actual schedule crop, with one assigned visit. |
| Tehničar beleži ishod | Na telefonu otvara dodeljeni nalog, bira uređaj i upisuje nalaz. Ako prostorija nije dostupna, beleži razlog i sledeći korak. | Actual mobile visit showing a unit and outcome. |
| Klijent dobija izveštaj | Kancelarija proverava nalog i šalje link do PDF-a. Otvorena ponuda ili povratna poseta ostaje vezana za odgovarajući uređaj. | Actual review screen or report detail with the two next actions. |

Use three compact columns on desktop and ordered, stacked items on mobile. Under them place a video poster with a play control labeled **Pogledaj primer servisne posete (2 min)** once a captioned video is ready. Use its actual duration at publication. Before then show the three steps and the PDF link without an inactive play button.

### Field and office · one worked example

**H2:** Šta ostaje da se uradi posle posete?

**Body:** U poslovnici su planirane četiri klime. Dve su servisirane, trećoj je potrebna popravka, a četvrta je u zaključanoj arhivi. U izveštaju se vidi šta je pregledano i ko preuzima naredni korak.

| Device | Visible finding | Next action |
| --- | --- | --- |
| KL-03 · Sprat / kancelarija | Oštećen usmerivač vazduha | Servis šalje ponudu za popravku. |
| KL-04 · Suteren / arhiva | Prostorija zaključana | Klijent potvrđuje pristup i novi termin. |

Present these as two rows with labeled outcomes. Put a modest field photograph beside the rows on wide screens and below them on mobile. Use **4 planirana sistema · 3 pregledana · 2 otvorene stavke** as the example summary. This is job data, never a customer count or performance claim.

### Prices · anchor `cene`

**H2:** Izaberite plan za svoj servis

**Intro:** Probno korišćenje traje 30 dana od podešavanja firme i zakazivanja prve posete. Kartica nije potrebna. Po isteku probe sami odlučujete da li nastavljate.

| Card | Price and seats | Published copy | Action |
| --- | --- | --- | --- |
| **Tim** | **2.490 RSD mesečno** · vlasnik i još četiri korisnika | Za kancelariju i tehničare koji dele raspored. Dodelite posete, pratite nalaze sa terena i pregledajte izveštaj pre slanja klijentu. | **Zatraži demo za tim** → `/demo?plan=tim` |
| **Solo** | **1.290 RSD mesečno** · jedan korisnik | Za servisera koji sam zakazuje posete, vodi istoriju uređaja i šalje izveštaje svojim klijentima. | **Zatraži demo za solo servis** → `/demo?plan=solo` |

Below the cards: **Plaćeni plan počinje kada potvrdite nastavak. Plaćanje je mesečno, po računu.** Add the operator's correct tax-inclusive/exclusive wording once confirmed. Give Tim a stronger border and place it first on mobile. Both plans use the same service workflow. Keep links to the trial terms visible. If pilot sales are not open, label these as **Predložene cene za pilot** and collect demo requests only.

### Questions · anchor `pitanja`

**H2:** Pitanja servisera

| Question | Answer to publish |
| --- | --- |
| Da li aplikaciju mogu da koristim ako radim sam? | Da. Sami zakazujete posetu, unosite nalaz i izdajete izveštaj. Solo plan ima jedno korisničko mesto. |
| Kako se tehničar pridružuje firmi? | Vlasnik mu šalje poziv iz aplikacije. Tehničar se prijavljuje ili pravi nalog istom imejl adresom na koju glasi poziv. Kada ga prihvati, dodeljene posete vidi na ekranu „Danas“. |
| Šta mogu da uradim bez interneta? | Pre polaska preuzmite dodeljenu posetu dok imate vezu. Na terenu možete da zabeležite nalaz i fotografije. Kada se veza vrati, otvorite aplikaciju i proverite da li su izmene poslate. |
| Da li klijent mora da pravi nalog za izveštaj? | Ne. Klijent otvara link koji mu pošaljete i može da preuzme taj izveštaj. Ako potvrdi prijem, potvrda se odnosi na tu verziju izveštaja. |
| Šta se dešava posle 30 dana? | Tokom probe možete da proverite kako aplikacija radi na vašim poslovima. Ako želite nastavak, potvrdite plan i dobićete račun. Nema automatskog zaduženja kartice. |

Publish the offline answer after reconnection and photo replay pass on a real phone in the release being promoted. Use accessible disclosure buttons, preserve focus and allow several answers to remain open. The first question may start expanded.

### Closing section and footer

- **H2:** Pogledajte kako izgleda jedna servisna poseta.
- **Body:** Za 15 minuta proći ćemo kroz nalog na telefonu, pregled u kancelariji i izveštaj koji dobija klijent.
- **Action:** Zatraži demonstraciju.
- **Footer:** Product wordmark, **Softver za servisere klima-uređaja**, links **Demonstracija**, **Prijava**, **Registracija**, **Privatnost**, **Uslovi korišćenja**. Show the verified operator identity, contact email and applicable business identifiers. Replace authentication links with the app link for a signed-in visitor.

## 3. Additional public pages

### Demonstration request · `/demo`

Desktop uses two columns, with a compact form at left and a report thumbnail plus agenda at right. On mobile stack the form before the agenda. The product name links home and Prijava stays reachable. Skip a calendar integration during manual onboarding. A request creates a lead the operator can actually receive and reply to.

| Element | Serbian copy or behavior |
| --- | --- |
| Heading and introduction | **Dogovorite demonstraciju** · Ostavite kontakt i predložićemo termin. Za 15 minuta pokazaćemo vam kako se jedan nalog prenosi sa terena u kancelariju. |
| Fields | **Ime**, **Imejl za dogovor**, **Naziv servisa**. Optional select **Plan koji vas zanima (opciono)** with **Još ne znam**, **Solo**, **Tim**. Preselect the allowed value from the pricing link and let the visitor change it. |
| Under the form | **Ove podatke koristimo da odgovorimo na vaš zahtev.** Link **Kako koristimo podatke** to privacy. No newsletter opt-in is needed for this flow. |
| Action and states | **Pošalji zahtev** → **Slanje…**. On confirmed receipt: **Zahtev je primljen. Javićemo vam se na navedenu imejl adresu da dogovorimo termin.** Offer **Povratak na početnu**. Keep input on failure: **Zahtev nije poslat. Pokušajte ponovo.** Invalid email: **Unesite ispravnu imejl adresu.** |
| Agenda at right | **Šta ćemo pokazati** · Kako se dodeljuje nalog. Kako tehničar beleži nalaz za svaki uređaj. Kako kancelarija šalje PDF klijentu. Link **Otvori primer PDF-a**. |

Use a labeled form, server-side validation and duplicate-click protection. Confirm success only once the request has been durably recorded or handed to the configured delivery service. Before launch verify a real submission reaches the monitored destination. If manual email is used in lieu of a form for an early demo, label that action **Pošalji imejl** and show the real address.

### Privacy · `/privatnost`

Use a single reading column, a last-updated date, short in-page contents and selectable contact information. The following is editable launch copy. Values in square brackets require verified operator or deployment facts. Complete them before publication and verify the wording against actual processing.

| Heading | Draft Serbian copy |
| --- | --- |
| Privatnost | **Poslednja izmena: [datum].** Za obradu podataka o nalozima, zahtevima za demonstraciju i našem poslovnom odnosu odgovoran je [poslovno ime, adresa i kontakt rukovaoca]. Za pitanja o privatnosti pišite na [imejl]. |
| Zahtevi za demonstraciju i korisnički nalozi | Kada zatražite demonstraciju, koristimo ime, imejl, naziv servisa i opcioni izbor plana da odgovorimo i dogovorimo termin. Za pristup nalogu koristimo imejl, podatke o članstvu u firmi i događaje potrebne za prijavu. Pravni osnov i vreme čuvanja su [osnov i rok ili kriterijum zasebno za svaku svrhu]. Bez kontakt adrese ne možemo da odgovorimo imejlom. |
| Podaci iz servisnih naloga | Servisna firma određuje koje podatke o objektima, kontaktima, uređajima i posetama unosi u svoj radni prostor. Za podatke koje obrađujemo prema njenim uputstvima postupamo kao obrađivač. Za pitanje o konkretnom servisnom izveštaju možete se obratiti i servisu koji ga je izdao. |
| Čuvanje, primaoci i prenos | Podatke čuvamo [lokacije i rokovi, uključujući prijave i rezervne kopije]. U radu nam pomažu [potvrđeni pružaoci hostinga, dostave imejla i druge kategorije primalaca]. [Navesti eventualni prenos u drugu državu, zaštitne mere i kako do njih doći. Opisati stvarnu upotrebu kolačića, lokalnog čuvanja i video plejera.] |
| Vaša prava i kontakt | Možete tražiti pristup i ispravku podataka i, kada su uslovi ispunjeni, brisanje, ograničenje obrade, prenosivost ili uložiti prigovor. Ako se obrada zasniva na pristanku, možete ga povući. Zahtev pošaljite na [imejl]. Možete podneti pritužbu Povereniku za informacije od javnog značaja i zaštitu podataka o ličnosti. |

Confirm the controller/processor split, applicable legal bases, additional disclosures and contact details with the operator. [Serbian data protection law, Article 23](https://lexarhiva.rs/propisi/zakon-o-zastiti-podataka-o-licnosti-87-2018/iii/2) · [Commissioner's guide](https://poverenik.rs/zastita-podataka/kako-da-ostvarite-svoja-prava/?script=lat)

### Terms · `/uslovi`

Use the same reading layout. Put price, start of trial, end of trial and cancellation near the top. Keep a dated version accessible from registration and prices.

| Heading | Draft Serbian copy |
| --- | --- |
| Uslovi korišćenja | **Važe od [datum].** Pružalac usluge je [registrovano poslovno ime, adresa, matični broj, PIB i imejl]. Usluga je namenjena serviserima i servisnim firmama za poslovnu upotrebu. |
| Probno korišćenje i plaćanje | Proba traje 30 dana od podešavanja firme i zakazivanja prve posete. Kartica nije potrebna. Solo plan za jednog korisnika iznosi 1.290 RSD mesečno, a Tim za vlasnika i još četiri korisnika 2.490 RSD mesečno. [Potvrditi poreski tretman i rok plaćanja.] Plaćeni period počinje po vašoj potvrdi. |
| Pristup i radni prostor | Vlasnik firme dodeljuje pristup timu. Svaki korisnik koristi svoj nalog. Servisna firma odgovara za podatke koje unosi i bira kome dostavlja izveštaj. Potvrda prijema izveštaja evidentira prijem tog dokumenta. Dodatne radove servis posebno dogovara sa klijentom. |
| Otkazivanje, podaci i podrška | Zahtev za otkazivanje pošaljite na [imejl podrške]. [Navesti od kada otkaz važi, pristup po isteku probe ili pretplate, rok za izvoz i brisanje i postupanje sa već plaćenim periodom.] Za tehničku podršku i prigovore obratite se na [kontakt i postupak]. |

These are page drafts for the planned Serbian B2B pilot. Review the finished commercial terms, mandatory provider details and privacy text before enabling paid signups. [Serbian electronic commerce law](https://must.gov.rs/extfile/sr/2208/zakon_o_elektronskoj_trgovini.pdf)

## 4. Login, registration and the two workspaces

Use one identity per person. Existing server-verified membership determines their role in each organization. Treat paths here as integration targets and map them to the current repository's real routes before changing navigation. Preserve invitation and recovery callbacks.

| Person or state | UX and Serbian content |
| --- | --- |
| Returning worker or owner · `/sign-in` | Single-column card headed **Prijava**, fields **Imejl adresa**, **Lozinka**, action **Prijavi se**. Secondary actions **Zaboravili ste lozinku?** and **Napravi nalog**. Show Google sign-in only when the existing provider has been configured and tested. After authentication honor a valid authorized internal destination first. |
| New visitor · `/sign-up` | Heading **Napravi nalog**. Helper **Ako ste dobili poziv od poslodavca, koristite imejl adresu navedenu u pozivu.** Primary **Napravi nalog**. On success **Proverite imejl i potvrdite adresu.** Creating an identity starts neither a paid subscription nor the trial clock. |
| Verified identity, no company · `/account` | Heading **Vaš nalog**. Owner path **Napravi radni prostor** with company name and time zone. Employee helper **Ako vas je firma pozvala, otvorite link iz poziva.** Do not let a new user self-assign technician privileges for an existing company. |
| Invited employee · existing invitation URL | Keep the destination through sign-in/registration and confirmation. Show verified company and assigned role, then **Prihvati poziv**. Explain wrong email and expired link with **Promeni nalog** or **Zatražite novi poziv od vlasnika**. |
| Active owner/coordinator | Header shortcut **Kancelarija** → office dashboard. Show today's schedule, submitted visits needing review and next actions. First useful action **Zakaži posetu**. Owners who also service equipment can open **Danas** from the app. |
| Active technician | Header shortcut **Danas** → assigned visits, site, time, room/system and sync state. Primary action **Otvori nalog** or **Nastavi posetu**. Show needed follow-up and edit access for assigned work only. |
| More than one workspace | Use the selected authorized workspace. If none is selected, **Izaberi firmu** shows company and role on each row. Recheck membership after selection. |
| Customer with a report | The customer opens the received revision link directly without staff sign-in. Show the PDF and **Potvrđujem prijem** as separate actions. Keep this out of staff navigation. |

Office desktop uses a restrained sidebar with text labels for schedule, register, review and follow-ups. Put the workspace switcher and secondary account actions apart from daily work. The technician phone opens directly on Today, uses full-width visit rows, and keeps save/sync state next to the active item. The public page uses a horizontal header and both authenticated areas reuse the existing component system. Test that landing navigation cannot steal a deep link to an assigned visit, a report, or an invitation.

**Authenticated layouts and first-use states.** Keep the established application routes and adapt the following priorities to its current components.

| Screen | Desktop and mobile layout | Primary interaction and copy |
| --- | --- | --- |
| Office home and schedule | On desktop use the current day or week as the main column, with visits awaiting review alongside. On mobile stack today's jobs first, then the review queue. Keep role and workspace in the header. | **Zakaži posetu** opens customer, site, systems, technician and time. Empty first-run state: **Dodajte prvu lokaciju da biste zakazali posetu.** |
| Customer/site and equipment | Customer header, site list, then units searchable by code or room. A system detail starts with location and identity, followed by last service, open issue and visit history. | **Dodaj uređaj** and **Zakaži posetu** belong to the selected site. A repeat technician can open the previous finding from the active job. |
| Technician's Today and visit | Phone list by scheduled time. Show site, address, system count and downloaded/sync status. The visit opens to a stack of system cards with room, code and recorded outcome. | **Otvori nalog** → **Započni posetu** → select a system. Empty day: **Za danas nemate dodeljene posete.** Download readiness: **Dostupno bez interneta**. |
| Per-system form and submission | Identity first, then work performed, outcome, measurements with units, notes, parts and photos as relevant. For an inaccessible room show reason, owner and next step. A summary separates planned, inspected and outstanding. | **Sačuvaj unos**, **Pregledaj nalog**, **Predaj na pregled**. A missing outcome links to its device. Distinguish **Sačuvano na telefonu** from **Sinhronizovano**. Show **Potrebna provera** on conflicting edits. |
| Office review, follow-ups and issuing | Review from the visit summary, then inspect findings and visibility of photos. Keep follow-ups with owner, deadline and source system. The preview uses the customer-facing PDF format. | **Vrati na dopunu**, **Pregled PDF-a**, **Izdaj izveštaj**. Once the archived revision is ready, show **Kopiraj link**. Opening the form on a phone preserves all fields. |
| Customer report link | Single-column header with service company, site, visit date and revision. Put the summary and public PDF first, then the optional receipt. Show a simple unavailable state if access expired or was revoked. | **Preuzmi PDF**, **Potvrđujem prijem**. On confirmed receipt show **Prijem je potvrđen**. Download and receipt are independent actions. |

The complete per-screen requirements are in the [development guide](https://chatgpt.com/library?file_id=libfile_6af91d7c85f88191b8fca4e68ae70330&account_id=personal).

## 5. Visual system and inclusive interaction

| Element | Direction for implementation |
| --- | --- |
| Typography | Reuse the app's established sans family. Default for new marketing surfaces: **Inter** with a system sans fallback and Serbian Latin glyphs. Desktop H1 52–60 px, mobile 36–40 px, body 16–18 px with generous line height. Keep legal text around 65–75 characters per line. |
| Palette | Main text `#152F36`, supporting text `#475F63`, primary teal `#08665F` on white, background `#F8FAF7`, pale sage `#E6F0EB` behind report crops. Use white text on the dark primary button. Reserve warm amber for attention and pair it with explicit state text. |
| Grid | Maximum content width 1160 px, desktop hero approximately 48/52, desktop gutters 32 px, mobile 20 px. Switch to one column when both hero panels can no longer fit. Section spacing 72–96 px desktop, 40–56 px mobile. Tables in the example become labeled rows on narrow screens. |
| Controls | Use one filled action per decision area, clear link underlines or focus cues, visible keyboard focus, generous controls around 44 px tall and form labels above fields. Never place small text or primary actions over a busy photograph. |
| Accessibility and performance | Use landmarks, one H1, a skip link, logical heading order, semantic HTML and working back navigation. Menu supports keyboard, Escape, and returns focus to its toggle. Caption the demo video, supply a transcript and load the external player on request. Use responsive image sources, explicit dimensions and lazy-load below the fold. |
| Product truth | Use fictional seed data in all captures. Keep internal access notes and real client identifiers out of public assets. Preserve Serbian characters and actual app labels. Avoid invented testimonials, client logos, savings claims and generated interface text. |

## 6. Image directions and prompts for the implementation agent

Use the existing PDF and product screens as evidence. The only commissioned or generated photo is the field scene beside the worked example. Two image-generation prompts cover its responsive art direction. Use the desktop photograph on mobile too when a crop preserves both the technician and the unit. Authentication, pricing, FAQ, legal and demo form areas use typography and components.

| Asset | Production instructions / prompt | Accessible treatment |
| --- | --- | --- |
| Hero report | Export page 1 of the fictional **RN-2026-0142** PDF as a crisp 2× image. Crop headline, counters and rows on desktop. For mobile use a tighter crop around the counters and the two exceptions. Keep the PDF link in real HTML. Do not use image generation for this asset. | **Primer servisnog izveštaja sa četiri planirana i tri pregledana sistema.** |
| Workflow screenshots and demo page thumbnail | Capture the actual seeded schedule, phone visit and office preview for JA-02. Use the same visit in all images. At mobile widths crop to the active row or finding. Use the real PDF thumbnail on the demo page. | If adjacent text already conveys the information, use empty alt. Otherwise describe the visible action. |
| Desktop field photo · generation prompt | **Photorealistic editorial documentary photograph for a Serbian AC service company. A single technician in an unbranded dark teal work shirt stands on the floor in a modest contemporary commercial office in central Serbia, finishing a routine visit and recording a finding on a handheld phone. A closed wall-mounted indoor mini-split unit is clearly visible in the upper right on that same wall. Three-quarter rear view, relaxed credible posture, daylight, neutral walls, natural skin texture, restrained warm grey and green palette, 35 mm lens. Landscape 3:2 composition, person and unit together in the right two thirds, clean edges for a 4:3 crop. Screen angled away. No lettering, watermark, logo, overlay or illustration.** | **Serviser beleži nalaz na telefonu posle pregleda klima-uređaja.** Use empty alt if entirely decorative. |
| Mobile field photo · alternate prompt | **Using the selected desktop image as a visual reference, photograph the same Serbian technician and the same office from a slightly wider three-quarter rear angle. Vertical 4:5 framing, closed white wall-mounted AC in the upper third, person's hands and phone in the middle third. Natural daylight, understated documentary photography, unbranded clothes, no text, no logos, no visible phone UI. Keep both the technician and unit within the central 80 percent.** | Same alt as the desktop source in one responsive picture element. |
| Video poster | Use a frame from the actual demo where the two outstanding items are visible. Render the play button, accessible label and duration in HTML. Film with fictional data and Serbian captions. | Control name **Pusti demonstraciju** plus actual duration. |

Existing reference: [Example report with fictional data](https://chatgpt.com/library?file_id=libfile_eb8282a0320481918a057922ef2b2a1b&account_id=personal). Host the approved sample in the website's public assets at implementation.

## 7. Implementation order and review

1. Map the current root redirect, session handling, invitation return path and role resolver. Implement the public root and responsive header alongside existing protected layouts.
2. Build the landing sections with the Serbian copy. Add the sample PDF and product captures. Connect every anchor, demo link and authentication action.
3. Add the demo request with its delivery destination, privacy and terms pages, and the trial wording approved by the operator. Verify the agreed tax presentation, operator identity, cancellation and retention facts before commercial publication.
4. Test signed-out mobile, owner, technician, multiple memberships, invited employee and a guest PDF recipient. Test keyboard-only navigation and form success, invalid email, network failure and retry. At 360 px and 1440 px check that both account actions are discoverable, the H1 wraps naturally and the full report remains accessible.
5. Ask one owner to find the monthly team price, open the sample and request a demo. Ask one invited technician to reach their assigned visit. Record where each gets stuck and fix that step before expanding the site.

**First implementation prompt**

> Read AGENTS.md, the current auth routes, and this UI/UX plan. Implement the public landing page, its responsive header and the existing-account return path first. Use Serbian Latin copy from section 2. Preserve verified role routing, invitation callbacks and guest report links. For media use the fictional sample PDF and real seeded product screenshots. At handoff list the routes and checks actually verified and any publication details that still need the operator's input.
