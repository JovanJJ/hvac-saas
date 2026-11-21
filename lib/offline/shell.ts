import expected from "@/public/offline/shell-version.json";
export async function shellReady(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active) return false;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(false);
    }, 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(
        event.data?.version === expected.version &&
          event.data?.revision === expected.revision &&
          event.data?.ready === true,
      );
    };
    registration.active!.postMessage({ type: "SHELL_STATUS" }, [channel.port2]);
  });
}
export async function installShell() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    throw new Error("offline_unsupported");
  const registration = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  if (registration.active && (registration.waiting || registration.installing))
    throw new Error("shell_update_pending");
  const worker =
    registration.installing || registration.waiting || registration.active;
  if (!worker) throw new Error("shell_unavailable");
  if (worker.state !== "activated")
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        if (worker.state !== "activated" && worker.state !== "redundant")
          return;
        clearTimeout(timer);
        worker.removeEventListener("statechange", finish);
        if (worker.state === "activated") resolve();
        else reject(new Error("shell_unavailable"));
      };
      const timer = setTimeout(() => {
        worker.removeEventListener("statechange", finish);
        reject(new Error("shell_unavailable"));
      }, 15000);
      worker.addEventListener("statechange", finish);
      finish();
    });
  if (!(await shellReady())) throw new Error("shell_unavailable");
}
