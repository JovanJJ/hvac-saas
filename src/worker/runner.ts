import type { CustomerReport } from "@/features/reports/model";
import type { WorkerClient } from "./client";
import { photoSources } from "./photos";
import { digest, rendererId, renderReport } from "./render";
export type Claim = {
  jobId: string;
  organizationId: string;
  revisionId: string;
  leaseToken: string;
  attempts: number;
  path: string;
  sha256: string | null;
  size: number | null;
  rendererVersion: string | null;
  data: CustomerReport;
};
const bucket = "report-pdfs";
export async function claimJob(
  client: WorkerClient,
  revisionId?: string,
): Promise<Claim | null> {
  const { data, error } = await client.rpc("pdf_claim", {
    p_revision_id: revisionId,
  });
  if (error) throw new Error("claim_failed");
  return data as Claim | null;
}
export async function processJob(
  client: WorkerClient,
  job: Claim,
  hooks: { afterUpload?: () => Promise<void> } = {},
) {
  const lease = { p_job_id: job.jobId, p_lease_token: job.leaseToken };
  let lost = false,
    beating = false;
  const timer = setInterval(async () => {
    if (beating) return;
    beating = true;
    try {
      const { error } = await client.rpc("pdf_heartbeat", lease);
      if (error) lost = true;
    } catch {
      lost = true;
    } finally {
      beating = false;
    }
  }, 30000);
  const check = () => {
    if (lost) throw new Error("lease_lost");
  };
  try {
    let bytes: Buffer | undefined;
    if (job.sha256) {
      const { data, error } = await client.storage
        .from(bucket)
        .download(job.path);
      if (data) bytes = Buffer.from(await data.arrayBuffer());
      else if (error && !["404", "400"].includes(String(error.statusCode)))
        throw new Error("storage_unavailable");
    }
    if (!bytes) {
      const sources = await photoSources(job.data, job.organizationId);
      bytes = await renderReport(job.data, sources);
      check();
      const hash = digest(bytes);
      if (
        job.sha256 &&
        (job.sha256 !== hash ||
          job.size !== bytes.length ||
          job.rendererVersion !== rendererId(job.data))
      )
        throw new Error("artifact_mismatch");
      const { error } = await client.rpc("pdf_manifest", {
        ...lease,
        p_sha256: hash,
        p_size: bytes.length,
        p_renderer: rendererId(job.data),
      });
      if (error) throw new Error("artifact_mismatch");
      job.sha256 = hash;
      job.size = bytes.length;
      check();
      const uploaded = await client.storage
        .from(bucket)
        .upload(job.path, bytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploaded.error) {
        // The upload may have committed before a lost response. Only reading the
        // immutable object can establish whether it is safe to finish.
        const existing = await client.storage.from(bucket).download(job.path);
        if (!existing.data) throw new Error("storage_unavailable");
        bytes = Buffer.from(await existing.data.arrayBuffer());
      }
      await hooks.afterUpload?.();
    }
    check();
    const archived = await client.storage.from(bucket).download(job.path);
    if (!archived.data) throw new Error("storage_unavailable");
    bytes = Buffer.from(await archived.data.arrayBuffer());
    if (digest(bytes) !== job.sha256 || bytes.length !== job.size)
      throw new Error("artifact_mismatch");
    const { error } = await client.rpc("pdf_complete", {
      ...lease,
      p_sha256: job.sha256!,
    });
    if (error) throw new Error("completion_failed");
  } finally {
    clearInterval(timer);
  }
}
export async function runOnce(client: WorkerClient, revisionId?: string) {
  const job = await claimJob(client, revisionId);
  if (!job) return false;
  try {
    await processJob(client, job);
    console.info(
      JSON.stringify({
        jobId: job.jobId,
        revisionId: job.revisionId,
        state: "ready",
      }),
    );
  } catch (error) {
    const allowed = [
      "evidence_unavailable",
      "evidence_mismatch",
      "artifact_mismatch",
      "storage_unavailable",
      "unsupported_template",
      "render_limit",
    ];
    const code =
      error instanceof Error && allowed.includes(error.message)
        ? error.message
        : "render_failed";
    await client.rpc("pdf_fail", {
      p_job_id: job.jobId,
      p_lease_token: job.leaseToken,
      p_error: code,
    });
    console.error(
      JSON.stringify({
        jobId: job.jobId,
        revisionId: job.revisionId,
        error: code,
      }),
    );
  }
  return true;
}
