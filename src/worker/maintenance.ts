import type { WorkerClient } from "./client";
export type MaintenanceClaim = {
  jobId: string;
  planId: string;
  organizationId: string;
  leaseToken: string;
  attempts: number;
};
export async function tickMaintenance(client: WorkerClient, planId?: string) {
  const { data, error } = await client.rpc("maintenance_tick", {
    p_plan_id: planId,
  });
  if (error) throw new Error("maintenance_tick_failed");
  return data;
}
export async function claimMaintenance(
  client: WorkerClient,
  planId?: string,
): Promise<MaintenanceClaim | null> {
  const { data, error } = await client.rpc("maintenance_claim", {
    p_plan_id: planId,
  });
  if (error) throw new Error("maintenance_claim_failed");
  return data as MaintenanceClaim | null;
}
export async function executeMaintenance(
  client: WorkerClient,
  job: MaintenanceClaim,
) {
  const { data, error } = await client.rpc("maintenance_execute", {
    p_job_id: job.jobId,
    p_lease_token: job.leaseToken,
  });
  if (error) throw new Error("maintenance_execute_failed");
  return data as {
    state: string;
    result?: {
      created: number;
      existing: number;
      skippedPast: number;
      visits: { visitId: string; intendedDate: string; created: boolean }[];
    };
    error?: string;
  };
}
export async function runMaintenanceOnce(
  client: WorkerClient,
  planId?: string,
) {
  const job = await claimMaintenance(client, planId);
  if (!job) return false;
  try {
    const result = await executeMaintenance(client, job);
    console.info(
      JSON.stringify({
        jobId: job.jobId,
        planId: job.planId,
        state: result.state,
        error: result.error,
      }),
    );
  } catch {
    try {
      await client.rpc("maintenance_fail", {
        p_job_id: job.jobId,
        p_lease_token: job.leaseToken,
      });
    } catch {
      /* An expired lease will be recovered by a later claim. */
    }
    console.error(
      JSON.stringify({
        jobId: job.jobId,
        planId: job.planId,
        error: "generation_failed",
      }),
    );
  }
  return true;
}
