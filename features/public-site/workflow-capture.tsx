import { getImageProps } from "next/image";
import captures from "@/public/primeri/workflow.json";

export type WorkflowStage = "schedule" | "field" | "office";
const labels = {
  schedule: "zakazane posete",
  field: "unosa nalaza za KL-03",
  office: "pregleda rezultata u kancelariji",
};

export function WorkflowCapture({ stage }: { stage: WorkflowStage }) {
  const desktop = stage === "field" ? captures.assets.field : captures.assets[`${stage}-desktop`];
  const mobile = stage === "field" ? captures.assets.field : captures.assets[`${stage}-mobile`];
  const { props } = getImageProps({ src: desktop.src, width: desktop.width, height: desktop.height, alt: "", unoptimized: true, loading: "lazy" });
  return (
    <a className="public-capture-link" href={desktop.src} aria-label={`Uvećaj snimak ${labels[stage]}`}>
      <span className="public-capture-frame">
        <picture>
          <source media="(max-width: 899px)" srcSet={mobile.src} width={mobile.width} height={mobile.height} />
          <img {...props} alt="" />
        </picture>
      </span>
      <span className="public-capture-hint">Uvećaj snimak</span>
    </a>
  );
}
