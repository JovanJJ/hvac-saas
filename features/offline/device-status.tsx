"use client";
import { RetainedWorkPanel } from "./retained-work";
import type { OfflineIdentity } from "./model";
import { SyncControl } from "./sync-control";
import { useEffect, useState } from "react";
import { activeIdentity, changeEvent } from "@/lib/offline/storage";
export function OfflineDeviceStatus({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [scope, setScope] = useState<OfflineIdentity | null>(null);
  const [status, setStatus] = useState<
    "checking" | "verified" | "locked" | "failed"
  >("checking");
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const identity = await activeIdentity();
        if (mounted) {
          setScope(identity);
          setStatus(
            identity?.userId === userId &&
              identity?.organizationId === organizationId
              ? "verified"
              : "locked",
          );
        }
      } catch {
        if (mounted) setStatus("failed");
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
  }, [userId, organizationId]);
  return (
    <>
      <p role={status === "failed" ? "alert" : "status"}>
        {status === "verified"
          ? "Nalog i radni prostor su potvrđeni za ovaj telefon."
          : status === "failed"
            ? "Memorija telefona nije dostupna. Rad bez veze nije spreman."
            : "Za potvrdu naloga i radnog prostora potrebna je veza."}
      </p>
      {status === "verified" && <SyncControl />}
      {status === "verified" && scope && <RetainedWorkPanel identity={scope} />}
    </>
  );
}
