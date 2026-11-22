import { test } from "node:test";
import assert from "node:assert/strict";
import { generationWindowSchema } from "../../features/maintenance/generation-model";
test("generation windows accept one date or at most ninety inclusive dates", () => {
  assert.equal(
    generationWindowSchema.safeParse({
      from: "2027-01-01",
      until: "2027-01-01",
    }).success,
    true,
  );
  assert.equal(
    generationWindowSchema.safeParse({
      from: "2027-01-01",
      until: "2027-03-31",
    }).success,
    true,
  );
  for (const until of ["2026-12-31", "2027-04-01", "2027-02-29"])
    assert.equal(
      generationWindowSchema.safeParse({ from: "2027-01-01", until }).success,
      false,
    );
});
