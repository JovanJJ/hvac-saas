import type { Page } from "@playwright/test";

export async function openWorkspaceControls(page: Page) {
  const panel = page.locator("details[data-workspace-controls]:visible");
  if (await panel.getAttribute("open") === null) await panel.locator("summary").click();
}

export async function openStaffMenu(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 1024) {
    const summary = page.locator("summary:visible").filter({ hasText: "Meni tima" });
    if (await summary.locator("..").getAttribute("open") === null) await summary.click();
  }
  return page.getByRole("navigation", { name: "Navigacija tima", exact: true });
}
