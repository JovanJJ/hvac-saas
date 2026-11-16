import { randomUUID } from "node:crypto";
import { withDatabase, reportFailure } from "./database.mjs";

export const seedUsers = [
  {
    id: "a1000000-0000-4000-8000-000000000101",
    email: "owner.a@hvac.example.invalid",
    organization: "a1000000-0000-4000-8000-000000000001",
    role: "owner",
    confirmed: true,
  },
  {
    id: "a1000000-0000-4000-8000-000000000102",
    email: "technician.a@hvac.example.invalid",
    organization: "a1000000-0000-4000-8000-000000000001",
    role: "technician",
    confirmed: true,
  },
  {
    id: "a1000000-0000-4000-8000-000000000103",
    email: "owner.b@hvac.example.invalid",
    organization: "a1000000-0000-4000-8000-000000000002",
    role: "owner",
    confirmed: true,
  },
  {
    id: "a1000000-0000-4000-8000-000000000104",
    email: "unassigned@hvac.example.invalid",
    organization: null,
    role: null,
    confirmed: true,
  },
  {
    id: "a1000000-0000-4000-8000-000000000105",
    email: "unconfirmed@hvac.example.invalid",
    organization: null,
    role: null,
    confirmed: false,
  },
];
export const seedOrganizations = [
  { id: "a1000000-0000-4000-8000-000000000001", name: "Primer servis A" },
  { id: "a1000000-0000-4000-8000-000000000002", name: "Primer servis B" },
];

export async function seedDevelopment(db) {
  const password = process.env.SEED_PASSWORD;
  if (
    process.env.ALLOW_DEVELOPMENT_SEED !== "true" ||
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password) > 72
  ) {
    throw new Error(
      "Explicit development seed opt-in and a 12–72 byte SEED_PASSWORD are required.",
    );
  }
  await db.query("begin");
  try {
    await db.query(
      "select pg_advisory_xact_lock(hashtext('hvac_development_seed'))",
    );
    for (const organization of seedOrganizations) {
      const { rows } = await db.query(
        "select display_name from public.organizations where id=$1",
        [organization.id],
      );
      if (rows.length && rows[0].display_name !== organization.name)
        throw new Error("Seed organization ID collision.");
      await db.query(
        "insert into public.organizations(id, display_name) values ($1,$2) on conflict (id) do nothing",
        [organization.id, organization.name],
      );
    }
    for (const user of seedUsers) {
      const { rows } = await db.query(
        "select email from auth.users where id=$1 or lower(email)=lower($2)",
        [user.id, user.email],
      );
      if (rows.length) {
        // Never reset passwords, metadata or memberships on a repeated seed.
        const { rows: exact } = await db.query(
          "select id from auth.users where id=$1 and email=$2",
          [user.id, user.email],
        );
        if (rows.length !== 1 || !exact.length)
          throw new Error("Seed identity collision.");
      } else {
        await db.query(
          `insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token)
          values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
            extensions.crypt($3,extensions.gen_salt('bf')),case when $4::boolean then now() else null end,
            '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','','','')`,
          [user.id, user.email, password, user.confirmed],
        );
        await db.query(
          `insert into auth.identities (id,user_id,provider_id,provider,identity_data,created_at,updated_at)
          values ($1::uuid,$2::uuid,$2::text,'email',jsonb_build_object('sub',$2::text,'email',$3::text,'email_verified',$4::boolean,'phone_verified',false),now(),now())`,
          [randomUUID(), user.id, user.email, user.confirmed],
        );
        if (user.organization)
          await db.query(
            "insert into public.memberships(organization_id,user_id,role) values($1,$2,$3)",
            [user.organization, user.id, user.role],
          );
      }
    }
    await db.query("commit");
    console.log(
      "Development seed verified: two fictional organizations and five identities. Existing fixtures were preserved.",
    );
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  // Credentials are always supplied outside git; no default seed password is shipped.
  await withDatabase(seedDevelopment).catch(reportFailure);
}
