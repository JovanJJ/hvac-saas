import { notFound } from "next/navigation";
import VisitPreview from "@/features/visit-preview/visit-preview";

export default function PreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <VisitPreview />;
}

export const metadata = { title: "Razvojni primer" };
