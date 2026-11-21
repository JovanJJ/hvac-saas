import type { Snapshot } from "./types";
// Archived ancestors make equipment unavailable for new work without hiding its history.
export function activeRegister(source: Snapshot): Snapshot {
  const customers = source.customers.filter((row) => !row.archived_at);
  const customerIds = new Set(customers.map((row) => row.id));
  const sites = source.sites.filter(
    (row) => !row.archived_at && customerIds.has(row.customer_id!),
  );
  const siteIds = new Set(sites.map((row) => row.id));
  return {
    ...source,
    customers,
    sites,
    systems: source.systems.filter(
      (row) => !row.archived_at && siteIds.has(row.site_id!),
    ),
  };
}
