import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftPayload,
  type DraftValues,
} from "../../features/offline/draft-model";
const itemId = "a1000000-0000-4000-8000-000000000001";
const values: DraftValues = {
  outcome: "pending",
  work: "",
  finding: "",
  noAccessReason: "",
  internalNote: "",
  readings: [
    {
      kind: "Struja",
      mode: "Hlađenje",
      unit: "A",
      status: "measured",
      value: "0",
    },
    {
      kind: "Temperatura",
      mode: "Hlađenje",
      unit: "°C",
      status: "not_measured",
      value: null,
    },
  ],
  parts: [{ name: "Fiktivni materijal", quantity: "0,50", unit: "kg" }],
  followUp: { kind: "revisit", ownerId: "", dueDate: "", customerAction: "" },
};
test("queue normalization preserves deliberate pending, incomplete ownership, zero/null and decimal parts", () => {
  const payload = draftPayload(values, itemId);
  assert.equal(payload.outcome, "pending");
  assert.equal(payload.followUp?.ownerId, "");
  assert.equal(payload.followUp?.dueDate, "");
  assert.deepEqual(
    payload.readings.map((r) => r.value),
    [0, null],
  );
  assert.equal(payload.parts[0].quantity, 0.5);
  assert.equal(values.parts[0].quantity, "0,50");
});
test("an empty or malformed measured input is never silently queued as zero", () => {
  for (const value of ["", " ", "abc", "Infinity", "1,2,3"]) {
    assert.throws(
      () =>
        draftPayload(
          { ...values, readings: [{ ...values.readings[0], value }] },
          itemId,
        ),
      /Prazno merenje nije nula/,
    );
  }
});
