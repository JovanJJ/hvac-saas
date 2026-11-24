import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emailSchema,
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  safeDestination,
} from "../../features/auth/validation";

test("normalizes email, accepts existing sign-in passwords and validates new passwords", () => {
  assert.equal(
    emailSchema.parse(" OWNER@EXAMPLE.INVALID "),
    "owner@example.invalid",
  );
  assert.equal(
    signInSchema.safeParse({
      email: "a@example.invalid",
      password: "old-password",
    }).success,
    true,
  );
  assert.equal(
    signUpSchema.safeParse({
      email: "a@example.invalid",
      password: "short",
      confirmPassword: "short",
    }).success,
    false,
  );
  assert.equal(
    signUpSchema.safeParse({
      email: "a@example.invalid",
      password: "A-long-password-123",
      confirmPassword: "different",
    }).success,
    false,
  );
  assert.equal(
    resetPasswordSchema.safeParse({
      password: "A-long-password-123",
      confirmPassword: "A-long-password-123",
    }).success,
    true,
  );
  assert.equal(
    resetPasswordSchema.safeParse({
      password: "ž".repeat(40),
      confirmPassword: "ž".repeat(40),
    }).success,
    false,
  );
  assert.equal(
    signInSchema.safeParse({ email: "invalid", password: "" }).success,
    false,
  );
});

test("callback destinations cannot redirect outside the allowed account routes", () => {
  const revisionPath = "/office/reports/a1000000-0000-4000-8000-000000000001";
  assert.equal(safeDestination(revisionPath), revisionPath);
  assert.equal(safeDestination(revisionPath + "/../../settings"), "/account");
  assert.equal(
    safeDestination("/visits/a1000000-0000-4000-8000-000000000001/review"),
    "/visits/a1000000-0000-4000-8000-000000000001/review",
  );
  assert.equal(
    safeDestination(
      "/visits/a1000000-0000-4000-8000-000000000001/../../settings",
    ),
    "/account",
  );
  assert.equal(safeDestination("/reset-password"), "/reset-password");
  assert.equal(safeDestination("/office"), "/office");
  for (const root of ["customers", "sites", "systems", "schedule", "imports", "maintenance"]) {
    const path = `/${root}/a1000000-0000-4000-8000-000000000001`;
    assert.equal(safeDestination(path), path);
    assert.equal(safeDestination(path + "/../../account"), "/account");
    assert.equal(safeDestination(path + "?next=https://evil.invalid"), "/account");
  }
  assert.equal(safeDestination(["/today", "/office"]), "/account");
  assert.equal(
    safeDestination("/invite/" + "a".repeat(43)),
    "/invite/" + "a".repeat(43),
  );
  for (const value of [
    "/account",
    "//evil.invalid",
    "https://evil.invalid",
    "/\\evil.invalid",
    null,
    "/reset-password?next=https://evil.invalid",
  ]) {
    assert.equal(safeDestination(value), "/account");
  }
});
