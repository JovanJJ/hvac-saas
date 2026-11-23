import type { CustomerReport, ReportItem } from "../../features/reports/model";

const system = (code: string, room: string): ReportItem => ({
  code, room, model: "Model za primer", serial: `PRIMER-${code}`,
  planned: true, outcome: "serviced", work: "Čišćenje filtera i provera rada.",
  finding: "Rad uređaja je proveren.", noAccessReason: "", readings: [],
  parts: [], photos: [], followUp: null,
});

// Publication source only: no database, real identities, evidence or capability URLs.
export const publicReport: CustomerReport = {
  schemaVersion: 1,
  actionStateVersion: 1,
  templateVersion: "service-report-v1",
  locale: "sr-Latn-RS",
  branding: {
    displayName: "Sever servis · primer sa izmišljenim podacima",
    logo: null,
    accentColor: "#08665f",
  },
  company: "Sever servis · izmišljeni servis",
  visitId: "00000000-0000-4000-8000-000000000142",
  reference: "RN-2026-0142",
  revision: 1,
  issuedAt: "2026-11-12T11:00:00.000Z",
  issuer: "Kancelarija · izmišljeni podaci",
  customer: "Primer trgovine · izmišljeni klijent",
  contact: "",
  site: "JA-02 · Poslovnica Jagodina",
  address: "Primer ulica 14, Jagodina · izmišljena adresa",
  start: "2026-11-12T08:00:00.000Z",
  actualStart: "2026-11-12T08:00:00.000Z",
  timeZone: "Europe/Belgrade",
  visitType: "maintenance",
  technicians: ["Serviser · izmišljeni podaci"],
  completedAt: "2026-11-12T10:30:00.000Z",
  totals: { planned: 4, inspected: 3, actions: 2 },
  items: [
    system("KL-01", "Prizemlje / ulaz"),
    system("KL-02", "Prizemlje / kasa"),
    {
      ...system("KL-03", "Sprat / kancelarija"),
      outcome: "repair_needed",
      work: "Pregled uređaja i usmerivača vazduha.",
      finding: "Oštećen usmerivač vazduha; potrebna zamena.",
      followUp: {
        kind: "quote", owner: "Kancelarija servisa", dueDate: "2026-11-16",
        customerAction: "Servis šalje ponudu za popravku.", state: "open",
      },
    },
    {
      ...system("KL-04", "Suteren / arhiva"),
      outcome: "no_access", work: "", finding: "",
      noAccessReason: "Prostorija je zaključana; pregled nije obavljen.",
      followUp: {
        kind: "revisit", owner: "Kancelarija servisa", dueDate: "2026-11-17",
        customerAction: "Klijent potvrđuje pristup i novi termin.", state: "open",
      },
    },
  ],
};
