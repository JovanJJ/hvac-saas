import { PublicSectionHeading } from "./components";

const questions = [
  {
    id: "solo",
    question: "Da li aplikaciju mogu da koristim ako radim sam?",
    answer: "Da. Sami zakazujete posetu, unosite nalaz i izdajete izveštaj. Solo je predlog plana za jedno korisničko mesto.",
  },
  {
    id: "poziv",
    question: "Kako se tehničar pridružuje firmi?",
    answer: "Vlasnik napravi poziv u aplikaciji i pošalje vam link. Prijavite se ili napravite nalog istom imejl adresom na koju glasi poziv. Kada ga prihvatite, dodeljene posete vidite na ekranu „Danas“.",
  },
  {
    id: "izvestaj",
    question: "Da li klijent mora da pravi nalog za izveštaj?",
    answer: "Ne. Klijent otvara link koji mu pošaljete i može da preuzme taj izveštaj. Ako potvrdi prijem, potvrda se odnosi na tu verziju izveštaja. Potvrda prijema ne odobrava dodatne radove.",
  },
  {
    id: "proba",
    question: "Kako izgleda probno korišćenje?",
    answer: "Za pilot je predložena proba od 30 dana bez kartice. Trajanje, početak probe i uslove nastavka potvrđujemo pre uključenja u pilot. Samo pravljenje naloga ne pokreće pretplatu ni automatsku naplatu.",
  },
];

export function FaqSection() {
  return (
    <section className="public-section public-faq" aria-labelledby="pitanja">
      <PublicSectionHeading id="pitanja">Pitanja servisera</PublicSectionHeading>
      <div className="public-faq-items">
        {questions.map((item, index) => (
          <details key={item.id} id={`public-question-${item.id}`} open={index === 0}>
            <summary>
              <span>{item.question}</span>
              <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" fill="none">
                <path d="M5 12h14" stroke="currentColor" strokeWidth="2" />
                <path className="public-faq-vertical" d="M12 5v14" stroke="currentColor" strokeWidth="2" />
              </svg>
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
