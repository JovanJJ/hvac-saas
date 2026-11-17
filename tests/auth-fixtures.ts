import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

// Only these temporary .invalid identities are written/removed; no seeded or real user is edited.
export async function createVerificationFixture() {
  const id = randomUUID();
  const email = `verify-${id}@hvac.example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const tokenHash = randomBytes(32).toString("hex");
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  await db.connect();
  try {
    await db.query("begin");
    await db.query(
      `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,
      confirmation_token,confirmation_sent_at,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token,created_at,updated_at)
      values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,$4,now(),'','','','','',now(),now())`,
      [id, email, password, tokenHash],
    );
    await db.query(
      `insert into auth.identities (id,user_id,provider_id,provider,identity_data,created_at,updated_at)
      values($1::uuid,$2::uuid,$2::text,'email',jsonb_build_object('sub',$2::text,'email',$3::text,'email_verified',false),now(),now())`,
      [randomUUID(), id, email],
    );
    await db.query(
      `insert into auth.one_time_tokens(id,user_id,token_type,token_hash,relates_to,expires_at)
      values($1,$2,'confirmation_token',$3,$4,now()+interval '1 hour')`,
      [randomUUID(), id, tokenHash, email],
    );
    await db.query("commit");
  } catch {
    await db.query("rollback");
    await db.end();
    throw new Error("Could not create a temporary auth verification fixture.");
  }
  return {
    id,
    email,
    password,
    tokenHash,
    async recoveryToken() {
      const token = randomBytes(32).toString("hex");
      await db.query(
        "update auth.users set recovery_token=$1,recovery_sent_at=now() where id=$2",
        [token, id],
      );
      await db.query(
        `delete from auth.one_time_tokens where user_id=$1 and token_type='recovery_token'`,
        [id],
      );
      await db.query(
        `insert into auth.one_time_tokens(id,user_id,token_type,token_hash,relates_to,expires_at)
        values($1,$2,'recovery_token',$3,$4,now()+interval '1 hour')`,
        [randomUUID(), id, token, email],
      );
      return token;
    },
    async expiredToken() {
      const token = randomBytes(32).toString("hex");
      await db.query(
        "update auth.users set recovery_token=$1,recovery_sent_at=now()-interval '2 days' where id=$2",
        [token, id],
      );
      await db.query(
        `delete from auth.one_time_tokens where user_id=$1 and token_type='recovery_token'`,
        [id],
      );
      await db.query(
        `insert into auth.one_time_tokens(id,user_id,token_type,token_hash,relates_to,expires_at)
        values($1,$2,'recovery_token',$3,$4,now()-interval '1 day')`,
        [randomUUID(), id, token, email],
      );
      return token;
    },
    async dispose() {
      try {
        await db.query("begin");
        const { rows } = await db.query(
          "select organization_id from hvac_private.workspace_creations where actor_id=$1",
          [id],
        );
        const ids = rows.map((row) => row.organization_id);
        for (const table of [
          "report_receipts",
          "report_links",
          "report_artifacts",
          "report_retry_receipts",
          "report_issue_receipts",
          "render_jobs",
        ])
          await db.query(
            `delete from hvac_private.${table} where organization_id=any($1::uuid[])`,
            [ids],
          );
        await db.query(
          "delete from public.report_revisions where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from hvac_private.report_counters where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.attachments where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from hvac_private.visit_corrections where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.follow_ups where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.visit_items where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.visit_assignees where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.visits where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.systems where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.sites where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from public.customers where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from hvac_private.operation_receipts where organization_id=any($1::uuid[])",
          [ids],
        );
        await db.query(
          "delete from hvac_private.identity_events where organization_id=any($1::uuid[]) or actor_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from hvac_private.invitations where organization_id=any($1::uuid[]) or created_by=$2 or accepted_by=$2",
          [ids, id],
        );
        await db.query(
          "delete from hvac_private.workspace_creations where organization_id=any($1::uuid[]) or actor_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from public.memberships where organization_id=any($1::uuid[]) or user_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from public.organizations where id=any($1::uuid[])",
          [ids],
        );
        await db.query("delete from auth.users where id=$1 and email=$2", [
          id,
          email,
        ]);
        await db.query("commit");
      } catch (error) {
        await db.query("rollback");
        throw error;
      } finally {
        await db.end();
      }
    },
  };
}
