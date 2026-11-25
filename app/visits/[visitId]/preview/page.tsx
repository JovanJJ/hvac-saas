import { VisitRoute } from "@/features/visits/route-page";
export default function Page({
  params,
}: {
  params: Promise<{ visitId: string }>;
}) {
  return <VisitRoute params={params} view="preview" />;
}

export const metadata = { title: "Pregled za klijenta" };
