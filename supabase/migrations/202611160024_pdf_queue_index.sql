-- Keep claim scans bounded as archived revisions accumulate.
create index render_jobs_pending_idx on hvac_private.render_jobs(created_at,id)
 where state in ('queued','rendering');
