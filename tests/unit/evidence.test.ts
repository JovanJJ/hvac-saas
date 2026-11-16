import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reservePhotoSchema,
  MAX_PHOTO_BYTES,
} from "../../features/evidence/model";
import { verificationProof } from "../../features/evidence/proof";
import { boundedBody, BodyTooLarge } from "../../features/evidence/request";
test("photo reservation rejects active content, oversized files and ambiguous visibility", () => {
  const input = {
    visitId: "a1000000-0000-4000-8000-000000000001",
    itemId: "a1000000-0000-4000-8000-000000000002",
    attachmentId: "a1000000-0000-4000-8000-000000000003",
    caption: "Filter",
    visibility: "customer",
    bytes: 68,
    mimeType: "image/png",
  };
  assert.equal(reservePhotoSchema.safeParse(input).success, true);
  for (const change of [
    { mimeType: "image/svg+xml" },
    { mimeType: "image/gif" },
    { bytes: MAX_PHOTO_BYTES + 1 },
    { bytes: 0 },
    { caption: " " },
    { visibility: "" },
  ])
    assert.equal(
      reservePhotoSchema.safeParse({ ...input, ...change }).success,
      false,
    );
});
test("verification proof binds the object, caller, tenant and validity period", () => {
  const data = {
    assetId: "fictional",
    version: 1,
    bytes: 68,
    format: "png",
    width: 1,
    height: 1,
    expires: 2000000000,
  };
  const proof = verificationProof(
    "test-key",
    "org",
    "visit",
    "photo",
    "actor",
    data,
  );
  assert.notEqual(
    proof,
    verificationProof("other-key", "org", "visit", "photo", "actor", data),
  );
  assert.notEqual(
    proof,
    verificationProof("test-key", "other-org", "visit", "photo", "actor", data),
  );
  assert.notEqual(
    proof,
    verificationProof("test-key", "org", "visit", "other-photo", "actor", data),
  );
  assert.notEqual(
    proof,
    verificationProof("test-key", "org", "visit", "photo", "other-actor", data),
  );
  assert.notEqual(
    proof,
    verificationProof("test-key", "org", "visit", "photo", "actor", {
      ...data,
      bytes: 69,
    }),
  );
  assert.notEqual(
    proof,
    verificationProof("test-key", "org", "visit", "photo", "actor", {
      ...data,
      expires: data.expires + 1,
    }),
  );
});
test("request limits apply even without a content-length header", async () => {
  assert.equal(
    (
      await boundedBody(
        new Request("https://example.invalid", {
          method: "POST",
          body: "small",
        }),
        5,
      )
    ).toString(),
    "small",
  );
  await assert.rejects(
    boundedBody(
      new Request("https://example.invalid", {
        method: "POST",
        body: "too-large",
      }),
      5,
    ),
    BodyTooLarge,
  );
});
