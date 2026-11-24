// UX07 records validated requests durably through the restricted public RPC.
export const demoAvailable = true;

// UX08 drafts are local only until operator facts and legal/commercial wording are reviewed.
// This gate controls both links and routes; do not enable production drafts via runtime config.
export const legalPagesAvailable = process.env.NODE_ENV === "development";
