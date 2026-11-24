// Commercial proposals only. These values do not enforce seats or start billing/trials.
export const pilotPlans = [
  {
    id: "tim",
    name: "Tim",
    price: "2.490 RSD",
    seats: "Vlasnik i još četiri korisnika",
    description: "Za kancelariju i tehničare koji dele raspored. Dodelite posete, pratite nalaze sa terena i pregledajte izveštaj pre slanja klijentu.",
    action: "Zatraži demo za tim",
  },
  {
    id: "solo",
    name: "Solo",
    price: "1.290 RSD",
    seats: "Jedan korisnik",
    description: "Za servisera koji sam zakazuje posete, vodi istoriju uređaja i šalje izveštaje svojim klijentima.",
    action: "Zatraži demo za solo servis",
  },
] as const;

export type DemoPlan = (typeof pilotPlans)[number]["id"];

export function readDemoPlan(value: unknown): DemoPlan | null {
  return pilotPlans.find(plan => plan.id === value)?.id ?? null;
}
