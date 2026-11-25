import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { GuestFrame, GuestReportHeading } from "@/features/reports/guest-layout";
import { GuestLoadError } from "@/features/reports/guest-load-error";
import { GuestReceipt } from "@/features/reports/guest-receipt";
import { guestReport } from "@/features/reports/guest-dal";
import { ReportDocument } from "@/features/reports/document";
export const metadata: Metadata = {
  title: { absolute: "Servisni izveštaj — Teren" },
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  let report: Awaited<ReturnType<typeof guestReport>>;
  try { report = await guestReport(token); }
  catch { return <GuestFrame><GuestLoadError /></GuestFrame>; }
  if (!report) notFound();
  const sources = Object.fromEntries(
    report.data.items.flatMap((item) =>
      item.photos.map((photo) => [photo.id, `/r/${token}/photos/${photo.id}`]),
    ),
  );
  return (
    <GuestFrame>
      <GuestReportHeading report={report.data} token={token} confirmed={!!report.receipt} />
      <div className="guest-reading-note"><h2>Sadržaj izdate revizije</h2><p className="guest-help">Prikaz i PDF sadrže podatke sačuvane pri izdavanju. Naknadna potvrda prijema prikazana je zasebno ispod izveštaja.</p><p className="guest-help">Na užem ekranu pomerite tabelu vodoravno ili pročitajte detalje svakog sistema ispod nje.</p></div>
      <ReportDocument report={report.data} photoSources={sources} scrollableSummary />
      <GuestReceipt
        key={report.linkId}
        token={token}
        initialReceipt={report.receipt}
        reference={report.data.reference}
        revision={report.data.revision!}
        timeZone={report.data.timeZone}
      />
    </GuestFrame>
  );
}
export default function Page(props: { params: Promise<{ token: string }> }) {
  return (
    <Suspense
      fallback={
        <GuestFrame><div className="guest-message"><p role="status">Učitavanje izveštaja…</p></div></GuestFrame>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
