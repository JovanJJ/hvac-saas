import { expect, test } from "@playwright/test";
import { randomUUID, randomBytes } from "node:crypto";
import pg from "pg";

test.skip(
  process.env.TEST_LOCAL_MAIL !== "true",
  "Run npm run mail:start and npm run test:signup to exercise delivered confirmations.",
);

test("register through the UI, confirm the captured email and reach M1b", async ({
  page,
  request,
}) => {
  const mailbox = `signup-${randomUUID()}`;
  const email = `${mailbox}@hvac.example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const inbox = "http://127.0.0.1:9000/api/v1/mailbox/" + mailbox;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await page.goto("/sign-up");
    await page.getByLabel("Email adresa").fill(email);
    await page.getByLabel("Lozinka", { exact: true }).fill(password);
    await page.getByLabel("Ponovite lozinku").fill(password);
    await page.getByRole("button", { name: "Napravi nalog" }).click();
    await expect(page.getByText("Ako je registracija moguća")).toBeVisible();
    await expect
      .poll(async () => {
        const result = await request.get(inbox);
        return (await result.json()).length;
      })
      .toBe(1);
    const messages = await (await request.get(inbox)).json();
    const message = await (
      await request.get(inbox + "/" + messages[0].id)
    ).json();
    const match = message.body.html.match(/href="([^"]+)"/);
    if (!match) throw new Error("Confirmation email is missing its link.");
    // Follow the real GoTrue link in the same browser; the PKCE cookie must survive signup.
    await page.goto(match[1].replaceAll("&amp;", "&"));
    await expect(
      page.getByRole("heading", { name: "Vaš nalog", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Još nemate radni prostor")).toBeVisible();
    await page
      .getByRole("link", { name: "Napravi radni prostor", exact: true })
      .click();
    await page
      .getByLabel("Naziv firme")
      .fill("Provera registracije " + mailbox);
    await page
      .getByRole("button", { name: "Napravi radni prostor", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Kancelarija", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Tim i pozivi", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Tim i pozivi", exact: true }),
    ).toBeVisible();
  } finally {
    await db.query("begin");
    try {
      const { rows } = await db.query(
        "select id from auth.users where email=$1",
        [email],
      );
      if (rows.length) {
        const id = rows[0].id;
        const { rows: organizations } = await db.query(
          "select organization_id from hvac_private.workspace_creations where actor_id=$1",
          [id],
        );
        const ids = organizations.map((row) => row.organization_id);
        await db.query(
          "delete from hvac_private.identity_events where organization_id=any($1::uuid[]) or actor_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from hvac_private.invitations where organization_id=any($1::uuid[]) or created_by=$2 or accepted_by=$2",
          [ids, id],
        );
        await db.query(
          "delete from hvac_private.workspace_creations where organization_id=any($1::uuid[]) or actor_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from public.memberships where organization_id=any($1::uuid[]) or user_id=$2",
          [ids, id],
        );
        await db.query(
          "delete from public.organizations where id=any($1::uuid[])",
          [ids],
        );
        await db.query("delete from auth.users where id=$1 and email=$2", [
          id,
          email,
        ]);
      }
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      await db.end();
      await request.delete(inbox);
    }
  }
});
