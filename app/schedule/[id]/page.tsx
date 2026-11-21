import { ScheduleDetailPage } from "@/features/scheduling/pages";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ScheduleDetailPage params={params} />;
}
