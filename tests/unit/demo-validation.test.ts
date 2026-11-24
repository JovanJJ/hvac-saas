import assert from "node:assert/strict";
import { test } from "node:test";
import { demoSchema } from "../../features/demo/validation";

const valid = { operationId: "5f4db1b5-4451-4b32-a45c-380d62d949b0", name: " Ana ", email: "ana@hvac.example.invalid", company: " Pilot ", plan: "tim", website: "" };
test("demo input trims contact fields and accepts only offered plans", () => {
  assert.equal(demoSchema.parse(valid).name, "Ana");
  for (const plan of ["", "solo", "tim"]) assert(demoSchema.safeParse({ ...valid, plan }).success);
  for (const plan of ["TIM", "enterprise", ["tim", "solo"], null]) assert(!demoSchema.safeParse({ ...valid, plan }).success);
});
test("demo rejects invalid, oversized and automated input", () => {
  for (const change of [{ name: " " }, { company: "" }, { email: "invalid" }, { email: "a".repeat(260) }, { name: "a".repeat(101) }, { company: "a".repeat(161) }, { operationId: "invalid" }, { website: "https://spam.invalid" }]) {
    assert(!demoSchema.safeParse({ ...valid, ...change }).success);
  }
});
