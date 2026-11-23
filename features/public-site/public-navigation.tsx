"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const sections = [
  { href: "/#kako-radi", label: "Kako radi" },
  { href: "/#cene", label: "Cene" },
  { href: "/#pitanja", label: "Pitanja" },
];

export function PublicNavigation({ accountAction, registrationAction, demoAvailable }: {
  accountAction: ReactNode;
  registrationAction: ReactNode;
  demoAvailable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    }
    function resize() {
      if (window.matchMedia("(min-width: 1100px)").matches) setOpen(false);
    }
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  return (
    <>
      <nav className="public-desktop-nav" aria-label="Glavna navigacija">
        <div className="public-section-links">
          {sections.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </div>
        <div className="public-account-actions">
          {accountAction}
          {registrationAction}
          {demoAvailable && <Link className="public-button" href="/demo">Zatraži demonstraciju</Link>}
        </div>
      </nav>
      <nav className="public-mobile-nav" aria-label="Navigacija na telefonu">
        <div className="public-mobile-actions">
          {accountAction}
          <button ref={toggle} type="button" className="public-menu-toggle" aria-expanded={open} aria-controls="public-menu" onClick={() => setOpen(!open)}>Meni</button>
        </div>
        <div id="public-menu" className="public-menu-panel" hidden={!open} onClick={(event) => {
          const link = (event.target as HTMLElement).closest("a");
          if (!link) return;
          setOpen(false);
          const hash = new URL(link.href).hash;
          if (hash && window.location.pathname === "/") {
            document.getElementById(hash.slice(1))?.focus();
          }
        }}>
          {registrationAction}
          {demoAvailable && <Link className="public-button" href="/demo">Zatraži demonstraciju</Link>}
          {sections.map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </div>
      </nav>
    </>
  );
}
