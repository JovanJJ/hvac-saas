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

## 7. Feature implementation plan

**Planning baseline: 23 November 2026.** The original request authorized this implementation plan only; subsequent requests authorize UX01–UX04. Sections 1–6 describe the intended experience; their prompts and publication instructions do not authorize later tickets, image generation, customer contact or deployment. Implement one ticket below per subsequent request. UX05–UX14 remain **Not started**.

**Sequence:** UX01 → UX02 → UX03 → UX04 → UX05 → UX06 → UX07 → UX08 → UX09 → UX10 → UX11 → UX12 → UX13 → UX14 → final environment/release gate. Finish feature work and local acceptance before staging. Existing M6a staging drafts remain deferred; this plan does not mark any M6 ticket complete or remove its release requirements.

### Repository baseline and scope decisions

- At the planning baseline, `app/page.tsx` redirected through `landingPath()` in `features/workspaces/dal.ts`. UX01 replaced that public root behavior; authentication actions, protected routes and callbacks continue to resolve authorized destinations.
- The current wordmark is **teren.**, shared in concept by `features/auth/auth-screen.tsx` and `features/workspaces/staff-shell.tsx`. Keep it. The reference's **Servisni nalog** wordmark is a layout placeholder; its hero sentence remains the requested Serbian copy.
- `UI_UX_REFERENCE.png` is the visual reference for the public header, desktop two-column hero, stacked phone hero, report panel, buttons and three-step section. It is not a screenshot to embed as the website, a replacement app shell, or a change to the issued PDF template. Build semantic, selectable HTML around real report media. The outer presentation board and the labels RAČUNAR/TELEFON are not page content.
- UX03 publishes the fictional sample PDF and desktop/phone crops in `public/primeri`; UX04 adds real workflow captures from an isolated fictional visit. An optional field photograph and captioned video remain unavailable and are omitted. Use the local report implementation and fictional source rather than depending on the external library links above. The local `DEVELOPMENT_GUIDE.md` is the per-screen implementation reference.
- `StaffShell` currently uses a wrapping horizontal navigation. The office sidebar and phone navigation are a separate ticket from the public header. Keep all existing operational destinations reachable, including imports, maintenance, exports and owner settings.
- Current routing sends a verified identity without memberships to `/onboarding`; `/account` provides account/workspace management. Keep these real routes. With several memberships, the resolver currently falls back to the first when no selection cookie exists; UX06 adds the explicit chooser described in section 4, with regression coverage.
- Trial timing and prices in this brief are commercial proposals. Do not add subscription enforcement, checkout, invoice issuance or a new trial clock during a visual refresh. Until the operator confirms them, show **Predložene cene za pilot** and avoid presenting an unimplemented trial start rule as enforced behavior.
- Existing Supabase Auth SMTP configuration serves authentication emails. A demo request needs its own explicit receipt/delivery contract; do not assume changing the Auth SMTP settings creates a general application mail sender.

### UX01 — Public root and account-aware header

**Status: Implemented and locally verified · 23 November 2026.** `app/page.tsx` now renders the public entry through `features/public-site/public-layout.tsx`. Request-scoped account links, responsive navigation, skip link, scoped tokens/styles and reusable footer are implemented without changing protected layouts or the existing landing resolver. The demo destination is an explicitly labeled development-only preview, with no lead form; its links are omitted in production. Introductory anchor sections keep navigation usable until the full UX02–UX05 content lands. No staging services were started.

**Checks actually run:** `npm run lint`, `npm run typecheck`, `npm test` (15 passing unit test files), and `npm run build -- --webpack` passed. The sandboxed build first failed while parsing TypeScript configuration output; the build succeeded with process/network restrictions lifted. Browser checks initially required a missing Chromium audio library, extracted into `/tmp` without installing system packages. The final focused Playwright run passed 24 scenarios across phone/desktop for public entry, role shortcuts, safe visit/invitation destinations, unavailable guest links, session refresh/sign-out, two organizations, unassigned users and workspace invitations/role changes/revocation/switching. An additional five checks passed for signed-in shortcuts at 360 px and the local demo preview. Anonymous screenshots at 360/390/768/1440 px were captured; 360/1440 px screenshots were visually inspected. Local production HTTP smoke checks confirmed `/` = 200 with no-store caching and no demo CTA, `/demo` = 404 and `/preview` = 404. Development auth/workspace regressions emitted recurring framework Performance-measure diagnostics despite passing assertions; no claim is made that these diagnostics were fixed. Real-device and staging acceptance remain deferred. **Next: UX02.**

**Depends on:** No earlier UX ticket. Read `AGENTS.md`, `SPEC.md`, the auth/workspace DAL, callbacks and the installed Next.js layout, Server Component and caching guides before implementation.

**Implement:** Replace the root redirect with a public page and a reusable public header/footer layout. Add the desktop navigation and accessible mobile menu from sections 1 and 5. Resolve the signed-in shortcut on the server using verified membership: office, Today, account/chooser or onboarding as appropriate. Keep public content renderable for signed-out visitors; avoid a protected layout or a database membership lookup for anonymous visitors. Isolate cookie-dependent account controls from reusable public content and prevent cross-user caching. Use existing wordmark and shared spacing/color/control tokens scoped to avoid restyling operational screens unexpectedly.

**Acceptance:** `/` remains public with and without a session. At 360, 390, 768 and 1440 px, header actions fit, the menu works with keyboard/Escape and returns focus, and both login and registration are discoverable. Direct invitation, recovery, visit and recipient links retain their destinations. Establish final link targets now; temporary unfinished destinations stay in local development and are not presented as a completed launch.

### UX02 — Reference hero and landing structure

**Status: Implemented and locally verified · 23 November 2026.** Before editing, this file was identical to the UX01 commit `263f0ba`, with all 14 tickets intact and no uncommitted changes; no unintended document edits were found. The landing now has a desktop two-column hero, a phone layout with copy/actions before the report panel, three numbered workflow steps and the closing demo section. Reusable server-rendered container, heading, action-link and report-panel components retain the established font and scoped public styles. Demo CTAs share UX01's development-only availability. The PDF area is explicitly marked as preparation space, with no fake download; UX03 supplies the real fictional report. Unconfirmed trial copy remains unpublished, and full pricing/FAQ remain UX05 work.

**Additional correction:** The first reflow check exposed an existing UX01 interaction race: opening the fallback menu before account resolution could close it when Suspense replaced the navigation. Account/registration links now stream inside a persistent client navigation rather than replacing the menu. This preserves its open state while retaining server-verified role shortcuts and request-scoped reads.

**Checks actually run:** `npm run lint`, `npm run typecheck`, `npm run build -- --webpack`, `git diff --check` and the final Playwright run of `tests/landing-page.spec.ts` plus `tests/public-entry.spec.ts` all passed (28 browser scenarios). Screenshots were captured at 360, 390 and 1440 px, with 360/1440 px visually inspected. Checks covered two-column versus stacked layout, three ordered steps, touch-target height, keyboard/focus/Escape, CTA navigation, no missing PDF link, role shortcuts and existing safe deep-link behavior. A 720-CSS-pixel/2×-density context verified the reflow equivalent of 200% zoom on a 1440-pixel display with reduced motion; native browser-toolbar zoom was not manually exercised. Palette contrast checks passed at 13.41:1 for main text, 6.49:1 for supporting text, 5.84:1 on sage and 6.83:1 for the primary button. Local standalone production HTTP checks confirmed `/` = 200 with no-store caching and no unfinished demo/PDF links, `/demo` = 404 and `/preview` = 404; the temporary server was stopped. Existing framework development timing diagnostics were already recorded during UX01; they were not changed by this ticket. No staging deployment, schema changes or physical-device acceptance was performed. **Next: UX03.**

**Depends on:** UX01.

**Implement:** Build the hero, three numbered workflow steps and closing CTA using section 2 copy and the supplied reference proportions. Create reusable container, section-heading, action-link and report-panel components; preserve server rendering for static sections. Keep text/actions before the report on phones, give buttons generous touch areas and use real heading anchors. Reserve the report panel dimensions for UX03 without a fake report download. Reuse the established font; introduce Inter only if needed and bundled/configured consistently.

**Acceptance:** Desktop shows the two-column hero and three workflow columns; phones stack them without horizontal page scrolling. Verify H1 wrapping, contrast, focus, reduced motion and 200% zoom. Record screenshots at 360, 390 and 1440 px. No invented claims, testimonials or decorative reference-board elements.

### UX03 — Public fictional report and responsive preview

**Status: Implemented and locally verified · 23 November 2026.** The static public RN-2026-0142 / JA-02 report is available at `/primeri/servisni-izvestaj.pdf`. It is a two-page, searchable Serbian A4 PDF rendered from a fixed fictional DTO through the existing renderer/template with no live reads, tokens or private evidence. Desktop and phone WebP crops come from the exact first-page PDF raster; the phone crop highlights counters and the two exceptions. The hero and workflow have native PDF links, and the caption exposes 4 planned / 3 inspected / 2 open actions as readable HTML. The PDF keeps KL-04 explicitly inaccessible, with no inferred service or readings. Issued production revisions and the interactive development fixture are unchanged.

**Reproduction:** `npm run sample:report`; fictional source is `scripts/fixtures/public-report.ts`, prerequisites/review instructions are in `scripts/fixtures/README.md`, and the public manifest records dimensions, crop coordinates and hashes. Generation is an explicit maintainer command, not a production build dependency.

**Checks actually run:** Generation validated searchable Serbian text, A4 dimensions, embedded searchable fonts, metadata, numbered pages, expected 4/3/2 and excluded private strings. Both full PDF page images and the phone crop were visually inspected. A second generation reproduced identical PDF, both WebP files and manifest bytes. `npm run lint`, `npm run typecheck`, `npm run build -- --webpack` and the focused Playwright run of `tests/landing-page.spec.ts`, `tests/public-entry.spec.ts` and `tests/public-sample.spec.ts` passed (30 browser scenarios). The existing development server on port 3000 was reused; responsive captures at 360/390/1440 px, art-directed source selection, loaded images, HTML counts, PDF links, keyboard/navigation, anonymous downloads and artifact hashes passed. Phone/desktop screenshots at 360/1440 px were visually inspected. A temporary standalone production package, with the same static-asset copies as the Dockerfile, served the PDF and both crops anonymously with matching hashes and no session cookies; `/preview` and `/demo` returned 404, while the root linked the sample. The temporary production server was stopped. No database changes, staging or physical-device acceptance were performed. **Next: UX04.**

**Depends on:** UX02. Read `REPORTS.md` and the existing report renderer/fixtures.

**Implement:** Produce a static, selectable Serbian A4 PDF using the existing report format and fictional RN-2026-0142 scenario. Publish the reviewed artifact at `/primeri/servisni-izvestaj.pdf`, with desktop/phone crops from the same bytes and explicit image dimensions. Include a reproducible generation/capture command and fictional source data. Public sample media is deliberately publishable; keep the interactive M0 fixture development-only. Do not use staff cookies, a live guest capability, real records or an internal/private PDF URL as the public sample.

**Acceptance:** PDF and crops agree on **4 planirana sistema / 3 pregledana / 2 otvorene stavke**, including the locked-room outcome. Inspect every PDF page and Serbian glyphs; verify anonymous download in a production build and readable preview at phone/desktop widths. Check assets and PDF metadata for real identities, internal notes and credentials.

### UX04 — Worked example and actual product captures

**Status: Implemented and locally verified · 23 November 2026.** The landing now shows two labeled, responsive HTML rows for KL-03's damaged deflector/quote and KL-04's locked archive/access/new appointment, with the fictional 4/3/2 summary. Each workflow step includes a real product capture: schedule, phone field entry and office customer-preview results. Five reviewed WebP files provide desktop/phone schedule and office views plus the actual phone field form; dimensions and hashes are recorded in `public/primeri/workflow.json`. Adjacent text describes the actions, images are lazy-loaded with empty decorative alt text, and distinct keyboard-accessible **Uvećaj snimak** links open full-size images. The public PDF remains the complete selectable example.

**Capture provenance:** `npm run sample:workflow` runs the explicitly gated `tests/capture-public-workflow.spec.ts`. It creates temporary `.invalid` owner/technician identities and an isolated fictional workspace, accepts an invitation, creates one JA-02 visit from the UX03 source, captures its schedule/editor, saves and submits its four outcomes through existing role-scoped commands, and captures its office summary. Fixture records are removed in `finally`; existing records and issued revisions are not edited. Captures contain no account header, author email, capability URL or internal notes. The live temporary attendance is a draft/submitted visit rather than a newly issued RN-2026-0142 revision; that number identifies the shared fictional scenario and the existing public sample. See `scripts/fixtures/README.md` for generation/review instructions. No licensed field photograph or captioned video is supplied, so the complete text layout ships without those optional assets or inactive video controls. Refresh these screenshots after UX09–UX12; existing office-phone table wrapping is visible rather than replaced with invented UI text.

**Checks actually run:** The final `npm run sample:workflow` capture passed, and a normal run without its environment gate skipped it as intended. All five published source images were visually inspected. `npm run lint`, `npm run typecheck`, `npm run build -- --webpack` and `git diff --check` passed. Focused Playwright runs of `tests/landing-page.spec.ts`, `tests/public-entry.spec.ts`, `tests/public-sample.spec.ts` and `tests/public-workflow.spec.ts` passed 34 scenarios, covering responsive source selection, lazy image loading, two readable action rows, no horizontal overflow, focus/keyboard behavior, existing entry paths, anonymous files and manifest hashes. Screenshots at 360/1440 px were visually inspected; existing 390/768 px entry checks and the 200% reflow-equivalent/reduced-motion checks passed. A temporary standalone production package served the worked example and all five captures anonymously with matching hashes/no session cookies; `/preview` and `/demo` remained 404. Only that temporary production server was stopped; the existing development stack remains running. No staging, schema/permission changes or physical-device acceptance were performed. **Next: UX05.**

**Depends on:** UX03.

**Implement:** Add the two outstanding-action rows, summary and three workflow captures using the same fictional site/visit. Capture the actual schedule, field form and office review, with responsive crops and appropriate alt text. Add a field photograph only when a suitable licensed or generated asset is available; retain a complete text/rows layout while it is pending. Keep the video omitted until a real captioned recording, transcript and duration exist. Update captures after the later app refresh tickets if their UI changes.

**Acceptance:** Screenshots reflect functioning product UI and contain fictional data only. Rows remain readable on phones; images have bounded dimensions and below-fold lazy loading. PDF remains the full accessible source for the report example. No inactive video controls or generated product-screen text.

### UX05 — Pricing and FAQ

**Depends on:** UX04.

**Implement:** Add Tim/Solo cards, pricing anchors, FAQ disclosures and closing/footer content. Put Tim first on phones. Validate `plan=tim|solo` links for the upcoming demo form. Keep proposed prices visibly provisional until confirmed; obtain the actual trial, tax and continuation wording before promoting those terms. FAQ content must match invitation, receipt and sync behavior. Keep the offline promise qualified or unpublished until the pending real-phone acceptance passes.

**Acceptance:** Prices and plan links are easy to find, multiple answers can remain expanded, keyboard operation works and disclosure state is announced. No card collection, automatic billing or claim that a report receipt approves additional work. Confirm the trial sentence is consistent across hero, FAQ and terms.

### UX06 — Authentication, invitations and first entry

**Depends on:** UX05. Read `BACKEND.md` before changing routing or commands.

**Implement:** Refresh existing sign-in, sign-up, recovery, account and onboarding surfaces with shared primitives. Preserve safe authorized return paths through confirmation and invitation acceptance. Add the multi-workspace chooser instead of silently choosing the first membership when no valid selection exists, and map its label to the real `/account` flow. Keep workspace creation at `/onboarding`; identity creation starts no subscription. Add invitation email guidance, wrong-account/expired states and terms/privacy links. Keep Google sign-in absent unless configured and verified.

**Acceptance:** Exercise owner/coordinator → office, technician → Today, no membership → onboarding, multiple memberships → chooser, stale selection and revoked membership. Verify the invitation survives sign-up/confirmation with the matching email, recovery returns safely and malicious external `next` values are rejected. Include a second organization and an unassigned technician for any permission/routing change. Do not switch the existing external Auth SMTP configuration back to local mail merely to run tests; distinguish controlled mail tests from real inbox acceptance.

### UX07 — Demo request from form to durable receipt

**Depends on:** UX06. Read `BACKEND.md` and `DATABASE.md` for the new public write boundary.

**Implement:** Build `/demo` with the form, agenda and report thumbnail in section 3. Use server-side validation, an allowlisted optional plan, field errors, retained inputs, pending/success/failure states and duplicate-submit protection. Define and document a durable lead store plus a protected operator retrieval path or confirmed delivery destination. Ship any migration, restricted access policies and retry behavior with the feature; anonymous visitors may submit only validated lead fields and must never list leads. Add bounded abuse protection. Keep privileged credentials server-only and avoid logging contact details. An email fallback must use a verified address and the explicit label **Pošalji imejl**.

**Acceptance:** Submit a fictional request, retrieve it through the authorized destination and verify retry/double click does not create duplicates. Test invalid email, bad plan, delivery/storage failure and rate limiting. Show success only after durable receipt or confirmed delivery handoff. Verify real delivery to the monitored destination before public launch; do not send unsolicited messages as a test.

### UX08 — Privacy, terms and operator facts

**Depends on:** UX07 so the processing description matches the actual lead flow.

**Implement:** Add `/privatnost` and `/uslovi` using a shared reading layout, dates and in-page contents. Complete identity/contact, providers, retention, local storage/cookies, cancellation, trial and tax details from verified operator facts. Describe existing offline local storage and Auth email handling accurately. Link the pages from registration, demo, prices and footer. Draft unresolved wording locally; do not publish bracket placeholders or invented company details. Obtain operator/legal review of the final wording before commercial publication.

**Acceptance:** Both pages work anonymously, are readable at narrow widths/zoom and use consistent dated commercial wording. List any missing facts explicitly as publication blockers. Local UI implementation may continue while those facts are pending.

### UX09 — Office shell and daily work overview

**Depends on:** UX08 implementation; unresolved publication facts do not block local work.

**Implement:** Refactor `StaffShell` into reusable role-aware office/field navigation with an office desktop sidebar and compact mobile menu. Separate workspace/account/settings controls from daily work. Refresh office home and schedule presentation: today's jobs, review queue, day/week navigation and clear **Zakaži posetu** action. Reuse existing queries and permissions; preserve schedule filters and links to generated maintenance visits. Add useful first-run/empty/loading/error states without hiding operational destinations.

**Acceptance:** Owner and coordinator can reach all permitted destinations on phone/desktop; technician sees only assigned work destinations. Switching workspace refreshes both content and role navigation. Verify day/week/date filters, review links and first-site guidance. Menu visibility does not replace server/database authorization.

### UX10 — Customers, sites and equipment navigation

**Depends on:** UX09.

**Implement:** Refresh customer → site → system hierarchy with breadcrumbs, identity-first details, search and clear site-specific add/schedule actions. Present units, replacements, service history and open actions with reusable detail/list components. Keep existing import preview/apply and export workflows reachable; retain their identity mappings and permissions. Improve responsive forms without changing domain field requirements through styling.

**Acceptance:** Find a system by code, room or serial; navigate to history and schedule work at its site. Check long Serbian labels, empty records, archived items, mobile forms and validation retention. Existing import/reimport identity and exports still work; cross-organization and unassigned access remain denied.

### UX11 — Technician Today, entry and offline handover

**Depends on:** UX10. Read `FRONTEND.md` and the offline contracts before editing the shell or field forms.

**Implement:** Refresh Today rows, visit system cards, outcome forms and summary using shared primitives. Keep identity, save state, photos and next action near the active system. Distinguish local save, pending upload, synchronized, conflict and office handover with explicit Serbian labels; show actionable validation linked to the affected system/owner/deadline. Preserve IndexedDB partitioning, outbox identities, conflict recovery and the separately built/versioned offline shell. Update its assets deliberately when shared visual changes affect it.

**Acceptance:** Complete RN-2026-0142 online and with a downloaded offline visit, including one pending-outcome error and one missing-follow-up-owner error; final totals remain 4/3/2. Verify local save/reload, queued photos, reconnect/retry without duplicates, reconciliation, account switch and sign-out cleanup. Viewport/emulator checks do not close the existing physical-device camera/storage/restart gate.

### UX12 — Office review, issuing and follow-up work

**Depends on:** UX11. Read `REPORTS.md` before touching report views.

**Implement:** Improve review hierarchy, correction reasons, evidence visibility, owned/due follow-ups, PDF preview, issuance progress and share-link readiness. Apply the visual system to the existing next-actions, maintenance and receipt/billing-review screens with consistent filters and empty/error states. Reuse existing mutations and job states. Maintain the distinction between scheduled work, submitted findings, open actions, receipt and internal billing review.

**Acceptance:** Review the four-system visit, return it for correction, issue it and open the archived revision when ready. Follow both open actions to their source devices and verify receipt/billing states stay independent. Repeated issuance/retries do not create duplicates; existing immutable PDFs and amendment history remain unchanged. Do not modify the customer PDF format merely to match the public reference.

### UX13 — Customer report and receipt experience

**Depends on:** UX12.

**Implement:** Refresh the existing `/r/[token]` customer surface with company/site/date/revision context, summary, download and separate optional receipt action. Provide clear expired/revoked/unavailable and already-confirmed states. Keep it independent from staff navigation and sign-in. Preserve token scoping, private/no-store delivery, internal evidence exclusion and frozen revision content.

**Acceptance:** An anonymous recipient downloads exactly the linked revision; download alone does not record receipt. Explicit confirmation records one receipt for that revision without approving a quote. Test revoked/expired links, a later amendment, keyboard use and phone/desktop layouts. Verify internal photos/notes and other revisions remain inaccessible.

### UX14 — Local integrated acceptance and publication checklist

**Depends on:** UX01–UX13.

**Implement:** Reconcile copy, navigation, captures and shared components across the entire journey. Add public-page metadata, meaningful titles, social preview assets and indexing rules while keeping private/auth/capability pages out of indexing. Check that service-worker caching does not store private responses or interfere with public navigation. Resolve broken links and unfinished destinations. Record evidence and pending operator/device facts in this file; do not invent usability observations.

**Acceptance:** Run the relevant repository scripts (`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) and focused Playwright suites for public entry, auth/workspaces, affected app flows, guest reports and offline behavior. Add meaningful regression coverage for new routing and demo submission. Existing Playwright projects cover 390 px and 1440 px; explicitly add/check 360 px and tablet width. Inspect screenshots, keyboard/focus behavior, contrast and layout shift. Verify the production build keeps the interactive development fixture inaccessible while serving the intentional public sample. Record actual commands/results and any environment limitation, rather than treating planned checks as passed.

Ask an available owner to find pricing, open the sample and request a demo, and an invited technician to reach assigned work. Record actual friction only when those participants are available. Keep real-phone offline acceptance pending until a device is available.

### Final gate — Staging and release after feature completion

Only after UX14 and the remaining feature work, resume the existing M6 environment/release sequence in `DEVELOPMENT_GUIDE.md`. Reuse the local M6a assessment and drafts rather than creating a second deployment design. Staging may be isolated locally or on the eventual VPS, as separately agreed; do not start either as part of these UI tickets.

Before public release, verify target HTTPS, Supabase origins/redirects, monitored demo delivery, real confirmation/recovery email, private media, worker recovery, backups/restore and rollback. Exercise the complete field → office → PDF → customer receipt journey and physical-device offline/photo acceptance on the intended environment. Confirm operator identity, commercial/legal wording and all publication assets. Local completion does not stand in for these release checks.

### Ticket handoff and first implementation prompt

For every ticket report changed files/routes, checks actually run, screenshot or PDF evidence where applicable, unresolved facts and the next ticket. Update the owning domain document when a behavior contract changes. Avoid unrelated schema changes, dependency upgrades or a wholesale rewrite of existing features. Prefer Server Components, small interactive client boundaries and reusable components; consult the installed Next.js guides before implementation.

> Implement UX01 from UI_UX_LAUNCH.md. Read AGENTS.md, the installed Next.js guides and existing auth/workspace routes first. Add the public root and responsive account-aware header using UI_UX_REFERENCE.png for layout and the existing teren. brand. Preserve protected route authorization, safe return destinations, invitation/recovery callbacks and guest report links. Verify signed-out, owner and technician entry at phone and desktop widths. Keep staging deferred and report only the checks actually run.
