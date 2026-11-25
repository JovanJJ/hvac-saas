import { OfficeSection, OfficeFacts, OfficeNavigation } from "@/components/ui/office-work";
import { FieldSummary } from "@/features/field/presentation";
import { requireWorkspace } from "@/features/workspaces/dal";
import { OverviewError } from "@/features/office/overview-state";
import { DraftBoundary } from "@/features/offline/draft-boundary";
import Link from "next/link";
import { returnSource } from "@/features/follow-ups/dal";
import { randomUUID } from "node:crypto";
import { visitBundle, reviewQueue } from "./dal";
import { ItemForm, TransitionForm } from "./forms";
import { attachments } from "@/features/evidence/dal";
import { PhotoPanel } from "@/features/evidence/photo-panel";
import {
  ReportDocument,
  ReportTotals as Totals,
  SystemResult as Result,
} from "@/features/reports/document";
import { reportPreview } from "@/features/reports/dal";
import { IssueForm } from "@/features/reports/issue-form";
import { RevisionLink } from "@/features/reports/pages";
import {
  visitStatusLabels,
  actionLabels,
  totals,
} from "./model";

export async function VisitWorkspace({
  id,
  office = false,
}: {
  id: string;
  office?: boolean;
}) {
  const { visit, context } = await visitBundle(id, office);
  const source = await returnSource(context.workspace.organization.id, id);
  const photos = await attachments(context.workspace.organization.id, id);
  const editable =
    visit.status === "scheduled" || visit.status === "in_progress";
  const issues: string[] = [];
  const pendingPhotos = photos.filter(
    (photo) => photo.state === "reserved",
  ).length;
  if (pendingPhotos)
    issues.push(
      `Potvrdite ili uklonite fotografije koje čekaju slanje: ${pendingPhotos}.`,
    );
  return (
    <>
      <h1>
        {office ? "Kancelarijski pregled" : "Servisna poseta"} · {visit.site}
      </h1>
      <p>
        {visit.customer} · {visit.address}
      </p>
      <p>
        {new Date(visit.start).toLocaleString("sr-Latn-RS", {
          timeZone: visit.timeZone,
        })}{" "}
        · {visit.contact}
      </p>
      <p>Stanje: {visitStatusLabels[visit.status]}</p>
      {visit.planId && (
        <p>
          {context.workspace.role !== "technician" ? (
            <Link href={`/maintenance/${visit.planId}`}>
              Plan održavanja: {visit.planName}
            </Link>
          ) : (
            <>Planirano održavanje · {visit.intendedDate}</>
          )}
        </p>
      )}
      {visit.status === "cancelled" && (
        <p className="card">Razlog otkazivanja: {visit.cancellationReason}</p>
      )}
      {context.workspace.role !== "technician" && (
        <Link className="button secondary my-3" href={`/schedule/${id}`}>
          Raspored i dodela posete
        </Link>
      )}
      {!office && visit.accessNote && (
        <p className="card">Pristup: {visit.accessNote}</p>
      )}
      {visit.correctionReason && (
        <p role="status" className="card">
          Zatražena dopuna: {visit.correctionReason}
        </p>
      )}
      {source && (
        <section className="card my-5">
          <h2>Izvorni nalaz za povratnu posetu · {source.code}</h2>
          <p>{source.finding || source.noAccessReason || source.work}</p>
          {source.customerAction && (
            <p>Potrebno od klijenta: {source.customerAction}</p>
          )}
          {context.workspace.role !== "technician" && (
            <Link
              href={`/visits/${source.visitId}/review#system-${source.itemId}`}
            >
              Otvori izvorni sistem
            </Link>
          )}
        </section>
      )}
      {office && <>
        <OfficeNavigation items={[
          { label: "Nalazi i fotografije", href: "#review-findings" },
          { label: "Odluka kancelarije", href: "#review-decision" },
          { label: "Sadržaj za klijenta", href: `/visits/${id}/preview` },
        ]} />
        <div className="office-state"><strong>{visit.status === "submitted" ? "Poseta čeka odluku kancelarije." : visit.status === "issued" ? "Izveštaj je izdat; dalje radnje pratite zasebno." : "Terenski unos još nije predat za izdavanje."}</strong><p>Proverite ishode, fotografije i odgovorne članove sa rokovima. Dopuna vraća unos tehničaru; izdavanje zaključava reviziju.</p></div>
      </>}
      <Totals counts={totals(visit.items)} />
      {office && <OfficeSection id="review-findings" title="Nalazi i fotografije" description="Fotografije su uz pripadajući sistem. Interne beleške i interne fotografije služe kancelariji; ne ulaze u izveštaj za klijenta.">
        <nav aria-label="Sistemi za proveru" className="field-system-links">{visit.items.map(item => <a key={item.id} href={`#system-${item.id}`}>{item.code} · {item.room}</a>)}</nav>
        <OfficeFacts items={[
          { label: "Fotografije za klijenta · potvrđene", value: photos.filter(p => p.state === "verified" && p.visibility === "customer").length },
          { label: "Fotografije koje čekaju slanje", value: pendingPhotos },
          { label: "Otvorene radnje", value: totals(visit.items).actions },
        ]} />
        {!!issues.length && <p role="alert">{issues.join(" ")}</p>}
      </OfficeSection>}
      {!office && editable ? (
        <DraftBoundary
          userId={context.user.id}
          organizationId={context.workspace.organization.id}
          visitId={id}
        >
          <p className="field-state">Sačuvajte svaki sistem pre predaje. Ovaj obrazac zahteva internet vezu. Za rad bez interneta najpre preuzmite posetu na ekranu Danas.</p>
          <nav aria-label="Prečice unosa" className="field-system-links"><a href={`#visit-${id}-summary`}>Pregled pre predaje</a>{visit.items.map(item => <a key={item.id} href={`#system-${item.id}`}>{item.code} · {item.room}</a>)}</nav>
          {visit.items.map((item) => (
            <div key={item.id} id={`system-${item.id}`} tabIndex={-1} className="field-system">
              {item.systemId && (
                <Link
                  className="button secondary mb-3"
                  href={`/systems/${item.systemId}`}
                >
                  Istorija sistema · {item.code}
                </Link>
              )}
              <ItemForm
                key={`${item.id}:${item.version}`}
                item={item}
                visit={visit}
                operationId={randomUUID()}
              />
              <PhotoPanel
                visitId={id}
                itemId={item.id}
                code={item.code}
                photos={photos.filter((photo) => photo.item_id === item.id)}
                editable
              />
            </div>
          ))}
          {!!visit.availableSystems.length && (
            <TransitionForm
              key={`add:${visit.version}`}
              visit={visit}
              kind="add"
              operationId={randomUUID()}
            />
          )}
          <div id={`visit-${id}-summary`} tabIndex={-1}><FieldSummary items={visit.items} showTotals={false} /></div>
          {!!issues.length && <p role="alert">{issues.join(" ")}</p>}
          <TransitionForm
            key={`submit:${visit.version}`}
            visit={visit}
            kind="submit"
            operationId={randomUUID()}
          />
        </DraftBoundary>
      ) : (
        <>
          {visit.items.map((item) => (
            <div key={item.id} id={`system-${item.id}`} tabIndex={-1} className={office ? "office-system" : undefined}>
              <Result item={item} />
              {item.correctedAt && (
                <p className="my-3">
                  Ispravljeno u kancelariji:{" "}
                  {new Date(item.correctedAt).toLocaleString("sr-Latn-RS", {
                    timeZone: visit.timeZone,
                  })}{" "}
                  · {item.correctedByLabel || "Raniji član tima"}
                </p>
              )}
              <PhotoPanel
                visitId={id}
                itemId={item.id}
                code={item.code}
                photos={photos.filter((photo) => photo.item_id === item.id)}
                editable={office && editable}
              />
              {item.followUp && (
                <p className="card">
                  {actionLabels[item.followUp.kind]} · Odgovoran:{" "}
                  {visit.staff.find((s) => s.id === item.followUp?.ownerId)
                    ?.label ??
                    item.followUp.ownerLabel ??
                    "Nedostaje"}{" "}
                  · Rok: {item.followUp.dueDate || "Nedostaje"} ·{" "}
                  {item.followUp.customerAction} ·{" "}
                  {item.followUp.state === "completed"
                    ? "Završeno"
                    : "Otvoreno"}
                  {office && item.followUp.id && (
                    <Link
                      className="button secondary"
                      href={`/office/actions/${item.followUp.id}`}
                    >
                      Otvori radnju
                    </Link>
                  )}
                </p>
              )}
              {office && item.internalNote && (
                <p>Interna beleška: {item.internalNote}</p>
              )}
            </div>
          ))}
          {visit.submittedAt && (
            <p>
              Predato:{" "}
              {new Date(visit.submittedAt).toLocaleString("sr-Latn-RS", {
                timeZone: visit.timeZone,
              })}
            </p>
          )}
          {context.workspace.role !== "technician" && (
            <Link
              className="button secondary my-5"
              href={`/visits/${id}/preview`}
            >
              Pregled za klijenta
            </Link>
          )}
          {office && editable && (
            <Link href={`/visits/${id}`}>Otvori unos</Link>
          )}
        </>
      )}
      {office && <OfficeSection id="review-decision" title="Odluka kancelarije" description={visit.status === "submitted" ? "Za dopunu navedite sistem i šta tehničar treba da proveri. Pre izdavanja otvorite pregled sadržaja za klijenta." : "Izdavanje je dostupno tek nakon predaje tehničara. Izdate revizije ostaju zaključane."}>
        {visit.status === "submitted" && <>
          <Link className="button secondary" href={`/visits/${id}/preview`}>Proveri sadržaj izveštaja</Link>
          <div id="review-return"><TransitionForm key={`return:${visit.version}`} visit={visit} kind="return" operationId={randomUUID()} /></div>
          <IssueForm key={`issue:${visit.version}`} visitId={id} version={visit.version} operationId={randomUUID()} />
        </>}
      </OfficeSection>}
      {context.workspace.role !== "technician" && visit.status === "issued" && (
        <RevisionLink visitId={id} />
      )}
      {!office && context.workspace.role !== "technician" && (
        <Link href={`/visits/${id}/review`} className="button secondary">
          Otvori kancelarijski pregled
        </Link>
      )}
    </>
  );
}
export async function ReviewQueue() {
  await requireWorkspace(["owner", "coordinator"]);
  let visits: Awaited<ReturnType<typeof reviewQueue>>;
  try { visits = await reviewQueue(); }
  catch { return <OverviewError label="Nalozi za pregled" />; }
  return (
    <section className="card my-6" aria-labelledby="review-queue-heading">
      <h2 id="review-queue-heading">Čeka pregled · {visits.length}</h2>
      {!visits.length && <p>Nema poseta za pregled.</p>}
      {visits.map((v) => (
        <p key={v.id}>
          <Link href={`/visits/${v.id}/review`}>{v.site} · Otvori pregled</Link>
        </p>
      ))}
    </section>
  );
}
export async function CustomerPreview({ id }: { id: string }) {
  const preview = await reportPreview(id);
  return (
    <>
      <div className="preview-note">
        <h1>{preview.revisionId ? "Izdat izveštaj" : "Pregled za klijenta"}</h1>
        <p>
          {preview.revisionId
            ? "Prikazana je zaključana revizija izveštaja."
            : "Nacrt · nije izdat izveštaj."}
        </p>
        <Link href={`/visits/${id}/review`}>Nazad na pregled</Link>
        {preview.revisionId && (
          <Link
            href={`/office/reports/${preview.revisionId}`}
            className="button secondary"
          >
            Otvori reviziju
          </Link>
        )}
      </div>
      <ReportDocument report={preview.data} />
    </>
  );
}
