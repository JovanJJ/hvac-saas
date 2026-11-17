import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { GuestReceipt } from "@/features/reports/guest-receipt";
import { guestReport } from "@/features/reports/guest-dal";
import { ReportDocument } from "@/features/reports/document";
export const metadata: Metadata = {
  title: "Servisni izveštaj — Teren",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
async function Content({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const report = await guestReport(token);
  if (!report) notFound();
  const sources = Object.fromEntries(
    report.data.items.flatMap((item) =>
      item.photos.map((photo) => [photo.id, `/r/${token}/photos/${photo.id}`]),
    ),
  );
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-8">
      <div className="preview-note">
        <h1>Servisni izveštaj</h1>
        <p>
          {report.data.reference} · Revizija {report.data.revision}
        </p>
        <a className="button primary my-4" href={`/r/${token}/pdf`}>
          Preuzmi PDF
        </a>
        <p>
          Otvaranje i preuzimanje izveštaja ne potvrđuju prijem i ne odobravaju
          dodatne radove.
        </p>
      </div>
      <ReportDocument report={report.data} photoSources={sources} />
      <GuestReceipt
        key={report.linkId}
        token={token}
        initialReceipt={report.receipt}
        reference={report.data.reference}
        revision={report.data.revision!}
        timeZone={report.data.timeZone}
      />
    </main>
  );
}
export default function Page(props: { params: Promise<{ token: string }> }) {
  return (
    <Suspense
      fallback={
        <main className="p-6">
          <p role="status">Učitavanje izveštaja…</p>
        </main>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
