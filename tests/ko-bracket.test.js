import assert from "node:assert/strict";
import test from "node:test";
import {
  GROUP_KEYS,
  FIFA_THIRD_PLACE_ASSIGNMENTS,
  knockoutMatches,
  knockoutPlaceholderPairing,
  computeGroupStandings,
  rankThirdPlaced,
  resolveKnockout,
  resolveKnownGroupSlots,
  buildKnockout,
} from "../src/koBracket.js";

function finalResult(scoreA, scoreB, extra = {}) {
  return { score_a: scoreA, score_b: scoreB, status: "final", ...extra };
}

// 4er-Gruppe als Round-Robin: T1>T2>T3>T4
function buildGroup(prefix, teams) {
  const [a, b, c, d] = teams;
  return [
    { id: `${prefix}1`, groupKey: prefix, teamA: a, teamB: b },
    { id: `${prefix}2`, groupKey: prefix, teamA: a, teamB: c },
    { id: `${prefix}3`, groupKey: prefix, teamA: a, teamB: d },
    { id: `${prefix}4`, groupKey: prefix, teamA: b, teamB: c },
    { id: `${prefix}5`, groupKey: prefix, teamA: b, teamB: d },
    { id: `${prefix}6`, groupKey: prefix, teamA: c, teamB: d },
  ];
}

test("computeGroupStandings sortiert nach Punkten, Tordifferenz, Toren", () => {
  const matches = buildGroup("A", ["T1", "T2", "T3", "T4"]);
  const results = new Map([
    ["A1", finalResult(1, 0)], // T1>T2
    ["A2", finalResult(2, 0)], // T1>T3
    ["A3", finalResult(3, 0)], // T1>T4
    ["A4", finalResult(1, 0)], // T2>T3
    ["A5", finalResult(1, 0)], // T2>T4
    ["A6", finalResult(1, 0)], // T3>T4
  ]);
  const standings = computeGroupStandings(matches, results);
  const table = standings.get("A");
  assert.deepEqual(table.map((row) => row.team), ["T1", "T2", "T3", "T4"]);
  assert.deepEqual(table.map((row) => row.rank), [1, 2, 3, 4]);
  assert.equal(table[0].points, 9);
  assert.equal(table[3].points, 0);
});

test("computeGroupStandings ignoriert nicht-finale Ergebnisse", () => {
  const matches = buildGroup("A", ["T1", "T2", "T3", "T4"]);
  const results = new Map([["A1", { score_a: 5, score_b: 0, status: "live" }]]);
  const standings = computeGroupStandings(matches, results);
  assert.ok(standings.get("A").every((row) => row.played === 0 && row.points === 0));
});

test("rankThirdPlaced ordnet die Gruppendritten und markiert die besten 8", () => {
  // Zwei Gruppen mit unterschiedlich starken Dritten.
  const matches = [...buildGroup("A", ["A1", "A2", "A3", "A4"]), ...buildGroup("B", ["B1", "B2", "B3", "B4"])];
  const results = new Map([
    // Gruppe A: A3 wird Dritter mit 3 Punkten
    ["A1", finalResult(1, 0)], ["A2", finalResult(1, 0)], ["A3", finalResult(1, 0)],
    ["A4", finalResult(1, 0)], ["A5", finalResult(1, 0)], ["A6", finalResult(1, 0)],
    // Gruppe B: B3 wird Dritter mit 0 Punkten (B3 verliert alles)
    ["B1", finalResult(1, 0)], ["B2", finalResult(1, 0)], ["B3", finalResult(1, 0)],
    ["B4", finalResult(0, 1)], ["B5", finalResult(1, 0)], ["B6", finalResult(0, 1)],
  ]);
  const standings = computeGroupStandings(matches, results);
  const thirds = rankThirdPlaced(standings);
  assert.equal(thirds.length, 2);
  assert.equal(thirds[0].seed, 1);
  assert.equal(thirds[0].team, "A3"); // mehr Punkte als B3 -> seed 1
  assert.ok(thirds.every((row) => row.qualified === true)); // nur 2 -> beide < 8
});

test("FIFA Annex C ist vollständig hinterlegt", () => {
  assert.equal(FIFA_THIRD_PLACE_ASSIGNMENTS.size, 495);
});

test("resolveKnockout füllt Teams, propagiert Sieger/Verlierer und respektiert Elfmeter-Sieger", () => {
  const matches = [
    { id: "m1", round: "r32", slotA: { kind: "group", group: "A", rank: 1 }, slotB: { kind: "third", seed: 1 } },
    { id: "m2", round: "r32", slotA: { kind: "group", group: "A", rank: 2 }, slotB: { kind: "third", seed: 2 } },
    { id: "final", round: "final", slotA: { kind: "winner", match: "m1" }, slotB: { kind: "winner", match: "m2" } },
    { id: "third", round: "third", slotA: { kind: "loser", match: "m1" }, slotB: { kind: "loser", match: "m2" } },
  ];
  const standings = new Map([["A", [
    { team: "A1", rank: 1 }, { team: "A2", rank: 2 }, { team: "A3", rank: 3 }, { team: "A4", rank: 4 },
  ]]]);
  const thirds = [{ team: "TH1", seed: 1, qualified: true }, { team: "TH2", seed: 2, qualified: true }];
  const results = new Map([
    ["m1", finalResult(2, 1)],            // A1 schlägt TH1
    ["m2", finalResult(0, 0, { winner: "B" })], // Remis, TH2 gewinnt im Elfmeterschießen
  ]);

  const bracket = resolveKnockout({ standings, thirds, matches, resultsByMatchId: results });
  const byId = new Map(bracket.map((row) => [row.id, row]));

  assert.deepEqual([byId.get("m1").teamA, byId.get("m1").teamB], ["A1", "TH1"]);
  assert.equal(byId.get("m1").winner, "A1");
  assert.equal(byId.get("m1").loser, "TH1");
  assert.equal(byId.get("m2").winner, "TH2"); // Elfmeter-Sieger
  // Finale: Sieger aus m1 vs m2
  assert.deepEqual([byId.get("final").teamA, byId.get("final").teamB], ["A1", "TH2"]);
  // Spiel um Platz 3: Verlierer aus m1 vs m2
  assert.deepEqual([byId.get("third").teamA, byId.get("third").teamB], ["TH1", "A2"]);
});

test("resolveKnockout lässt unbestimmte Slots leer und erlaubt Admin-Override", () => {
  const matches = [
    { id: "m1", round: "r32", slotA: { kind: "group", group: "A", rank: 1 }, slotB: { kind: "third", seed: 5 } },
  ];
  const standings = new Map([["A", [{ team: "A1", rank: 1 }]]]);
  const thirds = []; // seed 5 nicht vorhanden -> null

  const auto = resolveKnockout({ standings, thirds, matches });
  assert.equal(auto[0].teamA, "A1");
  assert.equal(auto[0].teamB, null);
  assert.equal(auto[0].resolved, false);
  assert.equal(auto[0].labelB, "Bester Dritter (5)");

  const overridden = resolveKnockout({
    standings,
    thirds,
    matches,
    manualPairings: new Map([["m1", { teamB: "Wildcard" }]]),
  });
  assert.equal(overridden[0].teamB, "Wildcard");
  assert.equal(overridden[0].resolved, true);
});

test("knockoutMatches ist strukturell vollständig (32 Spiele, jede Gruppenplatzierung genau einmal)", () => {
  assert.equal(knockoutMatches.length, 32);
  const r32 = knockoutMatches.filter((m) => m.round === "r32");
  assert.equal(r32.length, 16);

  const groupSlots = [];
  let thirdSlots = 0;
  for (const match of r32) {
    for (const slot of [match.slotA, match.slotB]) {
      if (slot.kind === "group") groupSlots.push(`${slot.rank}${slot.group}`);
      if (slot.kind === "third") {
        thirdSlots += 1;
        assert.ok(Array.isArray(slot.allowed) && slot.allowed.length > 0, "Drittel-Slot braucht erlaubte Gruppen");
      }
    }
  }
  // 12 Sieger + 12 Zweite = 24 Gruppen-Slots, jeder genau einmal
  assert.equal(groupSlots.length, 24);
  assert.equal(new Set(groupSlots).size, 24);
  for (const group of GROUP_KEYS) {
    assert.ok(groupSlots.includes(`1${group}`), `Sieger Gruppe ${group} fehlt`);
    assert.ok(groupSlots.includes(`2${group}`), `Zweiter Gruppe ${group} fehlt`);
  }
  // 8 Drittel-Slots aus festen Gruppensets
  assert.equal(thirdSlots, 8);

  // Stichproben offizieller Paarungen (FIFA 2026)
  const byNumber = new Map(knockoutMatches.map((m) => [m.matchNumber, m]));
  assert.deepEqual(
    [byNumber.get(73).slotA, byNumber.get(73).slotB],
    [{ kind: "group", group: "A", rank: 2 }, { kind: "group", group: "B", rank: 2 }],
  );
  assert.equal(byNumber.get(74).slotA.group, "E");
  assert.equal(byNumber.get(104).round, "final");
  assert.equal(byNumber.get(103).round, "third");
});

test("knockoutPlaceholderPairing setzt ein KO-Spiel auf Platzhalter ohne Flaggen zurück", () => {
  assert.deepEqual(knockoutPlaceholderPairing("ko-r32-02"), {
    id: "ko-r32-02",
    matchNumber: 74,
    round: "r32",
    roundLabel: "Runde der letzten 32",
    team_a: "Sieger Gruppe E",
    team_b: "Dritter aus A/B/C/D/F",
    flag_code_a: "",
    flag_code_b: "",
  });
});

test("assignThirdSlots ordnet acht Dritte regelkonform den offiziellen Slots zu", () => {
  // Alle zwölf Gruppendritten als Kandidaten; beste 8 qualifizieren sich.
  const standings = new Map(
    GROUP_KEYS.map((group, index) => [
      group,
      [
        { team: `${group}1`, group, rank: 1 },
        { team: `${group}2`, group, rank: 2 },
        // Punktstärke fällt mit dem Gruppenindex, damit A..H die besten 8 sind.
        { team: `${group}3`, group, rank: 3, points: 12 - index, goalDiff: 0, goalsFor: 0 },
        { team: `${group}4`, group, rank: 4 },
      ],
    ]),
  );
  const thirds = rankThirdPlaced(standings);
  const qualified = thirds.filter((t) => t.qualified);
  assert.equal(qualified.length, 8);

  const bracket = resolveKnockout({ standings, thirds });
  const thirdEntries = bracket.filter((m) => m.slotB?.kind === "third" || m.slotA?.kind === "third");
  // Alle acht Drittel-Slots sind belegt ...
  const assignedThirds = thirdEntries
    .map((m) => (m.slotA?.kind === "third" ? m.teamB : m.teamB))
    .filter(Boolean);
  assert.equal(assignedThirds.length, 8);
  // ... jeder qualifizierte Dritte genau einmal, und nur erlaubte Gruppen je Slot.
  assert.equal(new Set(assignedThirds).size, 8);
  for (const match of thirdEntries) {
    const slot = match.slotA?.kind === "third" ? match.slotA : match.slotB;
    const team = match.slotA?.kind === "third" ? match.teamA : match.teamB;
    const group = team.replace(/3$/, "");
    assert.ok(slot.allowed.includes(group), `Gruppe ${group} ist in Slot ${match.id} nicht erlaubt`);
  }
});

test("assignThirdSlots folgt FIFA Annex C statt freiem Matching", () => {
  const qualifiedGroups = new Set(["D", "F", "G", "H", "I", "J", "K", "L"]);
  const standings = new Map(
    GROUP_KEYS.map((group) => [
      group,
      [
        { team: `${group}1`, group, rank: 1, points: 9, goalDiff: 3, goalsFor: 5 },
        { team: `${group}2`, group, rank: 2, points: 6, goalDiff: 1, goalsFor: 4 },
        {
          team: `${group}3`,
          group,
          rank: 3,
          points: qualifiedGroups.has(group) ? 4 : 0,
          goalDiff: qualifiedGroups.has(group) ? 0 : -5,
          goalsFor: qualifiedGroups.has(group) ? 3 : 0,
        },
        { team: `${group}4`, group, rank: 4, points: 0, goalDiff: -6, goalsFor: 0 },
      ],
    ]),
  );
  const thirds = rankThirdPlaced(standings);
  const bracket = resolveKnockout({ standings, thirds });
  const byNumber = new Map(bracket.map((match) => [match.matchNumber, match]));

  assert.equal(byNumber.get(79).teamB, "H3"); // FIFA column 1A
  assert.equal(byNumber.get(85).teamB, "G3"); // FIFA column 1B
  assert.equal(byNumber.get(81).teamB, "I3"); // FIFA column 1D
  assert.equal(byNumber.get(74).teamB, "D3"); // FIFA column 1E
  assert.equal(byNumber.get(82).teamB, "J3"); // FIFA column 1G
  assert.equal(byNumber.get(77).teamB, "F3"); // FIFA column 1I
  assert.equal(byNumber.get(87).teamB, "L3"); // FIFA column 1K
  assert.equal(byNumber.get(80).teamB, "K3"); // FIFA column 1L
});

test("resolveKnownGroupSlots schreibt nur mathematisch sichere Gruppenplatzierungen", () => {
  const groupMatches = [
    { id: "A1", groupKey: "A", teamA: "A1", teamB: "A2" },
    { id: "A2", groupKey: "A", teamA: "A1", teamB: "A3" },
    { id: "A3", groupKey: "A", teamA: "A1", teamB: "A4" },
    { id: "A4", groupKey: "A", teamA: "A2", teamB: "A3" },
    { id: "A5", groupKey: "A", teamA: "A2", teamB: "A4" },
    { id: "A6", groupKey: "A", teamA: "A3", teamB: "A4" },
  ];
  const results = new Map([
    ["A1", finalResult(2, 0)],
    ["A2", finalResult(2, 0)],
    ["A3", finalResult(2, 0)],
    ["A4", finalResult(1, 0)],
    ["A5", finalResult(1, 0)],
  ]);

  const partial = resolveKnownGroupSlots(groupMatches, results);
  assert.deepEqual(partial.get("A"), { winner: "A1", runnerUp: "A2", complete: false });

  results.set("A6", finalResult(1, 0));
  const complete = resolveKnownGroupSlots(groupMatches, results);
  assert.deepEqual(complete.get("A"), { winner: "A1", runnerUp: "A2", complete: true });
});

test("buildKnockout liefert Tabellen, Dritte und aufgelösten Baum zusammen", () => {
  const matches = buildGroup("A", ["A1", "A2", "A3", "A4"]);
  const results = new Map([
    ["A1", finalResult(1, 0)], ["A2", finalResult(1, 0)], ["A3", finalResult(1, 0)],
    ["A4", finalResult(1, 0)], ["A5", finalResult(1, 0)], ["A6", finalResult(1, 0)],
  ]);
  const { standings, thirds, bracket } = buildKnockout(matches, results);
  assert.equal(standings.get("A")[0].team, "A1");
  assert.equal(thirds[0].team, "A3");
  assert.equal(bracket.length, knockoutMatches.length);
  // Sieger Gruppe A taucht im ersten R32-Spiel auf, das "Sieger Gruppe A" erwartet
  const slotForA1 = bracket.find((row) => row.slotA?.kind === "group" && row.slotA.group === "A" && row.slotA.rank === 1);
  assert.equal(slotForA1.teamA, "A1");
});
