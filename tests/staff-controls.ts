import type { Page } from "@playwright/test";

export async function openWorkspaceControls(page: Page) {
  const panel = page.locator("details[data-workspace-controls]:visible");
  if (await panel.getAttribute("open") === null) await panel.locator("summary").click();
}
