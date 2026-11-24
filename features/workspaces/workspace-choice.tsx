"use client";
import { useActionState } from "react";
import { switchWorkspace } from "./actions";
import { initialMutationState } from "./types";
import { Feedback } from "./forms";

export function WorkspaceChoice({ id, name, next }: { id: string; name: string; next: string }) {
  const [state, action, pending] = useActionState(switchWorkspace, initialMutationState);
  return (
    <form action={action} data-offline-boundary="switch" className="mt-4 space-y-3">
      <input type="hidden" name="organizationId" value={id} />
      <input type="hidden" name="next" value={next} />
      <button className="button primary" type="submit" disabled={pending}>
        {pending ? "Otvaranje…" : `Otvori ${name}`}
      </button>
      <Feedback state={state} />
    </form>
  );
}
