import { LegalReadingLayout } from "@/features/legal/reading-layout";
import { termsSections } from "@/features/legal/terms-content";

export const metadata = { title: "Uslovi korišćenja | teren.", robots: { index: false, follow: false } };

export default function TermsPage() {
  return <LegalReadingLayout title="Uslovi korišćenja" introduction="Predlog pravila za poslovni pilot: proba, cene, pristup i postupanje sa podacima." sections={termsSections} />;
}
