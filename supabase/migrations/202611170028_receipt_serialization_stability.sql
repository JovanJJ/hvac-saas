-- JSON serialization of timestamptz respects session TimeZone; receipt rows
-- are immutable, but their presentation helper is correctly statement-stable.
do $$ begin execute format('grant hvac_identity_executor to %I with inherit true, set true',current_user);end $$;
alter function hvac_private.receipt_data(hvac_private.report_receipts) stable;
do $$ begin execute format('revoke hvac_identity_executor from %I',current_user);end $$;
