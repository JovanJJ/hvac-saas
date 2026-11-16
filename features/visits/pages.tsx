import Link from "next/link";
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
import { actionLabels, outcomeLabels, submissionIssues, totals } from "./model";

export async function VisitWorkspace({
  id,
  office = false,
}: {
  id: string;
  office?: boolean;
}) {
  const { visit, context } = await visitBundle(id, office);
  const photos = await attachments(context.workspace.organization.id, id);
  const editable =
    visit.status === "scheduled" || visit.status === "in_progress";
  const issues = submissionIssues(visit.items);
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
      <p>
        Stanje:{" "}
        {visit.status === "issued"
          ? "Izdat izveštaj"
          : visit.status === "submitted"
            ? "Predato kancelariji"
            : visit.status === "in_progress"
              ? "U toku"
              : "Zakazano"}
      </p>
      {!office && visit.accessNote && (
        <p className="card">Pristup: {visit.accessNote}</p>
      )}
      {visit.correctionReason && (
        <p role="status" className="card">
          Zatražena dopuna: {visit.correctionReason}
        </p>
      )}
      <Totals counts={totals(visit.items)} />
      {!office && editable ? (
        <>
          <p>Sačuvajte svaki sistem pre predaje. Rad zahteva internet vezu.</p>
          {visit.items.map((item) => (
            <div key={item.id}>
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
          <section className="card my-5">
            <h2>Pregled pre predaje</h2>
            {visit.items.map((i) => (
              <p key={i.id}>
                {i.code}: {outcomeLabels[i.outcome]}
              </p>
            ))}
            {issues.length ? (
              <ul aria-label="Potrebne dopune">
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              <p>Svi ishodi su uneti. Poseta je spremna za predaju.</p>
            )}
          </section>
          <TransitionForm
            key={`submit:${visit.version}`}
            visit={visit}
            kind="submit"
            operationId={randomUUID()}
          />
        </>
      ) : (
        <>
          {visit.items.map((item) => (
            <div key={item.id}>
              <Result item={item} />
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
                    ?.label ?? "Nedostaje"}{" "}
                  · Rok: {item.followUp.dueDate || "Nedostaje"} ·{" "}
                  {item.followUp.customerAction}
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
          {office && visit.status === "submitted" && (
            <TransitionForm
              key={`return:${visit.version}`}
              visit={visit}
              kind="return"
              operationId={randomUUID()}
            />
          )}
          {office && editable && (
            <Link href={`/visits/${id}`}>Otvori unos</Link>
          )}
        </>
      )}
      {office && visit.status === "submitted" && (
        <IssueForm
          key={`issue:${visit.version}`}
          visitId={id}
          version={visit.version}
          operationId={randomUUID()}
        />
      )}
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
  const visits = await reviewQueue();
  return (
    <section className="card my-6">
      <h2>Čeka pregled · {visits.length}</h2>
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
