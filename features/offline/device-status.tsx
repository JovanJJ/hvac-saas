"use client";
import { useEffect, useState } from "react";
import { activeIdentity, changeEvent } from "@/public/offline/v1/storage.js";
export function OfflineDeviceStatus({
  userId,
  organizationId,
}: {
  userId: string;
  organizationId: string;
}) {
  const [status, setStatus] = useState<
    "checking" | "verified" | "locked" | "failed"
  >("checking");
  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const identity = await activeIdentity();
        if (mounted)
          setStatus(
            identity?.userId === userId &&
              identity?.organizationId === organizationId
              ? "verified"
              : "locked",
          );
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
    <p role={status === "failed" ? "alert" : "status"}>
      {status === "verified"
        ? "Nalog i radni prostor su potvrđeni za ovaj telefon."
        : status === "failed"
          ? "Memorija telefona nije dostupna. Rad bez veze nije spreman."
          : "Za potvrdu naloga i radnog prostora potrebna je veza."}
    </p>
  );
}
