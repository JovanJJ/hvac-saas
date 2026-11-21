import type { OfflineIdentity } from "@/features/offline/model";
export type LifecycleRequest = {
  kind: "remove" | "switch" | "leave" | "cleanup";
  identity?: OfflineIdentity;
  visitId?: string;
};
export const lifecycleEvent = "teren-device-lifecycle";
// A single host owns the modal in both the Next app and the standalone shell.
export function requestLifecycle(request: LifecycleRequest): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(
      new CustomEvent(lifecycleEvent, { detail: { request, resolve } }),
    );
  });
}
const unsaved = new Set<string>();
export function markUnsaved(key: string, value: boolean) {
  if (value) unsaved.add(key);
  else unsaved.delete(key);
}
export function hasUnsaved() {
  return unsaved.size > 0;
}
