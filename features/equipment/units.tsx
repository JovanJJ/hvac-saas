import { randomUUID } from "node:crypto";
import { RegisterForm } from "./form";
import { IdentityFields, RegisterSection } from "./register-ui";
import type { Unit } from "./model";

export function SystemUnits({ units, systemId, version, editable }: { units: Unit[]; systemId: string; version: number; editable: boolean }) {
  return <RegisterSection id="system-units" title="Komponente sistema">
    <p>Uređivanje ispravlja podatke postojeće jedinice. Zamena arhivira staru jedinicu i dodaje novu; sistem i prethodni nalazi ostaju sačuvani.</p>
    {!units.length && <p>Još nema evidentiranih komponenti.</p>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">{units.map(unit => {
      const previous = units.find(item => item.id === unit.replaces_id);
      return <article id={`unit-${unit.id}`} className="min-w-0 scroll-mt-5 rounded-xl border border-[#dce4df] bg-white p-5" key={unit.id}>
        <h3>{unit.role === "indoor" ? "Unutrašnja jedinica" : "Spoljašnja jedinica"} · {unit.model || "Model nije unet"}</h3>
        <p>{unit.archived_at ? "Arhivirana komponenta" : "Aktivna komponenta"}</p>
        <IdentityFields items={[{ label: "Proizvođač", value: unit.manufacturer }, { label: "Serijski broj", value: unit.serial }]} />
        {previous && <p>Zamena prethodne komponente · <a className="underline" href={`#unit-${previous.id}`}>{previous.model || "Prethodna komponenta"}{previous.serial ? ` · ${previous.serial}` : ""}</a></p>}
        {editable && !unit.archived_at && <div className="mt-5 space-y-3">
          <details><summary className="cursor-pointer py-2">Uredi komponentu</summary><RegisterForm key={`unit-${unit.id}`} entity="unit" entityId={unit.id} version={unit.version} operationId={randomUUID()} initial={unit} title="Podaci komponente" /></details>
          <details><summary className="cursor-pointer py-2">Zameni komponentu</summary><RegisterForm key={`replace-${unit.id}-${unit.version}`} entity="unit" entityId={unit.id} version={unit.version} operationId={randomUUID()} action="replace" initial={{ role: unit.role }} title="Nova komponenta" /></details>
          <details><summary className="cursor-pointer py-2">Arhiviraj komponentu</summary><RegisterForm key={`remove-${unit.id}-${unit.version}`} entity="unit" entityId={unit.id} version={unit.version} operationId={randomUUID()} action="archive" title="Arhiviranje komponente" /></details>
        </div>}
      </article>;
    })}</div>
    {editable && <RegisterForm entity="unit" entityId={systemId} version={version} operationId={randomUUID()} action="create" title="Dodaj komponentu" />}
  </RegisterSection>;
}
