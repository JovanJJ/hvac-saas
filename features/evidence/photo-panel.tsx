"use client";
/* eslint-disable @next/next/no-img-element -- Private images must bypass shared image optimization and reauthorize each request. */
import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_PHOTO_BYTES,
  photoTypes,
  photoUrl,
  type Attachment,
} from "./model";

async function command(kind: string, data: unknown) {
  const response = await fetch(`/api/field/attachments/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message ?? "Promena nije potvrđena.");
  return result as { id: string; state: string; cleanupPending?: boolean };
}
export function PhotoPanel({
  visitId,
  itemId,
  code,
  photos,
  editable,
}: {
  visitId: string;
  itemId: string;
  code: string;
  photos: Attachment[];
  editable: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [reservation, setReservation] = useState<{
    attachmentId: string;
    caption: string;
    visibility: string;
    file: File;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(form: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const file = reservation?.file ?? form.get("file");
      if (
        !(file instanceof File) ||
        !file.size ||
        file.size > MAX_PHOTO_BYTES ||
        !photoTypes.includes(file.type as (typeof photoTypes)[number])
      )
        throw new Error("Izaberite JPEG, PNG ili WebP fotografiju do 8 MB.");
      const current = reservation ?? {
        attachmentId: crypto.randomUUID(),
        caption: String(form.get("caption") ?? "").trim(),
        visibility: String(form.get("visibility") ?? ""),
        file,
      };
      if (!current.caption || !current.visibility)
        throw new Error("Unesite opis i izaberite vidljivost.");
      setReservation(current);
      const identity = { visitId, attachmentId: current.attachmentId };
      const prepared = await command("prepare", {
        ...identity,
        itemId,
        caption: current.caption,
        visibility: current.visibility,
        bytes: file.size,
        mimeType: file.type,
      });
      if (prepared.state !== "verified") {
        const upload = new FormData();
        upload.set("visitId", visitId);
        upload.set("attachmentId", current.attachmentId);
        upload.set("file", file);
        const response = await fetch("/api/field/attachments/upload", {
          method: "POST",
          body: upload,
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message);
        }
        await command("complete", identity);
      }
      setReservation(null);
      if (fileInput.current) fileInput.current.value = "";
      setMessage("Fotografija je sačuvana i potvrđena.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Slanje nije potvrđeno. Pokušajte ponovo.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function finish(attachmentId: string, kind: "complete" | "remove") {
    setBusy(true);
    setMessage("");
    try {
      const result = await command(kind, { visitId, attachmentId });
      setMessage(
        result.cleanupPending
          ? "Fotografija je uklonjena iz posete. Privatni fajl još čeka čišćenje; možete ponoviti uklanjanje."
          : kind === "remove"
            ? "Fotografija je uklonjena."
            : "Fotografija je potvrđena.",
      );
      if (reservation?.attachmentId === attachmentId) setReservation(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pokušajte ponovo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card my-4" aria-label={`Fotografije ${code}`}>
      <h3>Fotografije · {code}</h3>
      {!photos.length && <p>Nema fotografija.</p>}
      {photos.map((photo) => (
        <figure key={photo.id} className="my-5 rounded border p-3">
          {photo.state === "verified" && (
            <img
              src={photoUrl(visitId, photo.id)}
              alt={photo.caption}
              loading="lazy"
              width={photo.width ?? 640}
              height={photo.height ?? 480}
              className="block h-auto max-h-72 w-full object-contain"
            />
          )}
          <figcaption>
            {photo.caption} ·{" "}
            {photo.visibility === "customer" ? "Za klijenta" : "Interno"} ·{" "}
            {photo.state === "verified"
              ? "Potvrđena"
              : photo.state === "removed"
                ? "Uklonjena"
                : "Čeka potvrdu slanja"}
          </figcaption>
          {editable && (
            <div className="mt-3 flex flex-wrap gap-3">
              {photo.state === "reserved" && (
                <button
                  type="button"
                  disabled={busy}
                  className="button secondary"
                  onClick={() => finish(photo.id, "complete")}
                >
                  Proveri poslatu fotografiju
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                className="button secondary"
                onClick={() => finish(photo.id, "remove")}
              >
                {photo.state === "removed"
                  ? "Ponovi čišćenje fajla"
                  : "Ukloni fotografiju"}
              </button>
            </div>
          )}
        </figure>
      ))}
      {editable && (
        <form
          action={save}
          onReset={(event) => event.preventDefault()}
          className="mt-5 space-y-3"
        >
          <p>
            JPEG, PNG ili WebP do 8 MB. Fotografiju slati uz internet vezu.
            Posle greške pokušajte ponovo u ovoj stranici; pre zatvaranja
            proverite da li je slanje potvrđeno.
          </p>
          <label htmlFor={`${id}-file`}>Izaberite fotografiju</label>
          <input
            ref={fileInput}
            id={`${id}-file`}
            name="file"
            type="file"
            accept={photoTypes.join(",")}
            disabled={busy || !!reservation}
          />
          <label htmlFor={`${id}-caption`}>Opis fotografije</label>
          <input
            id={`${id}-caption`}
            name="caption"
            maxLength={500}
            disabled={busy || !!reservation}
          />
          <label htmlFor={`${id}-visibility`}>Vidljivost fotografije</label>
          <select
            id={`${id}-visibility`}
            name="visibility"
            defaultValue=""
            disabled={busy || !!reservation}
          >
            <option value="">Izaberite vidljivost</option>
            <option value="customer">Za klijenta</option>
            <option value="internal">Interno</option>
          </select>
          <button type="submit" className="button primary" disabled={busy}>
            {busy
              ? "Slanje…"
              : reservation
                ? "Ponovi slanje"
                : "Dodaj fotografiju"}
          </button>
          {reservation && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => finish(reservation.attachmentId, "remove")}
            >
              Odustani od slanja
            </button>
          )}
        </form>
      )}
      {message && (
        <p role="status" className="mt-4 font-semibold">
          {message}
        </p>
      )}
    </section>
  );
}
