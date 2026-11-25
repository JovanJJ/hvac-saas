import { publicMetadata } from "@/features/public-site/metadata";
import { PublicLayout } from "@/features/public-site/public-layout";
import { LandingPage } from "@/features/public-site/landing-page";

export const metadata = publicMetadata("Servisni nalog na telefonu", "Zakazujte posete, zabeležite nalaz za svaki uređaj i pripremite PDF izveštaj za klijenta.", "/");

export default function Home() {
  return (
    <PublicLayout>
      <LandingPage />
    </PublicLayout>
  );
}
