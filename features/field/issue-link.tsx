"use client";
import type { ReactNode } from "react";

export function FieldIssueLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} onClick={event => {
    const id = href.slice(1);
    const main = event.currentTarget.closest("main");
    const target = main ? main.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : document.getElementById(id);
    if (!target) return;
    event.preventDefault();
    let ancestor = target.parentElement;
    while (ancestor) {
      if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
      ancestor = ancestor.parentElement;
    }
    // Frozen payloads require an explicit edit choice; never unlock or rewrite them from a link.
    const edit = target.closest('section[aria-label^="Unos "]')?.querySelector<HTMLButtonElement>("button[data-edit-draft]");
    if (target.matches(":disabled") && edit && !edit.disabled) {
      event.preventDefault(); edit.scrollIntoView({ block: "center" }); edit.focus(); return;
    }
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
  }}>{children}</a>;
}
