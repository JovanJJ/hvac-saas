import Link from "next/link";
import { legalPagesAvailable } from "./availability";

export function LegalLinks() {
  if (!legalPagesAvailable) return null;
  return (
    <nav aria-label="Pravni podaci" className="mt-5 flex flex-wrap gap-4 text-sm underline">
      <Link href="/privatnost">Privatnost</Link>
      <Link href="/uslovi">Uslovi korišćenja</Link>
    </nav>
  );
}
