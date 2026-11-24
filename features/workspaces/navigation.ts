import type { StaffRole } from "@/lib/supabase/database.types";

export type StaffNavigationLink = { href: string; label: string };
export function staffNavigation(role: StaffRole): { label: string; links: StaffNavigationLink[] }[] {
  if (role === "technician") return [{ label: "Rad na terenu", links: [{ href: "/today", label: "Danas" }] }];
  return [
    { label: "Svakodnevni rad", links: [
      { href: "/office", label: "Kancelarija" },
      { href: "/schedule", label: "Raspored" },
      { href: "/office/actions", label: "Sledeće radnje" },
      { href: "/office/handover", label: "Potvrde i naplata" },
      { href: "/maintenance", label: "Planovi održavanja" },
    ] },
    { label: "Registar", links: [
      { href: "/customers", label: "Klijenti" },
      { href: "/sites", label: "Lokacije" },
      { href: "/systems", label: "Sistemi" },
      { href: "/imports", label: "Uvoz opreme" },
    ] },
    { label: "Rad na terenu", links: [{ href: "/today", label: "Danas" }] },
  ];
}

export function activeStaffLink(path: string, groups: ReturnType<typeof staffNavigation>) {
  return groups.flatMap(group => group.links)
    .filter(link => path === link.href || path.startsWith(`${link.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}
