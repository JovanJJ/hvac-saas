import { expect, test, type Page } from "@playwright/test";

const password = process.env.SEED_PASSWORD;
test.skip(
  !password || !process.env.NEXT_PUBLIC_SUPABASE_URL,
  "M1a development seed and Supabase configuration are required.",
);
async function signIn(page: Page, email: string) {
  await page.goto("/sign-in?next=/account");
  await page.getByLabel("Email adresa").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test("verified sign-in, tenant landing, session refresh and sign-out", async ({
  page,
}, testInfo) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
  await expect(page.getByText("Unesite ispravnu email adresu.")).toBeVisible();
  await signIn(page, "owner.a@hvac.example.invalid");
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", { name: "Primer servis A" }),
  ).toBeVisible();
  await expect(page.getByText("Primer servis B")).toHaveCount(0);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("account.png"),
    fullPage: true,
  });
  const authCookies = (await page.context().cookies())
    .filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  expect(
    authCookies.every((cookie) => cookie.httpOnly && cookie.sameSite === "Lax"),
  ).toBe(true);
  const encoded = authCookies.map((cookie) => cookie.value).join("");
  const session = JSON.parse(
    Buffer.from(encoded.slice("base64-".length), "base64url").toString(),
  );
  const oldRefreshToken = session.refresh_token;
  session.expires_at = Math.floor(Date.now() / 1000) - 30;
  const baseName = authCookies[0].name.replace(/\.\d+$/, "");
  await page.context().clearCookies({ name: new RegExp(baseName) });
  await page.context().addCookies([
    {
      ...authCookies[0],
      name: baseName,
      value:
        "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"),
    },
  ]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Primer servis A" }),
  ).toBeVisible();
  const refreshed = (await page.context().cookies())
    .filter((cookie) => /-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((cookie) => cookie.value)
    .join("");
  const refreshedSession = JSON.parse(
    Buffer.from(refreshed.slice("base64-".length), "base64url").toString(),
  );
  expect(refreshedSession.refresh_token !== oldRefreshToken).toBe(true);
  await page.goto("/");
  await expect(page).toHaveURL(/\/office$/);
  await page.getByRole("button", { name: "Odjavi se" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("second organization, technician and unassigned identity remain scoped", async ({
  page,
}) => {
  for (const [email, organization] of [
    ["owner.b@hvac.example.invalid", "Primer servis B"],
    ["technician.a@hvac.example.invalid", "Primer servis A"],
    ["unassigned@hvac.example.invalid", null],
  ]) {
    await signIn(page, email!);
    await expect(page).toHaveURL(/\/account$/);
    if (organization) {
      await expect(
        page.getByRole("heading", { name: organization }),
      ).toBeVisible();
      await expect(
        page.getByText(
          organization === "Primer servis A"
            ? "Primer servis B"
            : "Primer servis A",
        ),
      ).toHaveCount(0);
    } else
      await expect(page.getByText("Još nemate radni prostor")).toBeVisible();
    await page.getByRole("button", { name: "Odjavi se" }).click();
  }
});

test("unconfirmed identity, recovery and invalid links", async ({ page }) => {
  await signIn(page, "unconfirmed@hvac.example.invalid");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Prijava nije uspela|Link nije važeći/ }),
  ).toContainText("Prijava nije uspela.");
  await page.goto("/forgot-password");
  await page.getByLabel("Email adresa").fill("absent@hvac.example.invalid");
  await page.getByRole("button", { name: "Pošalji uputstvo" }).click();
  await expect(
    page.getByText("Ako postoji nalog sa ovom adresom"),
  ).toBeVisible();
  await page.goto(
    "/auth/confirm?token_hash=invalid&type=recovery&next=https://evil.invalid",
  );
  await expect(page).toHaveURL(/\/sign-in\?error=invalid-link$/);
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Prijava nije uspela|Link nije važeći/ }),
  ).toContainText("Link nije važeći");
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/sign-in\?error=invalid-link$/);
  await noOverflow(page);
});

test("registration validates matching passwords without losing email", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await page.getByLabel("Email adresa").fill("new@hvac.example.invalid");
  await page.getByLabel("Lozinka", { exact: true }).fill("A-long-password-123");
  await page.getByLabel("Ponovite lozinku").fill("A-different-password-123");
  await page.getByRole("button", { name: "Napravi nalog" }).click();
  await expect(page.getByText("Lozinke se ne podudaraju.")).toBeVisible();
  await expect(page.getByLabel("Email adresa")).toHaveValue(
    "new@hvac.example.invalid",
  );
});

test("real confirmation and recovery tokens, password update and expired/replayed links", async ({
  page,
}) => {
  const { createVerificationFixture } = await import("./auth-fixtures");
  const fixture = await createVerificationFixture();
  try {
    await page.goto(
      `/auth/confirm?token_hash=${fixture.tokenHash}&type=signup`,
    );
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText("Još nemate radni prostor")).toBeVisible();
    await page.getByRole("button", { name: "Odjavi se" }).click();
    await page.goto(
      `/auth/confirm?token_hash=${fixture.tokenHash}&type=signup`,
    );
    await expect(page).toHaveURL(/\/sign-in\?error=invalid-link$/);
    const token = await fixture.recoveryToken();
    await page.goto(`/auth/confirm?token_hash=${token}&type=recovery`);
    await expect(
      page.getByRole("heading", { name: "Izaberite novu lozinku." }),
    ).toBeVisible();
    const newPassword = fixture.password + "-new";
    await page.getByLabel("Nova lozinka").fill(newPassword);
    await page.getByLabel("Ponovite lozinku").fill(newPassword);
    await page.getByRole("button", { name: "Sačuvaj novu lozinku" }).click();
    await expect(page).toHaveURL(/\/sign-in\?message=password-updated$/);
    await page.getByLabel("Email adresa").fill(fixture.email);
    await page.getByLabel("Lozinka", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.goto("/account");
    await page.getByRole("button", { name: "Odjavi se" }).click();
    const expired = await fixture.expiredToken();
    await page.goto(`/auth/confirm?token_hash=${expired}&type=recovery`);
    await expect(page).toHaveURL(/\/sign-in\?error=invalid-link$/);
  } finally {
    await fixture.dispose();
  }
});
