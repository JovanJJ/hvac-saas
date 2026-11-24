import type { ReactNode } from "react";

export function StaffPageHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0"><h1>{title}</h1><p>{description}</p></div>
    {action}
  </div>;
}
