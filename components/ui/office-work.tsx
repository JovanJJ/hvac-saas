import Link from "next/link";
import type { ReactNode } from "react";

export function OfficeSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-heading`} className="office-section">
    <header><h2 id={`${id}-heading`} tabIndex={-1}>{title}</h2>{description && <p className="office-help">{description}</p>}</header>
    {children}
  </section>;
}
export function OfficeFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return <dl className="office-facts">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
}
export function OfficeNavigation({ items }: { items: { label: string; href: string }[] }) {
  return <nav aria-label="Koraci kancelarijske obrade" className="office-navigation">{items.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>;
}
export function OfficeEmpty({ children, href, label }: { children: ReactNode; href: string; label: string }) {
  return <div className="office-empty"><p>{children}</p><Link className="button secondary" href={href}>{label}</Link></div>;
}
