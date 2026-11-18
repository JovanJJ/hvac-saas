import assert from "node:assert/strict";
import { test } from "node:test";
import {
  submissionIssue,
  syncMessages,
  syncRequestSchema,
  syncOperationSchema,
} from "../../features/offline/sync-model";
import type { OfflineBundle } from "../../features/offline/model";
import type { ItemInput } from "../../features/visits/model";
const id = "a1000000-0000-4000-8000-000000000001";
const input: ItemInput = {
  itemId: id,
  outcome: "serviced",
  work: "Fictional work",
  finding: "",
  noAccessReason: "",
  internalNote: "",
  readings: [],
  parts: [],
  followUp: null,
};
const bundle = {
  visit: {
    staff: [{ id, label: "Fictional member" }],
    items: [{ ...input, id }],
  },
} as unknown as OfflineBundle;
test("queued submission validates the effective field draft, including pending and missing ownership", () => {
  assert.equal(submissionIssue(bundle, new Map()), null);
  assert.equal(
    submissionIssue(bundle, new Map([[id, { ...input, outcome: "pending" }]])),
    syncMessages.pending_items,
  );
  const followUp = {
    kind: "quote" as const,
    ownerId: "",
    dueDate: "2026-12-23",
    customerAction: "",
  };
  assert.equal(
    submissionIssue(bundle, new Map([[id, { ...input, followUp }]])),
    syncMessages.missing_follow_up,
  );
  assert.equal(
    submissionIssue(
      bundle,
      new Map([[id, { ...input, followUp: { ...followUp, ownerId: id } }]]),
    ),
    null,
  );
});
test("replay wire contract rejects unsupported commands, unbounded batches and altered submit data", () => {
  const operation = {
    entityId: id,
    operationId: id,
    baseVersion: 1,
    type: "save",
    payload: input,
  };
  const body = {
    userId: id,
    organizationId: id,
    epoch: id,
    operations: [operation],
  };
  assert.equal(syncRequestSchema.safeParse(body).success, true);
  assert.equal(
    syncRequestSchema.safeParse({
      ...body,
      operations: Array(11).fill(operation),
    }).success,
    false,
  );
  assert.equal(
    syncRequestSchema.safeParse({
      ...body,
      operations: [{ ...operation, type: "return" }],
    }).success,
    false,
  );
  assert.equal(
    syncOperationSchema.safeParse({
      ...operation,
      type: "submit",
      payload: { status: "issued" },
    }).success,
    false,
  );
});
