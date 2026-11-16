import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

const create = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
try {
  assert.ok(process.env.SEED_PASSWORD, "Development seed password required.");
  const anon = await create().from("organizations").select("id");
  assert.ok(anon.error, "Anonymous organization access must fail.");
  for (const [email, expectedName] of [
    ["owner.a@hvac.example.invalid", "Primer servis A"],
    ["technician.a@hvac.example.invalid", "Primer servis A"],
    ["owner.b@hvac.example.invalid", "Primer servis B"],
    ["unassigned@hvac.example.invalid", null],
  ]) {
    const client = create();
    try {
      const login = await client.auth.signInWithPassword({
        email,
        password: process.env.SEED_PASSWORD,
      });
      assert.equal(Boolean(login.error), false);
      const organizations = await client
        .from("organizations")
        .select("id,display_name");
      assert.equal(Boolean(organizations.error), false);
      assert.equal(organizations.data.length, expectedName ? 1 : 0);
      if (expectedName)
        assert.equal(organizations.data[0].display_name, expectedName);
      const foreignOrganization =
        expectedName === "Primer servis B"
          ? "a1000000-0000-4000-8000-000000000001"
          : "a1000000-0000-4000-8000-000000000002";
      const crossTenant = await client
        .from("organizations")
        .select("id")
        .eq("id", foreignOrganization);
      assert.deepEqual(crossTenant.data, []);
      const memberships = await client
        .from("memberships")
        .select("user_id,organization_id");
      assert.equal(Boolean(memberships.error), false);
      assert.ok(
        memberships.data.every((row) => row.user_id === login.data.user.id),
      );
      const write = await client
        .from("memberships")
        .update({ role: "owner" })
        .eq("user_id", login.data.user.id);
      assert.ok(write.error, "Direct membership writes must fail.");
    } finally {
      await client.auth.signOut({ scope: "local" });
    }
  }
  console.log(
    "PASS: direct Supabase API reads are scoped for owners A/B, technician and unassigned identity; anonymous reads and membership writes denied.",
  );
} catch {
  console.error(
    "Supabase API access checks failed. No credentials or session values were logged.",
  );
  process.exitCode = 1;
}
