import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createReportFixture } from "./report-fixture";
import { workerClient } from "../src/worker/client";
import { claimJob, processJob } from "../src/worker/runner";
import type { FollowUp } from "../features/follow-ups/model";
const hash = (input: string | Buffer) =>
  createHash("sha256").update(input).digest("hex");
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
test("office completes quote preparation and books one source-linked return without changing issued history", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const fixture = await createReportFixture();
  const owner = api(),
    guest = api(),
    worker = await workerClient();
  try {
    expect(
      (
        await owner.auth.signInWithPassword({
          email: "owner.a@hvac.example.invalid",
          password: process.env.SEED_PASSWORD!,
        })
      ).error,
    ).toBeNull();
    const scoped = { p_organization_id: fixture.org };
    async function tasks() {
      const result = await owner.rpc("follow_up_list", scoped);
      expect(result.error).toBeNull();
      return (result.data as FollowUp[]).filter(
        (a) => a.visitId === fixture.visitId,
      );
    }
    const initialTasks = await tasks();
    const quote = initialTasks.find((a) => a.kind === "quote")!;
    const revisit = initialTasks.find((a) => a.kind === "revisit")!;
    const roster = await owner.rpc("workspace_roster", scoped);
    const ownerMember = roster.data.find(
      (m: { email: string }) => m.email === "owner.a@hvac.example.invalid",
    ).membership_id;
    const techMember = roster.data.find(
      (m: { email: string }) => m.email === "technician.a@hvac.example.invalid",
    ).membership_id;
    const issued = await owner.rpc("issue_report", {
      ...scoped,
      p_visit_id: fixture.visitId,
      p_operation_id: randomUUID(),
      p_version: fixture.version,
    });
    expect(issued.error).toBeNull();
    const revisionId = issued.data as string;
    const job = await claimJob(worker, revisionId);
    expect(job).not.toBeNull();
    await processJob(worker, job!);
    const old = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: revisionId,
    });
    expect(old.data.data.totals).toEqual({
      planned: 4,
      inspected: 3,
      actions: 2,
    });
    const bytes = await owner.storage
      .from("report-pdfs")
      .download(old.data.artifact.path);
    expect(bytes.error).toBeNull();
    const originalPdf = Buffer.from(await bytes.data!.arrayBuffer());
    const token = randomBytes(32).toString("base64url");
    expect(
      (
        await owner.rpc("create_report_link", {
          ...scoped,
          p_revision_id: revisionId,
          p_operation_id: randomUUID(),
          p_token_hash: hash(token),
          p_ttl_days: 7,
        })
      ).error,
    ).toBeNull();
    const receipt = await guest.rpc("acknowledge_report", {
      p_token: token,
      p_name: "Mila Đurić",
      p_role: "Upravnik",
      p_acknowledged: true,
    });
    expect(receipt.error).toBeNull();
    const originalGuest = await guest.rpc("guest_report", { p_token: token });
    await page.goto("/sign-in");
    await page.getByLabel("Email adresa").fill("owner.a@hvac.example.invalid");
    await page
      .getByLabel("Lozinka", { exact: true })
      .fill(process.env.SEED_PASSWORD!);
    await page.getByRole("button", { name: "Prijavi se", exact: true }).click();
    await expect(page).toHaveURL(/\/office$/);
    await page.getByRole("main")
      .getByRole("link", { name: "Sledeće radnje", exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Sledeće radnje",
    );
    await page.goto(`/office/actions/${quote.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Priprema ponude · KL-03",
    );
    await expect(
      page.getByText("Oštećen deflektor", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("Odgovoran", { exact: true })
      .selectOption(ownerMember);
    await page.getByLabel("Rok radnje", { exact: true }).fill("2026-12-12");
    await page
      .getByRole("button", { name: "Sačuvaj odgovornost i rok" })
      .click();
    await expect(page.getByRole("definition")).toHaveText([
      "Otvoreno", "owner.a@hvac.example.invalid", "2026-12-12",
    ]);
    const completeForm = page
      .locator("form")
      .filter({
        has: page.getByRole("heading", { name: "Završi radnju", exact: true }),
      });
    // Browser-required note validation has no side effect.
    await completeForm
      .getByRole("button", { name: "Potvrdi završetak" })
      .click();
    expect((await tasks()).find((a) => a.id === quote.id)!.state).toBe("open");
    await page
      .getByLabel("Interna beleška o završetku")
      .fill("SECRET-OFFICE-NOTE · Ponuda pripremljena za slanje.");
    await completeForm
      .getByRole("button", { name: "Potvrdi završetak" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Završena radnja", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("completed-quote.png"),
      fullPage: true,
    });
    const sourceLink = page.getByRole("link", {
      name: "Otvori izvorni sistem",
    });
    await sourceLink.click();
    await expect(page).toHaveURL(new RegExp(`#system-${quote.itemId}$`));
    await expect(page.locator(`#system-${quote.itemId}`)).toContainText(
      "Oštećen deflektor",
    );
    await page.goto(`/office/actions/${revisit.id}`);
    await page.getByLabel("Početak", { exact: true }).fill("2026-12-15T09:00");
    await page
      .getByLabel("Završetak", { exact: true })
      .fill("2026-12-15T10:00");
    await page.locator(`input[name="members"][value="${techMember}"]`).check();
    await expect(page.getByLabel("Početak", { exact: true })).toHaveValue(
      "2026-12-15T09:00",
    );
    await page
      .getByRole("button", { name: "Zakaži povratnu posetu", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Zakazana povratna poseta" }),
    ).toBeVisible();
    const booked = (await tasks()).find((a) => a.id === revisit.id)!;
    expect(booked.dueDate).toBe("2026-12-10");
    expect(booked.state).toBe("open");
    expect(booked.returnStart).toBe("2026-12-15T08:00:00+00:00");
    const bookPayload = {
      start: "2026-12-15T09:00",
      end: "2026-12-15T10:00",
      members: [techMember],
    };
    const repeats = await Promise.all(
      Array.from({ length: 3 }, () =>
        owner.rpc("follow_up_command", {
          ...scoped,
          p_action_id: revisit.id,
          p_operation_id: randomUUID(),
          p_version: 1,
          p_kind: "book",
          p_data: bookPayload,
        }),
      ),
    );
    for (const repeat of repeats) {
      expect(repeat.error).toBeNull();
      expect(repeat.data).toBe(booked.returnVisitId);
    }
    const visit = await owner.rpc("visit_bundle", {
      ...scoped,
      p_visit_id: booked.returnVisitId,
    });
    expect(visit.data.items).toHaveLength(1);
    expect(visit.data.items[0].code).toBe("KL-04");
    await page.screenshot({
      path: info.outputPath("booked-return.png"),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Otvori povratnu posetu" }).click();
    await expect(
      page.getByRole("heading", {
        name: /Izvorni nalaz za povratnu posetu · KL-04/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Zaključana arhiva", { exact: true }).first(),
    ).toBeVisible();
    // A later finding correction carries live completed task state, while revision 1 stays frozen.
    const amendment = await owner.rpc("report_amendment", {
      ...scoped,
      p_revision_id: revisionId,
    });
    expect(amendment.error).toBeNull();
    await page.goto(`/office/reports/${revisionId}`);
    await page.getByText("Ispravi izveštaj", { exact: true }).click();
    const panel = page.getByRole("group", { name: "Ispravka izveštaja" });
    const quoteEditor = panel.getByRole("group", { name: /Ispravka KL-03/ });
    await expect(quoteEditor.getByLabel("Vrsta radnje")).toBeDisabled();
    await panel
      .getByLabel("Razlog ispravke (vidljiv klijentu)", { exact: true })
      .fill("Dopunjen opis pregleda.");
    await panel
      .getByRole("group", { name: /Ispravka KL-01/ })
      .getByLabel("Nalaz za klijenta")
      .fill("Dopunjen opis pregleda.");
    await panel.getByRole("button", { name: "Pregledaj ispravku" }).click();
    await expect(panel.getByText(/Završena radnja: Ponuda/)).toBeVisible();
    await expect(panel.locator(".totals")).toContainText("1");
    amendment.data.items[0].finding = "Dopunjen opis pregleda.";
    const amended = await owner.rpc("amend_report", {
      ...scoped,
      p_base_revision_id: revisionId,
      p_operation_id: randomUUID(),
      p_version: amendment.data.visitVersion,
      p_reason: "Dopunjen opis pregleda.",
      p_items: amendment.data.items,
    });
    expect(amended.error).toBeNull();
    await processJob(worker, (await claimJob(worker, amended.data))!);
    const updated = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: amended.data,
    });
    expect(updated.data.data.totals).toEqual({
      planned: 4,
      inspected: 3,
      actions: 1,
    });
    expect(updated.data.data.items[2].followUp.state).toBe("completed");
    expect(JSON.stringify(updated.data.data)).not.toContain("SECRET");
    const newPdf = await owner.storage
      .from("report-pdfs")
      .download(updated.data.artifact.path);
    expect(newPdf.error).toBeNull();
    const oldAgain = await owner.rpc("report_revision", {
      ...scoped,
      p_revision_id: revisionId,
    });
    expect(oldAgain.data.data).toEqual(old.data.data);
    expect(oldAgain.data.artifact.sha256).toBe(hash(originalPdf));
    const guestAgain = await guest.rpc("guest_report", { p_token: token });
    expect(guestAgain.data).toEqual(originalGuest.data);
    await page.goto(`/office/reports/${amended.data}`);
    await expect(page.getByText(/Završena radnja: Ponuda/)).toBeVisible();
    await mkdir("/tmp/hvac-follow-up-review", { recursive: true });
    await writeFile(
      `/tmp/hvac-follow-up-review/${info.project.name}-r1.pdf`,
      originalPdf,
    );
    await writeFile(
      `/tmp/hvac-follow-up-review/${info.project.name}-r2.pdf`,
      Buffer.from(await newPdf.data!.arrayBuffer()),
    );
  } finally {
    await owner.auth.signOut({ scope: "local" });
    await fixture.dispose();
  }
});
