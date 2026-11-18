"use client";
import { useEffect, useRef, useState } from "react";
import { syncDevice } from "@/lib/offline/sync";
export function SyncControl({ automatic = true }: { automatic?: boolean }) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const mounted = useRef(true);
  const retryTimer = useRef<number | undefined>(undefined);
  async function sync() {
    clearTimeout(retryTimer.current);
    setBusy(true);
    try {
      const result = await syncDevice();
      if (mounted.current) setMessage(result);
    } catch (error) {
      if (mounted.current)
        setMessage(
          error instanceof Error
            ? error.message
            : "Slanje nije potvrđeno; nacrti su zadržani.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (!automatic)
      return () => {
        mounted.current = false;
      };
    let retries = 0;
    const reconnect = () => {
      if (navigator.onLine) {
        retries = 0;
        void attempt();
      }
    };
    async function attempt() {
      if (!mounted.current || !navigator.onLine) return;
      setBusy(true);
      try {
        const result = await syncDevice();
        if (mounted.current) setMessage(result);
      } catch (error) {
        if (mounted.current)
          setMessage(
            error instanceof Error ? error.message : "Slanje nije potvrđeno.",
          );
        if (retries < 3)
          retryTimer.current = window.setTimeout(
            attempt,
            [5000, 15000, 30000][retries++],
          );
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
    window.addEventListener("online", reconnect);
    void attempt();
    return () => {
      mounted.current = false;
      clearTimeout(retryTimer.current);
      window.removeEventListener("online", reconnect);
    };
  }, [automatic]);
  return (
    <section aria-label="Sinhronizacija" className="card">
      <p>
        Spremni nacrti se šalju kada se veza obnovi dok je aplikacija otvorena.
        Predaja čeka potvrdu servera.
      </p>
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() => void sync()}
      >
        {busy ? "Slanje…" : "Sinhronizuj sada"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
