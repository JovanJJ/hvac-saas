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
  assert.equal(safeDestination("/reset-password"), "/reset-password");
  assert.equal(safeDestination("/office"), "/office");
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
