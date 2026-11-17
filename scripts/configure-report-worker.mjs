import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { withDatabase } from "./database.mjs";
import { installReportPolicies } from "./storage-maintenance.mjs";

try {
  const installation = await withDatabase(async (db) => {
    await db.query("begin");
    try {
      await db.query(
        "select pg_advisory_xact_lock(hashtext('hvac_pdf_worker_configuration'))",
      );
      const existing = (
        await db.query(
          "select * from hvac_private.pdf_worker_identity where singleton",
        )
      ).rows[0];
      const email =
        process.env.REPORT_WORKER_EMAIL ||
        `pdf-worker-${randomUUID()}@hvac.example.invalid`;
      const password =
        process.env.REPORT_WORKER_PASSWORD ||
        randomBytes(32).toString("base64url");
      if (
        existing &&
        (!process.env.REPORT_WORKER_EMAIL ||
          !process.env.REPORT_WORKER_PASSWORD)
      )
        throw new Error("Existing worker credentials required");
      if (password.length < 12 || Buffer.byteLength(password) > 72)
        throw new Error("Invalid worker password");
      if (existing) {
        const verified = await db.query(
          "select id from auth.users where id=$1 and email=$2 and encrypted_password=extensions.crypt($3,encrypted_password) and email_confirmed_at is not null",
          [existing.user_id, email, password],
        );
        if (!verified.rows.length)
          throw new Error("Worker configuration mismatch");
      } else {
        if (
          (
            await db.query(
              "select id from auth.users where lower(email)=lower($1)",
              [email],
            )
          ).rows.length
        )
          throw new Error("Worker identity collision");
        const id = randomUUID();
        await db.query(
          `insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
          values('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"],"hvac_pdf_worker":true}','{}',now(),now(),'','','','','','')`,
          [id, email, password],
        );
        await db.query(
          "insert into auth.identities(id,user_id,provider_id,provider,identity_data,created_at,updated_at) values($1::uuid,$2::uuid,$2::text,'email',jsonb_build_object('sub',$2::text,'email',$3::text,'email_verified',true,'phone_verified',false),now(),now())",
          [randomUUID(), id, email],
        );
        await db.query(
          "insert into hvac_private.pdf_worker_identity(singleton,user_id) values(true,$1)",
          [id],
        );
      }
      let contents = await readFile(".env", "utf8");
      for (const [name, value] of [
        ["REPORT_WORKER_EMAIL", email],
        ["REPORT_WORKER_PASSWORD", password],
      ]) {
        if (process.env[name]) continue;
        const empty = new RegExp(
          `^${name}[ \\t]*=[ \\t]*(?:""|'')?[ \\t]*$`,
          "m",
        );
        if (empty.test(contents))
          contents = contents.replace(empty, `${name}=${value}`);
        else if (new RegExp(`^${name}\\s*=`, "m").test(contents))
          throw new Error("Worker environment mismatch");
        else contents += `\n${name}=${value}\n`;
      }
      await writeFile(".env", contents);
      const result = (
        await db.query(
          "select installation_id from hvac_private.pdf_worker_identity where singleton",
        )
      ).rows[0].installation_id;
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    }
  });
  await installReportPolicies(
    installation,
    await readFile("supabase/storage/report_policies.sql", "utf8"),
  );
  console.log(
    "PASS: limited PDF worker identity and private Storage policies configured. No credentials were logged.",
  );
} catch {
  console.error(
    "PDF worker setup failed. Check matching worker credentials and Storage-owner tooling access. No credentials were logged.",
  );
  process.exitCode = 1;
}
