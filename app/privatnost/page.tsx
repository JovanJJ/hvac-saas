import { LegalReadingLayout } from "@/features/legal/reading-layout";
import { privacySections } from "@/features/legal/privacy-content";

export const metadata = { title: "Privatnost", robots: { index: false, follow: false } };

export default function PrivacyPage() {
  return <LegalReadingLayout title="Privatnost" introduction="Kako trenutna aplikacija koristi kontakt, podatke naloga i servisne zapise." sections={privacySections} />;
}
