import { expect, test } from "@playwright/test";

// Die WM ist abgeschlossen. Der oeffentliche Einstieg ist jetzt die Bundesliga;
// das WM-Tippspiel bleibt nur als Read-only-Rueckblick unter #wm-archiv sowie im
// Admin/Archiv erreichbar. Die frueheren WM-Test-Modus-Smoketests (#start, #tippen,
// #rangliste) wurden entfernt, da diese Teilnehmeroberflaeche nicht mehr der
// Standard ist; die WM-KO-Simulation liegt unter archive/wm/.

test("default entry without hash shows the Bundesliga app", async ({ page }) => {
  await page.goto("/?test=1");

  await expect(page.getByRole("heading", { name: "Hallo Daniel BL" })).toBeVisible();
  await expect(page.locator(".app-shell.wm-archive")).toHaveCount(0);
});

test("#wm-archiv opens the read-only WM retrospective", async ({ page }) => {
  await page.goto("/?test=1#wm-archiv");

  await expect(page.locator(".app-shell.wm-archive")).toBeVisible();
  await expect(page.getByText("Die WM 2026 ist abgeschlossen.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zur Bundesliga" }).first()).toBeVisible();
  // Kein Tippen/Speichern im Rueckblick.
  await expect(page.getByRole("button", { name: /speichern/i })).toHaveCount(0);
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

test("Bundesliga layout keeps controls and text inside the design A routes", async ({ page }) => {
  const routes = [
    "bundesliga-start",
    "bundesliga-tippen",
    "bundesliga-rangliste",
    "bundesliga-tabelle",
    "bundesliga-spielplan",
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
