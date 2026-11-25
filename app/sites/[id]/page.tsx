import { RegisterDetailPage } from "@/features/equipment/page";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <RegisterDetailPage kind="site" params={params} />;
}

export const metadata = { title: "Podaci lokacije" };
