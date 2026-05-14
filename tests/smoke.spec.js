import { expect, test } from "@playwright/test";

test("test mode shows the full scoring chain", async ({ page }) => {
  await page.goto("/?test=1#start");

  await expect(page.getByRole("heading", { name: "Testmodus aktiv" })).toBeVisible();
  await expect(page.getByText("Alles greift")).toBeVisible();
  await expect(page.getByText("11").first()).toBeVisible();
  await expect(page.getByText("Spielpunkte", { exact: true })).toBeVisible();
  await expect(page.getByText("Bonuspunkte", { exact: true })).toBeVisible();
  await expect(page.getByText("Gesamtpunkte", { exact: true })).toBeVisible();
  await expect(page.getByText("33").first()).toBeVisible();

  await expect(page.getByText("Exaktes Ergebnis")).toBeVisible();
  await expect(page.getByText("Tendenz + Tordifferenz")).toBeVisible();
  await expect(page.getByText("Richtige Tendenz")).toBeVisible();
  await expect(page.getByText("Falsche Tendenz")).toBeVisible();
  await expect(page.getByText("Remis-Tendenz")).toBeVisible();
});

test("test mode ranking includes total and average views", async ({ page }) => {
  await page.goto("/?test=1#start");

  await page.getByRole("button", { name: "Rangliste ansehen" }).click();
  await expect(page).toHaveURL(/#rangliste$/);
  await expect(page.getByRole("heading", { name: "Rangliste" }).first()).toBeVisible();
  await expect(page.getByRole("row", { name: "1 Testkind 8 11 22 33" })).toBeVisible();
  await expect(page.getByRole("row", { name: "2 Agapi 8 14 6 20" })).toBeVisible();
  await expect(page.getByRole("row", { name: "3 Clemens 4 10 2 12" })).toBeVisible();

  await page.getByRole("button", { name: "Durchschnitt" }).click();
  await expect(page.getByRole("row", { name: "1 Clemens 4 3 3.33 10" })).toBeVisible();
  await expect(page.getByRole("row", { name: "2 Agapi 8 5 2.80 14" })).toBeVisible();
  await expect(page.getByRole("row", { name: "3 Testkind 8 5 2.20 11" })).toBeVisible();
  await expect(page.getByText("Tipps zeigt alle gespeicherten Spieltipps")).toBeVisible();
  await expect(page.getByText("Bonuspunkte sind nicht eingerechnet")).toBeVisible();
  await expect(page.getByText("3.33")).toBeVisible();
  await expect(page.getByText("2.80")).toBeVisible();
  await expect(page.getByText("2.20")).toBeVisible();
});

test("test mode keeps tips editable without touching Supabase", async ({ page }) => {
  await page.goto("/?test=1#start");

  await page.getByRole("button", { name: /Offene Tipps bearbeiten/ }).click();
  await expect(page).toHaveURL(/#tippen$/);
  await expect(page.getByRole("heading", { name: "WM-Plan tippen" })).toBeVisible();
  await expect(page.getByText("anonym ausgewertet")).toHaveCount(0);
  await page.getByRole("button", { name: /Community-Trend anzeigen/ }).first().click();
  await expect(page.getByText("anonym ausgewertet").first()).toBeVisible();
  await expect(page.getByText("Häufigster Tipp").first()).toBeVisible();
  await page.getByRole("button", { name: /Sichtbare Tipps speichern/ }).click();
  await expect(page.getByText("Test-Tipp gespeichert")).toBeVisible();
});
