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
  await expect(page.getByText("Remis").first()).not.toBeVisible();
  await page.getByRole("button", { name: /Community-Trend anzeigen/ }).first().click();
  await expect(page.getByText("Remis").first()).toBeVisible();
  await page.getByRole("button", { name: /Sichtbare Tipps speichern/ }).click();
  await expect(page.getByText("Test-Tipp gespeichert")).toBeVisible();
});

test("new unsaved tips start empty and can become an active zero", async ({ page }) => {
  await page.goto("/?test=1#start");
  await page.getByRole("button", { name: /Offene Tipps bearbeiten/ }).click();

  const emptyCard = page.locator(".match-card").nth(8);
  await expect(emptyCard.locator(".score-control strong").first()).toHaveText("-");
  await emptyCard.locator(".score-control button").first().click();
  await expect(emptyCard.locator(".score-control strong").first()).toHaveText("0");
  await expect(emptyCard.getByRole("button", { name: "Tipp speichern" })).toBeDisabled();
  await emptyCard.locator(".score-control").nth(1).locator("button").first().click();
  await expect(emptyCard.getByRole("button", { name: "Tipp speichern" })).toBeEnabled();
});

test("hidden Bundesliga test flow supports tips, bonus and ranking", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-start");

  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toBeVisible();
  await expect(page.getByText("Zugang aktiv")).toBeVisible();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einloggen" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Was fehlt noch?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meine Statistik" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Community" })).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Tippen" }).click();
  await expect(page).toHaveURL(/#bundesliga-tippen$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { name: "Spieltag tippen" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Was fehlt noch?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meine Statistik" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alle Tipps dieses Spieltags speichern" })).toBeVisible();
  await expect(page.getByText("Zum nächsten offenen Tipp")).toBeVisible();
  await expect(page.getByText("Live-Spieltag")).toBeVisible();
  await expect(page.getByText("versteckt bis Anpfiff").first()).toBeVisible();
  await expect(page.getByText("Fremde Tipps sind pro Spiel ab Anpfiff sichtbar.")).toBeVisible();
  await expect(page.getByText("Exaktes Ergebnis")).toBeVisible();
  await expect(page.locator(".bundesliga-rule-list").getByText("4 Punkte")).toBeVisible();
  await page.waitForTimeout(750);
  await expect(page.getByText("Bundesliga-Bonus automatisch gespeichert.")).toHaveCount(0);
  const evaluatedCard = page.locator(".bundesliga-user-match-card").first();
  await expect(evaluatedCard.getByText("Dein Tipp")).toBeVisible();
  await expect(evaluatedCard.locator(".score-control")).toHaveCount(0);
  const openCard = page.locator(".bundesliga-user-match-card").nth(1);
  await expect(openCard.locator(".score-control strong").first()).toHaveText("-");
  await openCard.locator(".score-control button").first().click();
  await openCard.locator(".score-control").nth(1).locator("button").first().click();
  await expect(openCard.locator(".score-control strong").first()).toHaveText("0");
  await expect(openCard.getByRole("button", { name: "Speichern" })).toBeEnabled();

  await page.getByRole("button", { name: "Bonus", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bonus tippen" })).toBeVisible();
  await expect(page.getByText("0/5 Bonus-Tipps erledigt")).toBeVisible();
  await page.getByRole("button", { name: /FC Bayern München/ }).first().click();
  await page.getByRole("button", { name: /Harry Kane/ }).click();
  await expect(page.getByRole("button", { name: "Bonus speichern" })).toBeVisible();

  await page.getByRole("button", { name: "Rangliste" }).click();
  await expect(page.getByRole("heading", { name: "Bundesliga Rangliste" })).toBeVisible();
  await expect(page.locator(".bundesliga-public-ranking").getByText("Daniel BL", { exact: true })).toBeVisible();
  await expect(page.locator(".bundesliga-public-ranking").getByText("Siege")).toBeVisible();
});

test("Bundesliga logout returns to the focused code login", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-start");

  await page.getByRole("button", { name: "Abmelden" }).click();
  await expect(page.getByRole("heading", { name: "Bundesliga starten" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Einloggen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tippen", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Was fehlt noch?" })).toHaveCount(0);
  await expect(page.getByText("Angemeldet als Daniel BL")).toHaveCount(0);
  await page.evaluate(() => { window.location.hash = "bundesliga-tippen"; });
  await expect(page).toHaveURL(/#bundesliga-start$/);
  await expect(page.getByRole("heading", { name: "Bundesliga starten" })).toBeVisible();
});
