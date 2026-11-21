"use client";
import { useEffect, useRef } from "react";
import { requestLifecycle } from "@/lib/offline/lifecycle";
import { LifecycleHost } from "./lifecycle-control";
import {
  currentEpoch,
  notifyChange,
  verifyIdentity,
} from "@/lib/offline/storage";
export function OfflineSessionGuard() {
  const approved = useRef(new WeakSet<HTMLFormElement>());
  useEffect(() => {
    let previous = currentEpoch();
    let verifying = false;
    let requested = false;
    let mounted = true;
    async function verify() {
      if (!navigator.onLine || !mounted) return;
      if (verifying) {
        requested = true;
        return;
      }
      verifying = true;
      requested = false;
      try {
        await verifyIdentity();
        // Refresh an already-installed shell without reloading unsaved forms or deleting device work.
        if ("serviceWorker" in navigator) {
          const registration =
            await navigator.serviceWorker.getRegistration("/");
          await registration?.update();
        }
      } catch {
        /* Offline/read-only access survives network errors; explicit denial locks it. */
      } finally {
        verifying = false;
        if (requested && mounted) void verify();
      }
    }
    function boundary(event: Event) {
      const form = event.target;
      if (
        !(form instanceof HTMLFormElement) ||
        !form.hasAttribute("data-offline-boundary")
      )
        return;
      if (approved.current.delete(form)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const submitter = (event as SubmitEvent).submitter;
      void requestLifecycle({
        kind: form.dataset.offlineBoundary === "switch" ? "switch" : "leave",
      }).then((allowed) => {
        if (!allowed || !form.isConnected) return;
        approved.current.add(form);
        form.requestSubmit(
          submitter instanceof HTMLButtonElement ||
            submitter instanceof HTMLInputElement
            ? submitter
            : undefined,
        );
      });
    }
    const timer = setInterval(() => {
      const epoch = currentEpoch();
      if (epoch !== previous) {
        previous = epoch;
        try {
          notifyChange();
        } catch {
          /* Consumers fail closed when device storage is unavailable. */
        }
        void verify();
      }
    }, 500);
    document.addEventListener("submit", boundary, true);
    window.addEventListener("online", verify);
    window.addEventListener("focus", verify);
    window.addEventListener("pageshow", verify);
    void verify();
    return () => {
      mounted = false;
      clearInterval(timer);
      document.removeEventListener("submit", boundary, true);
      window.removeEventListener("online", verify);
      window.removeEventListener("focus", verify);
      window.removeEventListener("pageshow", verify);
    };
  }, []);
  return <LifecycleHost />;
}
