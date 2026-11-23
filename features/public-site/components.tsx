import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export function PublicContainer({
  as: Element = "div",
  className = "",
  ...props
}: ComponentPropsWithoutRef<"div"> & { as?: "div" | "main" }) {
  return <Element className={`public-container ${className}`} {...props} />;
}

export function PublicSectionHeading({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return <h2 id={id} tabIndex={-1}>{children}</h2>;
}

export function PublicActionLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={`public-button public-button-${variant}`}>
      {children}
    </Link>
  );
}

export function ReportPanel({
  children,
  caption,
}: {
  children: ReactNode;
  caption: ReactNode;
}) {
  return (
    <figure className="public-report-panel">
      <div className="public-report-media">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
