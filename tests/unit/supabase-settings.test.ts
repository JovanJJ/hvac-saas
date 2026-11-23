import assert from "node:assert/strict";
import { supabaseSettings } from "../../lib/supabase/settings";
const url = "http://localhost:8000";
const jwt = (role: string) =>
  `header.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
for (const key of [
  jwt("service_role"),
  jwt("authenticated"),
  "sb_secret_fictional",
])
  assert.throws(() =>
    supabaseSettings({
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_PUBLISHABLE_KEY: key,
    }),
  );
assert.equal(
  supabaseSettings({
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt("anon"),
  }).key,
  jwt("anon"),
);
assert.equal(
  supabaseSettings({
    NEXT_PUBLIC_SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "stale",
  }).key,
  "sb_publishable_fictional",
);
assert.throws(() =>
  supabaseSettings({
    NEXT_PUBLIC_SUPABASE_URL: "file:///tmp/example",
    SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
  }),
);

assert.equal(supabaseSettings({
  NEXT_PUBLIC_SUPABASE_URL: "https://api.example.invalid",
  SUPABASE_INTERNAL_URL: "http://supabase-api:8000",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional",
}).url, "http://supabase-api:8000");
assert.throws(() => supabaseSettings({
  NEXT_PUBLIC_SUPABASE_URL: "https://api.example.invalid",
  SUPABASE_INTERNAL_URL: "file:///tmp/invalid",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictional",
}));
