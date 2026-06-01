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
  await expect(page.locator(".bundesliga-tip-stage").getByRole("heading", { name: "Spieltag tippen" })).toBeVisible();
  const mobileInfoToggle = page.getByText("Infos & Statistik", { exact: true });
  if (await mobileInfoToggle.isVisible()) await mobileInfoToggle.click();
  await expect(page.getByRole("heading", { name: "Was fehlt noch?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meine Statistik" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Alle Tipps dieses Spieltags speichern" })).toBeVisible();
  await expect(page.getByText("Zum nächsten offenen Tipp")).toBeVisible();
  await expect(page.getByText("Live-Spieltag")).toBeVisible();
  await expect(page.getByText("versteckt bis Anpfiff").first()).toBeVisible();
  await expect(page.getByText("Fremde Tipps werden pro Spiel ab Anpfiff sichtbar.")).toBeVisible();
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
  await page.getByLabel("Spielername").fill("Freitext Stürmer");
  await expect(page.getByText("Freitext Stürmer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bonus speichern" })).toBeVisible();

  await page.getByRole("button", { name: "Rangliste" }).click();
  await expect(page.getByRole("heading", { name: "Bundesliga Rangliste" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gesamtpunkte" })).toHaveClass(/active/);
  await expect(page.locator(".bundesliga-public-ranking").getByText("Daniel BL", { exact: true })).toBeVisible();
  await expect(page.locator(".bundesliga-ranking-podium").getByText("1 Spieltags-Siege")).toBeVisible();
  await page.getByRole("button", { name: "Punkteschnitt" }).click();
  await expect(page.locator(".bundesliga-ranking-podium article").filter({ hasText: "Daniel BL" }).getByText("1 gewertete Tipps")).toBeVisible();
  await expect(page.getByText("Bonuspunkte zählen nicht in den Schnitt.")).toBeVisible();
});

test("Bundesliga design variant keeps separate hashes and fits mobile", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-design-start");

  await expect(page.locator(".bundesliga-design-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toBeVisible();

  await page.getByRole("button", { name: "Tippen", exact: true }).click();
  await expect(page).toHaveURL(/#bundesliga-design-tippen$/);
  await expect(page.locator(".bundesliga-tip-stage").getByRole("heading", { name: "Spieltag tippen" })).toBeVisible();
  await expect(page.locator(".bundesliga-design-shell .bundesliga-user-match-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page).toHaveURL(/#bundesliga-design-spiel\/bl-test-1$/);
  await expect(page.getByRole("heading", { name: "Dein Tipp" })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/?test=1#bundesliga-design-tippen");
  await expect(page.locator(".bundesliga-design-shell")).toBeVisible();
  const mobileLayout = await page.locator(".bundesliga-user-match-card").nth(1).locator(".score-control").first().evaluate((control) => {
    const controlRect = control.getBoundingClientRect();
    return {
      buttonsFit: [...control.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top >= controlRect.top - 1 && rect.bottom <= controlRect.bottom + 1;
      }),
      bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(mobileLayout.buttonsFit).toBe(true);
  expect(mobileLayout.bodyOverflows).toBe(false);
});

test("Bundesliga variant C keeps experimental hashes and fits mobile", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-c-start");

  await expect(page.locator(".bundesliga-c-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toBeVisible();

  await page.getByRole("button", { name: "Tippen", exact: true }).click();
  await expect(page).toHaveURL(/#bundesliga-c-tippen$/);
  await expect(page.locator(".bundesliga-tip-stage").getByRole("heading", { name: "Spieltag tippen" })).toBeVisible();
  await expect(page.locator(".bundesliga-c-shell .bundesliga-user-match-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page).toHaveURL(/#bundesliga-c-spiel\/bl-test-1$/);
  await expect(page.getByRole("heading", { name: "Dein Tipp" })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/?test=1#bundesliga-c-tippen");
  await expect(page.locator(".bundesliga-c-shell")).toBeVisible();
  const mobileLayout = await page.locator(".bundesliga-user-match-card").nth(1).locator(".score-control").first().evaluate((control) => {
    const controlRect = control.getBoundingClientRect();
    return {
      buttonsFit: [...control.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top >= controlRect.top - 1 && rect.bottom <= controlRect.bottom + 1;
      }),
      bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(mobileLayout.buttonsFit).toBe(true);
  expect(mobileLayout.bodyOverflows).toBe(false);
});

test("Bundesliga variant D uses new UX shell and route family", async ({ page }) => {
  await page.goto("/?test=1#bundesliga-d-start");

  await expect(page.locator(".bundesliga-d-shell")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Matchday Operating System" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Schnellaktionen Variante D" })).toBeVisible();

  await page.getByRole("navigation", { name: "Schnellaktionen Variante D" }).getByRole("button", { name: "Tippen" }).click();
  await expect(page).toHaveURL(/#bundesliga-d-tippen$/);
  await expect(page.locator(".bundesliga-d-command.is-compact")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Schnellaktionen Variante D" })).toHaveCount(0);
  await expect(page.locator(".bundesliga-tip-stage").getByRole("heading", { name: "Spieltag tippen" })).toBeVisible();
  await expect(page.locator(".bundesliga-public-status")).toHaveCount(0);
  await expect(page.locator(".bundesliga-d-shell .bundesliga-user-match-card").first()).toBeVisible();

  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page).toHaveURL(/#bundesliga-d-spiel\/bl-test-1$/);
  await expect(page.getByRole("heading", { name: "Dein Tipp" })).toBeVisible();

  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/?test=1#bundesliga-d-tippen");
  await expect(page.locator(".bundesliga-d-shell")).toBeVisible();
  await expect(page.locator(".bundesliga-d-shell .bundesliga-more-toggle")).toBeHidden();
  await expect(page.getByRole("button", { name: "Tabelle", exact: true })).toBeVisible();
  const mobileLayout = await page.locator(".bundesliga-user-match-card").nth(1).locator(".score-control").first().evaluate((control) => {
    const controlRect = control.getBoundingClientRect();
    return {
      buttonsFit: [...control.querySelectorAll("button")].every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top >= controlRect.top - 1 && rect.bottom <= controlRect.bottom + 1;
      }),
      bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(mobileLayout.buttonsFit).toBe(true);
  expect(mobileLayout.bodyOverflows).toBe(false);
});

test("Bundesliga variant D has accessible polish for focus, touch and motion", async ({ page }) => {
  const routes = [
    "bundesliga-d-start",
    "bundesliga-d-tippen",
    "bundesliga-d-rangliste",
    "bundesliga-d-spielplan",
  ];

  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`/?test=1#${route}`);
      const audit = await page.evaluate(() => {
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const controls = [...document.querySelectorAll(".bundesliga-d-shell button, .bundesliga-d-shell a")]
          .filter(isVisible);
        const tinyControls = controls
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              text: element.textContent.trim().replace(/\s+/g, " "),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          .filter((control) => control.width < 40 || control.height < 40);
        const transitionAll = controls
          .map((element) => getComputedStyle(element).transitionProperty)
          .filter((value) => value.split(",").map((part) => part.trim()).includes("all"));
        const h1 = document.querySelector(".bundesliga-d-command-copy h1");
        const h1FontSize = h1 ? Number.parseFloat(getComputedStyle(h1).fontSize) : 0;
        return {
          bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          tinyControls,
          transitionAll,
          h1FontSize,
        };
      });

      expect(audit.bodyOverflows, `${route} at ${width}px should not overflow`).toBe(false);
      expect(audit.tinyControls, `${route} at ${width}px should keep touch targets at least 40px`).toEqual([]);
      expect(audit.transitionAll, `${route} at ${width}px should not use transition: all on visible controls`).toEqual([]);
      expect(audit.h1FontSize, `${route} at ${width}px should keep D display type below 96px`).toBeLessThanOrEqual(96);
    }
  }

  await page.goto("/?test=1#bundesliga-d-start");
  const quickNavTippen = page.getByRole("navigation", { name: "Schnellaktionen Variante D" }).getByRole("button", { name: "Tippen", exact: true });
  await quickNavTippen.focus();
  const focusStyle = await quickNavTippen.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(focusStyle.outlineWidth).not.toBe("0px");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?test=1&motion=reduce#bundesliga-d-live");
  const reducedMotion = await page.evaluate(() => {
    const atmosphere = document.querySelector(".bundesliga-d-atmosphere");
    const liveStatus = document.querySelector(".bundesliga-d-shell .bundesliga-match-status.status-live");
    return {
      atmosphereOpacity: atmosphere ? Number.parseFloat(getComputedStyle(atmosphere).opacity) : 1,
      liveAnimationName: liveStatus ? getComputedStyle(liveStatus).animationName : "none",
    };
  });
  expect(reducedMotion.atmosphereOpacity).toBeLessThanOrEqual(0.25);
  expect(reducedMotion.liveAnimationName).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("Bundesliga variant D avoids duplicated detail headers", async ({ page }) => {
  const routes = [
    ["bundesliga-d-tabelle", "Alle Teams mit Spielen, Toren, Differenz und Punkten."],
    ["bundesliga-d-torschuetzen", "OpenLigaDB-Liste für Torschützenkönig und Saisonüberblick."],
    ["bundesliga-d-spielplan", "Spieltag 1 · 2 Spiele · 1 deiner Tipps gespeichert."],
  ];

  for (const [route, summary] of routes) {
    await page.goto(`/?test=1#${route}`);
    await expect(page.locator(".bundesliga-d-command.is-compact")).toBeVisible();
    await expect(page.locator(".bundesliga-d-shell .bundesliga-detail-head")).toHaveCount(0);
    await expect(page.locator(".bundesliga-d-page-summary").getByText(summary, { exact: true })).toBeVisible();
  }
});

test("Bundesliga preview switches variants without leaving the current area", async ({ page }) => {
  await page.goto("/#bundesliga-start");
  await expect(page.getByRole("group", { name: "Bundesliga Variante testen" })).toBeVisible();

  await page.goto("/?test=1#bundesliga-tippen");

  const variantSwitch = page.getByRole("group", { name: "Bundesliga Variante testen" });
  await expect(variantSwitch).toBeVisible();
  await expect(variantSwitch.getByRole("button", { name: "A", exact: true })).toHaveClass(/active/);

  await variantSwitch.getByRole("button", { name: "D", exact: true }).click();
  await expect(page).toHaveURL(/#bundesliga-d-tippen$/);
  await expect(page.locator(".bundesliga-d-shell")).toBeVisible();
  await expect(variantSwitch.getByRole("button", { name: "D", exact: true })).toHaveClass(/active/);

  await variantSwitch.getByRole("button", { name: "C", exact: true }).click();
  await expect(page).toHaveURL(/#bundesliga-c-tippen$/);
  await expect(page.locator(".bundesliga-c-shell")).toBeVisible();

  await variantSwitch.getByRole("button", { name: "A", exact: true }).click();
  await expect(page).toHaveURL(/#bundesliga-tippen$/);
  await expect(page.locator(".bundesliga-design-shell, .bundesliga-c-shell, .bundesliga-d-shell")).toHaveCount(0);
});

test("Bundesliga variants keep controls and text inside their layouts", async ({ page }) => {
  const routes = [
    "bundesliga-start",
    "bundesliga-tippen",
    "bundesliga-rangliste",
    "bundesliga-tabelle",
    "bundesliga-spielplan",
    "bundesliga-design-start",
    "bundesliga-design-tippen",
    "bundesliga-design-rangliste",
    "bundesliga-c-start",
    "bundesliga-c-tippen",
    "bundesliga-c-rangliste",
    "bundesliga-d-start",
    "bundesliga-d-tippen",
    "bundesliga-d-rangliste",
    "bundesliga-d-tabelle",
    "bundesliga-d-spielplan",
  ];

  for (const width of [390, 360, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(`/?test=1#${route}`);
      const layout = await page.evaluate(() => {
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
        };
        const clippedControls = [...document.querySelectorAll("button, a")]
          .filter(isVisible)
          .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 3)
          .map((element) => element.textContent.trim().replace(/\s+/g, " "))
          .filter(Boolean);
        const scoreControlsFit = [...document.querySelectorAll(".score-control")]
          .filter(isVisible)
          .every((control) => {
            const controlRect = control.getBoundingClientRect();
            return [...control.querySelectorAll("button")].every((button) => {
              const rect = button.getBoundingClientRect();
              return rect.top >= controlRect.top - 1 && rect.bottom <= controlRect.bottom + 1;
            });
          });
        return {
          bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          clippedControls,
          scoreControlsFit,
        };
      });
      expect(layout.bodyOverflows, `${route} at ${width}px should not overflow document`).toBe(false);
      expect(layout.clippedControls, `${route} at ${width}px has clipped controls`).toEqual([]);
      expect(layout.scoreControlsFit, `${route} at ${width}px score controls should fit`).toBe(true);
    }
  }
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

  await expect(page.getByText("Archiv-Demo 2025/2026")).toBeVisible();
  await expect(page.getByText("Ohne Login ansehen: Beispieltipps zeigen den Ablauf. Änderungen sind nicht möglich.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Testdaten 25/26" })).toHaveCount(0);

  await page.getByRole("button", { name: "Tippen", exact: true }).click();
  await expect(page.getByText("Archivvorschau - Änderungen nicht möglich")).toBeVisible();
  await expect(page.locator(".bundesliga-user-match-card .score-control")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tipp speichern" })).toHaveCount(0);

  await page.getByRole("button", { name: "Bonus", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nur lesbar" })).toBeDisabled();

  if (await page.getByText("Mehr", { exact: true }).isVisible()) await page.getByText("Mehr", { exact: true }).click();
  await page.getByRole("button", { name: "Spielplan", exact: true }).click();
  await page.getByRole("button", { name: "Auswertung ansehen" }).first().click();
  await expect(page.getByText("Archivvorschau · nur lesbar")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Torverlauf" })).toBeVisible();
});

test("Bundesliga archive demo opens without login and uses its curated viewer", async ({ page }) => {
  await page.route("**/api/bundesliga-public-data", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      competition: { id: "bundesliga-2025", season_label: "2025/2026", public_enabled: false },
      showcaseParticipant: { id: "archive-showcase", display_name: "Archivgast (Demo)" },
      teams: [],
      bonusTeams: [],
      matches: [],
      results: [],
      topScorers: [],
      table: [],
      rulesSummary: { visibilityMode: "match_finished", visibility: "Fremde Tipps werden pro Spiel nach Abpfiff sichtbar." },
    }),
  }));
  await page.route("**/api/bundesliga-ranking", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      ranking: [
        { id: "archive-showcase", name: "Archivgast (Demo)", points: 58, matchPoints: 58, bonusPoints: 0, scoredTipCount: 34, matchdayWins: 2 },
        { id: "mara-showcase", name: "Mara (Demo)", points: 54, matchPoints: 54, bonusPoints: 0, scoredTipCount: 34, matchdayWins: 1 },
      ],
      personalStats: { savedTipCount: 34, scoredTipCount: 34, exactHits: 4, goalDiffHits: 7, tendencyHits: 9, wrongTips: 14, bestMatchdays: [] },
    }),
  }));
  await page.route("**/api/bundesliga-matchday-live**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ live: { standings: [], matches: [] }, trends: [] }),
  }));

  await page.goto("/?blCompetition=bundesliga-2025#bundesliga-start");

  await expect(page.getByRole("heading", { name: "Hallo Archivgast (Demo)" })).toBeVisible();
  await expect(page.getByText("Archiv-Demo ohne Login. Eingaben und Speichern sind deaktiviert.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Einloggen" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abmelden" })).toHaveCount(0);
});

test("retired Bundesliga live probe link no longer opens a participant session", async ({ page }) => {
  await page.goto("/?test=1&blCompetition=bundesliga-liveprobe-rel-2026#bundesliga-start");

  await expect(page.getByRole("heading", { name: "Liveprobe abgeschlossen" })).toBeVisible();
  await expect(page.getByText("Die Relegations-Generalprobe wurde erfolgreich beendet und ihre Testdaten werden entfernt.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Bundesliga 2026/2027" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toHaveCount(0);
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

  if (await page.getByText("Mehr", { exact: true }).isVisible()) await page.getByText("Mehr", { exact: true }).click();
  await page.getByRole("button", { name: "Spielplan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Spielplan noch nicht verfügbar" })).toBeVisible();

  await page.getByRole("button", { name: "Bonus", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bonusfragen werden vorbereitet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bonus speichern" })).toHaveCount(0);
});

test("Bundesliga live page shows provisional score updates and fits compact score controls", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bundesliga-tippspiel-participant", JSON.stringify({
      id: "live-user",
      name: "Daniel",
      code: "BL-LIVE",
      competitionId: "bundesliga-2026",
    }));
  });
  const liveMatch = {
    id: "live-match",
    matchday: 1,
    match_number: 1,
    phase: "league",
    kickoff_at: "2026-05-25T18:30:00.000Z",
    team_a_id: "home",
    team_b_id: "away",
    team_a_name: "SC Paderborn 07",
    team_b_name: "VfL Wolfsburg",
  };
  const publicPayload = {
    competition: { id: "bundesliga-2026", season_label: "2026/2027", public_enabled: false },
    teams: [
      { id: "home", name: "SC Paderborn 07", logo_url: "" },
      { id: "away", name: "VfL Wolfsburg", logo_url: "" },
    ],
    matches: [liveMatch],
    results: [{ match_id: "live-match", score_a: 1, score_b: 0, status: "live" }],
    topScorers: [],
    table: [],
    rulesSummary: { visibilityMode: "kickoff", visibility: "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar." },
  };
  await page.route("**/api/bundesliga-public-data", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(publicPayload) }));
  await page.route("**/api/bundesliga-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tips: [{ match_id: "live-match", score_a: 1, score_b: 0 }] }) }));
  await page.route("**/api/bundesliga-bonus-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ bonusTip: null }) }));
  await page.route("**/api/bundesliga-ranking", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) }));
  await page.route("**/api/bundesliga-matchday-live**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      live: {
        standings: [{ participantId: "live-user", name: "Daniel", points: 4 }],
        matches: [{
          id: "live-match",
          kickoffAt: liveMatch.kickoff_at,
          teamA: liveMatch.team_a_name,
          teamB: liveMatch.team_b_name,
          result: { score_a: 1, score_b: 0, status: "live" },
          status: "live",
          tipsVisible: true,
          updatedAt: "2026-05-25T18:42:00.000Z",
          goals: [{ id: "goal-1", minute: 12, scorerName: "Live Torschütze", isPenalty: false, isOwnGoal: false }],
          tips: [{ participantId: "live-user", participantName: "Daniel", isOwnTip: true, visible: true, scoreA: 1, scoreB: 0, points: 4, reason: "exakt getroffen: 4 Punkte (vorläufig)", provisional: true }],
        }],
      },
      trends: [],
    }),
  }));

  await page.goto("/#bundesliga-live");
  await expect(page.getByText("LIVE · Punkte vorläufig")).toBeVisible();
  await expect(page.getByText("Live Torschütze")).toBeVisible();
  await expect(page.getByText(/Zuletzt aktualisiert:/)).toBeVisible();
  await expect(page.getByText(/Zwischenstand und Punkte sind vorläufig/)).toBeVisible();
  await page.getByRole("button", { name: "Aktualisieren", exact: true }).click();
  await expect(page.getByText("Live-Daten neu geladen.")).toBeVisible();

  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?test=1#bundesliga-tippen");
    const mobileLayout = await page.locator(".bundesliga-user-match-card").nth(1).locator(".score-control").first().evaluate((control) => {
      const controlRect = control.getBoundingClientRect();
      return {
        buttonsFit: [...control.querySelectorAll("button")].every((button) => {
          const rect = button.getBoundingClientRect();
          return rect.top >= controlRect.top - 1 && rect.bottom <= controlRect.bottom + 1;
        }),
        bodyOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    expect(mobileLayout.buttonsFit).toBe(true);
    expect(mobileLayout.bodyOverflows).toBe(false);
  }
});

test("Bundesliga tips warn before kickoff with an unsaved countdown", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bundesliga-tippspiel-participant", JSON.stringify({
      id: "countdown-user",
      name: "Daniel",
      code: "BL-COUNTDOWN",
      competitionId: "bundesliga-2026",
    }));
  });
  const closingKickoff = new Date(Date.now() + 45_000).toISOString();
  await page.route("**/api/bundesliga-public-data", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      competition: { id: "bundesliga-2026", season_label: "2026/2027", public_enabled: false },
      teams: [
        { id: "home", name: "SC Paderborn 07", logo_url: "" },
        { id: "away", name: "VfL Wolfsburg", logo_url: "" },
      ],
      matches: [{
        id: "closing-match",
        matchday: 1,
        match_number: 1,
        phase: "league",
        kickoff_at: closingKickoff,
        team_a_id: "home",
        team_b_id: "away",
        team_a_name: "SC Paderborn 07",
        team_b_name: "VfL Wolfsburg",
      }],
      results: [],
      topScorers: [],
      table: [],
      rulesSummary: { visibilityMode: "kickoff", visibility: "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar." },
    }),
  }));
  await page.route("**/api/bundesliga-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tips: [] }) }));
  await page.route("**/api/bundesliga-bonus-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ bonusTip: null }) }));
  await page.route("**/api/bundesliga-ranking", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) }));
  await page.route("**/api/bundesliga-matchday-live**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ live: { standings: [], matches: [] }, trends: [] }) }));

  await page.goto("/#bundesliga-tippen");
  const countdown = page.locator(".bundesliga-tip-countdown.is-urgent");
  await expect(countdown).toContainText("Schließt in 00:");
  await expect(countdown).toContainText("Noch nicht gespeichert");
});

test("Bundesliga live fallback waits visibly for goal events", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("bundesliga-tippspiel-participant", JSON.stringify({
      id: "fallback-user",
      name: "Daniel",
      code: "BL-FALLBACK",
      competitionId: "bundesliga-2026",
    }));
  });
  const fallbackMatch = {
    id: "fallback-match", matchday: 1, match_number: 1, phase: "league",
    kickoff_at: "2026-08-21T18:30:00.000Z",
    team_a_id: "home", team_b_id: "away", team_a_name: "FC Bayern München", team_b_name: "RB Leipzig",
  };
  await page.route("**/api/bundesliga-public-data", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    competition: { id: "bundesliga-2026", season_label: "2026/2027", public_enabled: false },
    teams: [], matches: [fallbackMatch], results: [], topScorers: [], table: [],
    rulesSummary: { visibilityMode: "kickoff", visibility: "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar." },
  }) }));
  await page.route("**/api/bundesliga-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tips: [] }) }));
  await page.route("**/api/bundesliga-bonus-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ bonusTip: null }) }));
  await page.route("**/api/bundesliga-ranking", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) }));
  await page.route("**/api/bundesliga-matchday-live**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({
    live: { standings: [], matches: [{
      id: "fallback-match", kickoffAt: fallbackMatch.kickoff_at, teamA: fallbackMatch.team_a_name, teamB: fallbackMatch.team_b_name,
      result: { score_a: 0, score_b: 1, status: "live" }, status: "live", tips: [], tipsVisible: true,
      goals: [], goalsPending: true, updatedAt: "2026-08-21T18:33:00.000Z",
    }] }, trends: [],
  }) }));
  await page.goto("/#bundesliga-live");
  await expect(page.getByText("LIVE · Punkte vorläufig")).toBeVisible();
  await expect(page.getByText("Torereignisse folgen.")).toBeVisible();
});

test("Bundesliga community respects private visibility and mobile more navigation", async ({ page }, testInfo) => {
  let visibilityMode = "never";
  await page.addInitScript(() => {
    window.localStorage.setItem("bundesliga-tippspiel-participant", JSON.stringify({
      id: "privacy-user",
      name: "Daniel",
      code: "BL-PRIVACY",
      competitionId: "bundesliga-2026",
    }));
  });
  await page.route("**/api/bundesliga-public-data", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      competition: { id: "bundesliga-2026", season_label: "2026/2027", public_enabled: false },
      teams: [{ id: "team-1", name: "Team Eins", short_name: "Eins" }],
      matches: [],
      results: [],
      topScorers: [],
      table: [],
      rulesSummary: {
        matchPoints: [["Exaktes Ergebnis", "4 Punkte"]],
        visibility: visibilityMode === "never"
          ? "Fremde Tipps bleiben während der Saison verborgen."
          : "Fremde Tipps werden pro Spiel nach Abpfiff sichtbar.",
        visibilityMode,
        tieBreaker: "Bei Punktgleichstand zählen zuerst die Spieltagssiege.",
      },
    }),
  }));
  await page.route("**/api/bundesliga-ranking", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ranking: [] }) }));
  await page.route("**/api/bundesliga-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ tips: [] }) }));
  await page.route("**/api/bundesliga-bonus-tips", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ bonusTip: null }) }));

  await page.goto("/#bundesliga-rangliste");
  await expect(page.getByText("Noch keine Rangliste")).toBeVisible();
  await expect(page.locator(".bundesliga-ranking-podium")).toHaveCount(0);
  await expect(page.locator(".bundesliga-current-rank")).toHaveCount(0);
  await expect(page.getByText("Teilnehmervergleiche sind für diese Saison deaktiviert. Deine Tipps bleiben privat.")).toBeVisible();
  await expect(page.getByText("Vergleich ab Anpfiff")).toHaveCount(0);
  await expect(page.getByText("Fremde Tipps bleiben während der Saison verborgen.")).toBeVisible();

  visibilityMode = "match_finished";
  await page.reload();
  await expect(page.getByText("Vergleich nach Abpfiff")).toBeVisible();
  await expect(page.getByText("Fremde Tipps werden pro Spiel nach Abpfiff sichtbar.")).toBeVisible();

  if (testInfo.project.name === "mobile") {
    await expect(page.getByText("Mehr", { exact: true })).toBeVisible();
    await page.getByText("Mehr", { exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Weitere Bundesliga-Bereiche" })).toBeVisible();
    await page.getByRole("button", { name: "Torschützen", exact: true }).click();
    await expect(page).toHaveURL(/#bundesliga-torschuetzen$/);
  }
});
