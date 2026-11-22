import Link from "next/link";
import { randomUUID } from "node:crypto";
import { importDetail } from "./dal";
import { ImportMappingForm, ImportUpload } from "./forms";
export function ImportStart() {
  return (
    <>
      <h1>Pregled uvoza opreme</h1>
      <p>
        Učitajte listu sistema za postojeće lokacije. Pregled ne menja registar.
      </p>
      <ImportUpload operationId={randomUUID()} />
      <Link href="/systems">Nazad na sisteme</Link>
    </>
  );
}
export async function ImportContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const detail = await importDetail((await params).id);
  return (
    <>
      <Link href="/imports">Novi pregled uvoza</Link>
      <h1>Mapiranje i pregled</h1>
      <p className="break-all">Fajl: {detail.filename}</p>
      <ImportMappingForm
        key={detail.id}
        detail={detail}
        operationId={randomUUID()}
      />
    </>
  );
}
