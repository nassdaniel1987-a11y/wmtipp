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

  await expect(page.locator(".bundesliga-archive-banner")).toHaveCount(0);
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

test("finished Bundesliga matches open the personal match evaluation", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-tippen");

  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page).toHaveURL(/#bundesliga-spiel\/bl-test-1$/);
  await expect(page.getByText("Endergebnis")).toBeVisible();
  await expect(page.getByText("2:1").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dein Tipp" })).toBeVisible();
  await expect(page.locator(".bundesliga-own-match-tip").getByText("exakt getroffen: 4 Punkte")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Torverlauf" })).toBeVisible();
  await expect(page.getByText("Harry Kane")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tippübersicht" })).toBeVisible();
  await expect(page.getByText("Aaron BL")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tippverteilung" })).toBeVisible();
  await expect(page.getByText("2 sichtbare Tipps")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});

test("Bundesliga archive preview is visibly read-only", async ({ page }) => {
  await page.goto("/?test=1&blCompetition=bundesliga-2025#bundesliga-start");

  await expect(page.getByText("Interne Archivvorschau 2025/2026")).toBeVisible();
  await expect(page.getByText("Nur lesbar. Neue Codes, Tipps und Bonusänderungen laufen ausschließlich in 2026/2027.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Testdaten 25/26" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tippen", exact: true }).click();
  await expect(page.getByText("Archivvorschau - Änderungen nicht möglich")).toBeVisible();
  await expect(page.locator(".bundesliga-user-match-card .score-control")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tipp speichern" })).toHaveCount(0);

  await page.getByRole("button", { name: "Bonus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nur lesbar" })).toBeDisabled();

  await page.getByRole("button", { name: "Spielplan", exact: true }).click();
  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page.getByText("Archivvorschau · nur lesbar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Torverlauf" })).toBeVisible();
});

test("empty Bundesliga 2026 season shows a clear preseason state", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bundesliga-tippspiel-participant", JSON.stringify({
      id: "preview-user",
      name: "Daniel",
      code: "BL-PREVIEW",
      competitionId: "bundesliga-2026",
    }));
  });
  await page.route("**/api/bundesliga-public-data", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        competition: { id: "bundesliga-2026", season_label: "2026/2027", public_enabled: false },
        teams: [],
        matches: [],
        results: [],
        topScorers: [],
        table: [],
        rulesSummary: {},
      }),
    });
  });
  await page.route("**/api/bundesliga-ranking", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) });
  });
  await page.route("**/api/bundesliga-tips", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ tips: [] }) });
  });
  await page.route("**/api/bundesliga-bonus-tips", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ bonusTip: null }) });
  });

  await page.goto("/#bundesliga-start");

  await expect(page.getByRole("heading", { name: "Hallo Daniel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Spielplan 2026/27 noch nicht verfügbar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saisonstatus" })).toBeVisible();
  await expect(page.getByText("Spielplan wird vorbereitet")).toBeVisible();
  await expect(page.getByText("Alles bereit")).toHaveCount(0);
  await expect(page.getByText("ST 1", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Tippen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Noch keine Spiele zum Tippen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alle Tipps dieses Spieltags speichern" })).toHaveCount(0);

  await page.getByRole("button", { name: "Spielplan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Spielplan noch nicht verfügbar" })).toBeVisible();

  await page.getByRole("button", { name: "Bonus", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bonusfragen werden vorbereitet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bonus speichern" })).toHaveCount(0);
});
