import assert from "node:assert/strict";
import { test } from "node:test";
import { readingSchema } from "../../features/visits/model";

test("reading state preserves measured zero and forbids a value for unmeasured readings", () => {
  const reading = {
    kind: "Struja",
    mode: "Hlađenje",
    unit: "A",
    status: "measured",
    value: 0,
  };
  assert.equal(readingSchema.safeParse(reading).success, true);
  assert.equal(
    readingSchema.safeParse({ ...reading, value: null }).success,
    false,
  );
  assert.equal(
    readingSchema.safeParse({ ...reading, status: "not_measured" }).success,
    false,
  );
  assert.equal(
    readingSchema.safeParse({
      ...reading,
      status: "not_applicable",
      value: null,
    }).success,
    true,
  );
});
