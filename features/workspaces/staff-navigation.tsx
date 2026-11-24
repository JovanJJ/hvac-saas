"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import type { StaffRole } from "@/lib/supabase/database.types";
import { activeStaffLink, staffNavigation } from "./navigation";

export function StaffNavigation({ role }: { role: StaffRole }) {
  const path = usePathname();
  const groups = staffNavigation(role);
  const active = activeStaffLink(path, groups);
  const menu = useRef<HTMLDetailsElement>(null);
  const toggle = useRef<HTMLElement>(null);
  function close() { if (menu.current) menu.current.open = false; }
  const links = (
    <nav aria-label="Navigacija tima" className="space-y-6">
      {role !== "technician" && <Link href="/visits/new" className="button primary w-full justify-center" aria-current={path === "/visits/new" ? "page" : undefined} onClick={close}>Zakaži posetu</Link>}
      {groups.map(group => (
        <div key={group.label}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[#60716c]">{group.label}</p>
          <ul className="m-0 list-none space-y-1 p-0">
            {group.links.map(link => (
              <li key={link.href}><Link href={link.href} onClick={close} aria-current={active === link.href ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-sm no-underline ${active === link.href ? "bg-[#e6f0eb] font-bold text-[#08665f]" : "hover:bg-[#f4f6f3]"}`}>
                {link.label}
              </Link></li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <>
      <div className="hidden rounded-xl border border-[#dce4df] bg-white p-4 lg:block">{links}</div>
      <details ref={menu} className="rounded-xl border border-[#dce4df] bg-white p-4 lg:hidden" onKeyDown={event => {
        if (event.key === "Escape") { close(); toggle.current?.focus(); }
      }}>
        <summary ref={toggle} className="cursor-pointer py-2 font-semibold">Meni tima</summary>
        <div className="pt-4">{links}</div>
      </details>
    </>
  );
}
