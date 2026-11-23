import { PublicLayout } from "@/features/public-site/public-layout";
import { LandingPage } from "@/features/public-site/landing-page";

export default function Home() {
  return (
    <PublicLayout>
      <LandingPage />
    </PublicLayout>
  );
}
