"use client";
import { useEffect } from "react";
import {
  currentEpoch,
  lockIdentity,
  notifyChange,
  verifyIdentity,
} from "@/public/offline/v1/storage.js";
export function OfflineSessionGuard() {
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
        form instanceof HTMLFormElement &&
        form.hasAttribute("data-offline-boundary")
      )
        void lockIdentity(
          form.getAttribute("data-offline-boundary") === "discard",
        ).catch(() => {});
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
  return null;
}
