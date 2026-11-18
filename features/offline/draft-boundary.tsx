"use client";
import { useEffect, useState, type ReactNode } from "react";
import { activeIdentity, listDrafts, changeEvent } from "@/lib/offline/storage";
export function DraftBoundary({
  userId,
  organizationId,
  visitId,
  children,
}: {
  userId: string;
  organizationId: string;
  visitId: string;
  children: ReactNode;
}) {
  const [pending, setPending] = useState(0),
    [checking, setChecking] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const identity = await activeIdentity();
        const records =
          identity?.userId === userId &&
          identity.organizationId === organizationId
            ? await listDrafts(identity, visitId)
            : [];
        if (mounted) {
          setPending(records.length);
          setFailed(false);
          setChecking(false);
        }
      } catch {
        if (mounted) {
          setFailed(true);
          setChecking(false);
        }
      }
    }
    void check();
    window.addEventListener(changeEvent, check);
    window.addEventListener("storage", check);
    return () => {
      mounted = false;
      window.removeEventListener(changeEvent, check);
      window.removeEventListener("storage", check);
    };
  }, [userId, organizationId, visitId]);
  return (
    <>
      {pending > 0 && (
        <section className="card my-5">
          <p role="status">
            Na telefonu postoje neposlate izmene za {pending} sistema. Unos na
            serveru je zaustavljen da se ne preskoče nacrti.
          </p>
          <a
            className="button primary"
            href={`/offline/v2/index.html?visit=${visitId}`}
          >
            Nastavi nacrte na telefonu
          </a>
        </section>
      )}
      {failed && (
        <p role="alert">
          Lokalnu memoriju nije moguće proveriti. Ovaj unos se čuva samo na
          serveru uz vezu.
        </p>
      )}
      {checking ? (
        <p role="status">Provera lokalnih nacrta…</p>
      ) : (
        <fieldset disabled={pending > 0}>
          <legend>Unos uz vezu</legend>
          {children}
        </fieldset>
      )}
    </>
  );
}
