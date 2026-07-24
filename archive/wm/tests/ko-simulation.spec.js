import { test, expect } from "@playwright/test";

test("WM-Simulation spielt eine komplette WM bis zum Sieger durch", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/?test=1#simulation");

  await expect(page.locator(".ko-sim")).toBeVisible();
  // Vor der Simulation: kein Weltmeister, Hinweis sichtbar
  await expect(page.locator(".ko-sim-champion")).toHaveCount(0);

  await page.getByRole("button", { name: "Komplette WM simulieren" }).click();

  // Weltmeister steht fest und Gruppentabellen sind befüllt
  await expect(page.locator(".ko-sim-champion")).toBeVisible();
  await expect(page.locator(".ko-sim-group")).toHaveCount(12);
  // Finale ist aufgelöst (kein Platzhalter mehr)
  const finalRound = page.locator(".ko-sim-round").last();
  await expect(finalRound.locator(".ko-sim-match")).toHaveCount(1);
  await expect(finalRound.locator(".ko-sim-match.is-pending")).toHaveCount(0);
});

test("WM-Simulation Tab ist nur im Testmodus erreichbar", async ({ page }) => {
  await page.goto("/#simulation");
  // Ohne Testmodus wird auf Start umgeleitet, Simulation wird nicht gerendert
  await expect(page.locator(".ko-sim")).toHaveCount(0);
});
