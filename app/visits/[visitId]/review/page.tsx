import { VisitRoute } from "@/features/visits/route-page";
export default function Page({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  return <VisitRoute params={params} view="review" />;
}

export const metadata = { title: "Kancelarijski pregled" };
