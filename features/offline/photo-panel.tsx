"use client";
/* eslint-disable @next/next/no-img-element -- Device blobs stay private and never use a shared image optimizer. */
import { useEffect, useId, useRef, useState } from "react";
import type { OfflineBundle, OfflineIdentity } from "./model";
import { photoPending, type LocalPhoto } from "./photo-model";
import {
  listPhotos,
  savePhoto,
  removeLocalPhoto,
  retryLocalPhoto,
} from "@/lib/offline/photo-storage";
import { markUnsaved } from "@/lib/offline/lifecycle";
import { changeEvent, getSubmission } from "@/lib/offline/storage";
export function LocalPhotoPanel({
  identity,
  bundle,
  itemId,
  code,
  editable,
}: {
  identity: OfflineIdentity;
  bundle: OfflineBundle;
  itemId: string;
  code: string;
  editable: boolean;
}) {
  const [photos, setPhotos] = useState<LocalPhoto[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [submitting, setSubmitting] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    id = useId();
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [records, submission] = await Promise.all([
          listPhotos(identity, bundle.visit.id),
          getSubmission(identity, bundle.visit.id),
        ]);
        if (mounted) {
          setPhotos(records.filter((p) => p.itemId === itemId));
          setSubmitting(!!submission);
        }
      } catch {
        if (mounted)
          setMessage(
            "Memorija fotografija nije dostupna. Nijedan novi fajl nije potvrđen kao sačuvan.",
          );
      }
    };
    void load();
    window.addEventListener(changeEvent, load);
    window.addEventListener("storage", load);
    return () => {
      mounted = false;
      window.removeEventListener(changeEvent, load);
      window.removeEventListener("storage", load);
    };
  }, [identity, bundle.visit.id, itemId]);
  useEffect(() => () => markUnsaved(id, false), [id]);
  async function capture(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget),
      file = data.get("file");
    try {
      if (!(file instanceof File)) throw new Error("Izaberite fotografiju.");
      await savePhoto(
        identity,
        bundle.visit.id,
        itemId,
        file,
        String(data.get("caption") ?? ""),
        String(data.get("visibility") ?? ""),
      );
      form.current?.reset();
      markUnsaved(id, false);
      setMessage("Fotografija je sačuvana na telefonu i čeka slanje.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message.startsWith("Izaberite ")
          ? error.message
          : "Fotografija nije sačuvana. Izabrani fajl je zadržan u obrascu; proverite memoriju, nalog i predaju pa pokušajte ponovo.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!editable && !photos.length) return null;
  return (
    <section className="card" aria-label={`Fotografije na telefonu ${code}`}>
      <h3>Fotografije · {code}</h3>
      <p>
        JPEG, PNG ili WebP do 8 MB. Fajl, opis i vidljivost čuvaju se na ovom
        telefonu pre slanja.
      </p>
      {photos
        .filter((p) => p.state !== "removed" || p.cleanupPending)
        .map((photo) => (
          <PhotoRow
            key={photo.id}
            photo={photo}
            identity={identity}
            editable={editable}
          />
        ))}
      {editable && (
        <form
          ref={form}
          onSubmit={capture}
          onChange={() => markUnsaved(id, true)}
        >
          <fieldset disabled={busy || submitting}>
            <legend>Nova fotografija</legend>
            <div className="field">
              <label htmlFor={`${id}-file`}>Izaberite fotografiju</label>
              <input
                id={`${id}-file`}
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-caption`}>Opis fotografije</label>
              <input
                id={`${id}-caption`}
                name="caption"
                maxLength={500}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-visibility`}>Vidljivost fotografije</label>
              <select
                id={`${id}-visibility`}
                name="visibility"
                required
                defaultValue=""
              >
                <option value="">Izaberite vidljivost</option>
                <option value="customer">Za klijenta</option>
                <option value="internal">Interno</option>
              </select>
            </div>
            <button type="submit">
              {busy ? "Čuvanje…" : "Sačuvaj fotografiju na telefonu"}
            </button>
          </fieldset>
          {submitting && (
            <p>Otkažite lokalnu predaju pre dodavanja fotografija.</p>
          )}
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
function PhotoRow({
  photo,
  identity,
  editable,
}: {
  photo: LocalPhoto;
  identity: OfflineIdentity;
  editable: boolean;
}) {
  const preview = useRef<HTMLImageElement>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (!photo.blob) return;
    const url = URL.createObjectURL(photo.blob);
    if (preview.current) preview.current.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [photo.blob]);
  async function change(remove: boolean) {
    if (
      remove &&
      !window.confirm(
        "Ukloniti ovu fotografiju? Ako je slanje započeto, uklanjanje mora da potvrdi server.",
      )
    )
      return;
    try {
      if (remove) await removeLocalPhoto(identity, photo.visitId, photo.id);
      else await retryLocalPhoto(identity, photo.visitId, photo.id);
      setMessage(
        remove
          ? "Uklanjanje je zabeleženo na telefonu."
          : "Fotografija je spremna za ponovni pokušaj. Pritisnite Sinhronizuj sada.",
      );
    } catch {
      setMessage(
        "Promena nije sačuvana. Fotografija je zadržana; proverite nalog i stanje predaje.",
      );
    }
  }
  return (
    <article className="line-item" aria-label={`Fotografija ${photo.caption}`}>
      {photo.blob && (
        <img ref={preview} className="photo-preview" alt={photo.caption} />
      )}
      <p>
        {photo.caption} ·{" "}
        {photo.visibility === "customer" ? "Za klijenta" : "Interno"}
      </p>
      <p>Uneo: {photo.actorLabel}</p>
      <p role="status">
        {photo.action === "remove"
          ? photo.state === "removed"
            ? "Uklanjanje je potvrđeno na serveru."
            : "Uklanjanje čeka potvrdu servera."
          : photo.state === "verified"
            ? "Fotografija je potvrđena na serveru."
            : photo.error
              ? "Fotografija nije potvrđena. Fajl je zadržan na telefonu."
              : "Sačuvano na telefonu · fotografija čeka slanje."}
      </p>
      {photo.error && (
        <p role="alert">
          {photo.error === "invalid_photo"
            ? "Server nije prihvatio format ili dimenzije fotografije. Uklonite je i dodajte ispravan fajl."
            : "Slanje nije uspelo. Proverite vezu, nalog i pristup poseti; fajl je zadržan."}
        </p>
      )}
      {photo.cleanupPending && (
        <p>
          Fotografija je uklonjena iz posete. Čišćenje skladišta čeka ponovni
          pokušaj.
        </p>
      )}
      {editable && (
        <div>
          {(photo.error || photo.cleanupPending) && (
            <button type="button" onClick={() => void change(false)}>
              Ponovi slanje fotografije
            </button>
          )}
          {photo.state !== "removed" && photo.action !== "remove" && (
            <button type="button" onClick={() => void change(true)}>
              {photoPending(photo)
                ? "Ukloni neposlatu fotografiju"
                : "Ukloni fotografiju"}
            </button>
          )}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
