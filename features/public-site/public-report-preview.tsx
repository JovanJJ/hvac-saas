import { getImageProps } from "next/image";
import sample from "@/public/primeri/servisni-izvestaj.json";
import { ReportPanel } from "./components";

export function SampleReportLink() {
  // A document is a native navigation, not an App Router/prefetch destination.
  return (
    <a href={sample.pdf.src} className="public-button public-button-secondary">
      Otvori primer PDF-a
    </a>
  );
}

export function PublicReportPreview() {
  const { desktop, mobile } = sample.previews;
  const { props } = getImageProps({
    src: desktop.src,
    width: desktop.width,
    height: desktop.height,
    alt: "Primer servisnog izveštaja sa četiri planirana i tri pregledana sistema i dve otvorene stavke.",
    // The checked-in WebP crops are already sized for this bounded panel.
    unoptimized: true,
    loading: "eager",
  });
  return (
    <ReportPanel caption={
      <>
        <span>Primer naloga iz Jagodine · izmišljeni podaci</span>
        <span className="public-report-summary">
          {sample.totals.planned} planirana sistema · {sample.totals.inspected} pregledana · {sample.totals.actions} otvorene stavke
        </span>
      </>
    }>
      <picture>
        <source
          media="(max-width: 899px)"
          srcSet={mobile.src}
          width={mobile.width}
          height={mobile.height}
        />
        <img {...props} alt={props.alt} />
      </picture>
    </ReportPanel>
  );
}
