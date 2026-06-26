// WM 2026 K.o.-Phase: reine, testbare Logik (kein React, keine API).
// - Gruppentabellen aus Ergebnissen berechnen
// - 8 beste Gruppendritte ermitteln
// - K.o.-Paarungen auflösen und Sieger durch den Turnierbaum propagieren
// - Auto-Berechnung mit optionalem Admin-Override (manualPairings)
//
// Wertung der Tipps läuft unverändert über wm-scoring (90-Min-Ergebnis, 4/3/2/0).
// Hier geht es NUR um Struktur/Weiterkommen: Bei K.o.-Remis entscheidet ein
// explizites `winner: "A" | "B"` (Elfmeterschießen) über das Weiterkommen.
//
// Struktur und Paarungen folgen dem offiziellen FIFA-2026-Spielplan
// (Runde der letzten 32 = Spiele 73–88, Achtelfinale 89–96, Viertelfinale 97–100,
// Halbfinale 101–102, Spiel um Platz 3 = 103, Finale = 104).

import { FIFA_THIRD_PLACE_ASSIGNMENT_ROWS } from "./fifaAnnexC.js";

export const GROUP_KEYS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export const KNOCKOUT_ROUND_LABELS = {
  r32: "Runde der letzten 32",
  r16: "Achtelfinale",
  quarter: "Viertelfinale",
  semi: "Halbfinale",
  third: "Spiel um Platz 3",
  final: "Finale",
};

const ROUND_DATES = {
  r32: "2026-06-28",
  r16: "2026-07-04",
  quarter: "2026-07-09",
  semi: "2026-07-14",
  third: "2026-07-18",
  final: "2026-07-19",
};

// Slot-Helfer
const g = (rank, group) => ({ kind: "group", group, rank });
const third = (allowed) => ({ kind: "third", allowed });

// Offizielle Runde der letzten 32 (FIFA 2026): [id, matchNumber, slotA, slotB].
// Die Gruppendritten kommen aus festen, von der FIFA vorgegebenen Gruppensets
// (Annex C). Welcher konkrete Dritte in welchen Slot kommt, hängt von der
// Kombination der acht qualifizierten Gruppen ab – das löst assignThirdSlots
// regelkonform auf, der Admin-Override deckt Sonderfälle.
const R32 = [
  ["ko-r32-01", 73, g(2, "A"), g(2, "B")],
  ["ko-r32-02", 74, g(1, "E"), third(["A", "B", "C", "D", "F"])],
  ["ko-r32-03", 75, g(1, "F"), g(2, "C")],
  ["ko-r32-04", 76, g(1, "C"), g(2, "F")],
  ["ko-r32-05", 77, g(1, "I"), third(["C", "D", "F", "G", "H"])],
  ["ko-r32-06", 78, g(2, "E"), g(2, "I")],
  ["ko-r32-07", 79, g(1, "A"), third(["C", "E", "F", "H", "I"])],
  ["ko-r32-08", 80, g(1, "L"), third(["E", "H", "I", "J", "K"])],
  ["ko-r32-09", 81, g(1, "D"), third(["B", "E", "F", "I", "J"])],
  ["ko-r32-10", 82, g(1, "G"), third(["A", "E", "H", "I", "J"])],
  ["ko-r32-11", 83, g(2, "K"), g(2, "L")],
  ["ko-r32-12", 84, g(1, "H"), g(2, "J")],
  ["ko-r32-13", 85, g(1, "B"), third(["E", "F", "G", "I", "J"])],
  ["ko-r32-14", 86, g(1, "J"), g(2, "H")],
  ["ko-r32-15", 87, g(1, "K"), third(["D", "E", "I", "J", "L"])],
  ["ko-r32-16", 88, g(2, "D"), g(2, "G")],
];

const THIRD_PLACE_COLUMNS = [
  ["1A", "ko-r32-07"],
  ["1B", "ko-r32-13"],
  ["1D", "ko-r32-09"],
  ["1E", "ko-r32-02"],
  ["1G", "ko-r32-10"],
  ["1I", "ko-r32-05"],
  ["1K", "ko-r32-15"],
  ["1L", "ko-r32-08"],
];

export const FIFA_THIRD_PLACE_ASSIGNMENTS = new Map(
  FIFA_THIRD_PLACE_ASSIGNMENT_ROWS.map((row) => {
    const [key, value] = row.split(":");
    return [
      key,
      new Map(THIRD_PLACE_COLUMNS.map(([, matchId], index) => [matchId, value[index]])),
    ];
  }),
);

// Spätere Runden: [id, matchNumber, feederA, feederB] (Sieger der genannten Spiele).
const R16 = [
  ["ko-r16-01", 89, "ko-r32-02", "ko-r32-05"],
  ["ko-r16-02", 90, "ko-r32-01", "ko-r32-03"],
  ["ko-r16-03", 91, "ko-r32-04", "ko-r32-06"],
  ["ko-r16-04", 92, "ko-r32-07", "ko-r32-08"],
  ["ko-r16-05", 93, "ko-r32-11", "ko-r32-12"],
  ["ko-r16-06", 94, "ko-r32-09", "ko-r32-10"],
  ["ko-r16-07", 95, "ko-r32-14", "ko-r32-16"],
  ["ko-r16-08", 96, "ko-r32-13", "ko-r32-15"],
];

const QUARTER = [
  ["ko-quarter-01", 97, "ko-r16-01", "ko-r16-02"],
  ["ko-quarter-02", 98, "ko-r16-05", "ko-r16-06"],
  ["ko-quarter-03", 99, "ko-r16-03", "ko-r16-04"],
  ["ko-quarter-04", 100, "ko-r16-07", "ko-r16-08"],
];

const SEMI = [
  ["ko-semi-01", 101, "ko-quarter-01", "ko-quarter-02"],
  ["ko-semi-02", 102, "ko-quarter-03", "ko-quarter-04"],
];

// Nummern der Vorrunden-Spiele für lesbare "Sieger Spiel N"-Labels.
const MATCH_NUMBERS = new Map(
  [...R32, ...R16, ...QUARTER, ...SEMI].map(([id, number]) => [id, number]),
);

function winnerSlot(match) {
  return { kind: "winner", match, fromNumber: MATCH_NUMBERS.get(match) ?? null };
}
function loserSlot(match) {
  return { kind: "loser", match, fromNumber: MATCH_NUMBERS.get(match) ?? null };
}

// Baut die vollständige Spielliste R32 -> Finale (+ Spiel um Platz 3).
function buildKnockoutMatches() {
  const matches = [];

  for (const [id, matchNumber, slotA, slotB] of R32) {
    matches.push({ id, round: "r32", matchNumber, date: ROUND_DATES.r32, slotA, slotB });
  }
  for (const [round, rows] of [["r16", R16], ["quarter", QUARTER], ["semi", SEMI]]) {
    for (const [id, matchNumber, feederA, feederB] of rows) {
      matches.push({
        id,
        round,
        matchNumber,
        date: ROUND_DATES[round],
        slotA: winnerSlot(feederA),
        slotB: winnerSlot(feederB),
      });
    }
  }

  matches.push({
    id: "ko-third-01",
    round: "third",
    matchNumber: 103,
    date: ROUND_DATES.third,
    slotA: loserSlot("ko-semi-01"),
    slotB: loserSlot("ko-semi-02"),
  });
  matches.push({
    id: "ko-final-01",
    round: "final",
    matchNumber: 104,
    date: ROUND_DATES.final,
    slotA: winnerSlot("ko-semi-01"),
    slotB: winnerSlot("ko-semi-02"),
  });

  return matches;
}

export const knockoutMatches = buildKnockoutMatches();

// Lesbares Platzhalter-Label für einen noch nicht aufgelösten Slot.
export function knockoutSlotLabel(slot) {
  if (!slot) return "—";
  if (slot.kind === "group") return `${slot.rank === 1 ? "Sieger" : "Zweiter"} Gruppe ${slot.group}`;
  if (slot.kind === "third") {
    if (Array.isArray(slot.allowed)) return `Dritter aus ${slot.allowed.join("/")}`;
    return `Bester Dritter (${slot.seed})`;
  }
  if (slot.kind === "winner") return slot.fromNumber ? `Sieger Spiel ${slot.fromNumber}` : "Sieger Vorrunde";
  if (slot.kind === "loser") return slot.fromNumber ? `Verlierer Spiel ${slot.fromNumber}` : "Verlierer Halbfinale";
  return "—";
}

export function knockoutPlaceholderPairing(matchId) {
  const match = knockoutMatches.find((item) => item.id === matchId);
  if (!match) return null;
  return {
    id: match.id,
    matchNumber: match.matchNumber,
    round: match.round,
    roundLabel: KNOCKOUT_ROUND_LABELS[match.round] ?? match.round,
    team_a: knockoutSlotLabel(match.slotA),
    team_b: knockoutSlotLabel(match.slotB),
    flag_code_a: "",
    flag_code_b: "",
  };
}

function emptyStats(team, group) {
  return { team, group, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
}

function applyResult(stats, scored, conceded) {
  stats.played += 1;
  stats.goalsFor += scored;
  stats.goalsAgainst += conceded;
  stats.goalDiff = stats.goalsFor - stats.goalsAgainst;
  if (scored > conceded) {
    stats.won += 1;
    stats.points += 3;
  } else if (scored === conceded) {
    stats.draw += 1;
    stats.points += 1;
  } else {
    stats.lost += 1;
  }
}

function standingsSort(a, b) {
  return (
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    b.goalsFor - a.goalsFor ||
    String(a.team).localeCompare(String(b.team))
  );
}

// Berechnet je Gruppe eine sortierte Tabelle aus finalen Gruppenergebnissen.
// groupMatches: Objekte mit { id, groupKey, teamA, teamB }
// resultsByMatchId: Map(matchId -> { score_a, score_b, status })
export function computeGroupStandings(groupMatches = [], resultsByMatchId = new Map()) {
  const groups = new Map();
  const teamMap = (groupKey) => {
    if (!groups.has(groupKey)) groups.set(groupKey, new Map());
    return groups.get(groupKey);
  };

  for (const match of groupMatches) {
    const groupKey = match.groupKey;
    if (!groupKey || !match.teamA || !match.teamB) continue;
    const teams = teamMap(groupKey);
    if (!teams.has(match.teamA)) teams.set(match.teamA, emptyStats(match.teamA, groupKey));
    if (!teams.has(match.teamB)) teams.set(match.teamB, emptyStats(match.teamB, groupKey));

    const result = resultsByMatchId.get(match.id);
    if (!result || result.status !== "final") continue;
    if (!Number.isInteger(result.score_a) || !Number.isInteger(result.score_b)) continue;
    applyResult(teams.get(match.teamA), result.score_a, result.score_b);
    applyResult(teams.get(match.teamB), result.score_b, result.score_a);
  }

  const standings = new Map();
  for (const [groupKey, teams] of groups) {
    const rows = Array.from(teams.values()).sort(standingsSort).map((row, index) => ({ ...row, rank: index + 1 }));
    standings.set(groupKey, rows);
  }
  return standings;
}

// Rangliste der Gruppendritten; die ersten 8 qualifizieren sich (seed 1..8).
export function rankThirdPlaced(standings = new Map()) {
  const thirds = [];
  for (const rows of standings.values()) {
    const third = rows.find((row) => row.rank === 3);
    if (third) thirds.push(third);
  }
  return thirds
    .sort(standingsSort)
    .map((row, index) => ({ ...row, seed: index + 1, qualified: index < 8 }));
}

// Ordnet die qualifizierten Gruppendritten den offiziellen Slots aus FIFA Annex C
// zu. Die Zuordnung ist keine freie Matching-Aufgabe: fuer jede Kombination der
// acht besten Drittgruppen gibt FIFA eine exakte Tabellenzeile vor.
function assignThirdSlots(thirds = [], { resolveThirds = true } = {}) {
  const result = new Map();
  if (!resolveThirds) return result;

  const teamByGroup = new Map();
  for (const row of thirds) {
    if (row.qualified === false) continue;
    if (row.group && row.team && !teamByGroup.has(row.group)) teamByGroup.set(row.group, row.team);
  }
  if (teamByGroup.size !== 8) return result;

  const key = [...teamByGroup.keys()].sort().join("");
  const assignment = FIFA_THIRD_PLACE_ASSIGNMENTS.get(key);
  if (!assignment) return result;

  for (const [matchId, group] of assignment) {
    const team = teamByGroup.get(group);
    if (team) result.set(matchId, team);
  }
  return result;
}

function resultIsFinalScore(result) {
  return result?.status === "final" &&
    Number.isInteger(result.score_a) &&
    Number.isInteger(result.score_b);
}

function groupedMatchesByKey(groupMatches = []) {
  const groups = new Map();
  for (const match of groupMatches) {
    if (!match.groupKey) continue;
    if (!groups.has(match.groupKey)) groups.set(match.groupKey, []);
    groups.get(match.groupKey).push(match);
  }
  return groups;
}

// Gibt je Gruppe die sicher bekannten Plaetze fuer KO-Slots zurueck.
// Vor Gruppenende wird bewusst nur nach Punkten entschieden: Sobald ein Team
// theoretisch punktgleich werden kann, bleibt der Slot offen und der Admin kann
// spaeter manuell/final aufloesen.
export function resolveKnownGroupSlots(groupMatches = [], resultsByMatchId = new Map()) {
  const standings = computeGroupStandings(groupMatches, resultsByMatchId);
  const groupedMatches = groupedMatchesByKey(groupMatches);
  const known = new Map();

  for (const [groupKey, rows] of standings) {
    const matches = groupedMatches.get(groupKey) ?? [];
    const finalCount = matches.filter((match) => resultIsFinalScore(resultsByMatchId.get(match.id))).length;
    const complete = matches.length > 0 && finalCount === matches.length;

    if (complete) {
      known.set(groupKey, {
        winner: rows[0]?.team ?? null,
        runnerUp: rows[1]?.team ?? null,
        complete: true,
      });
      continue;
    }

    const remainingByTeam = new Map(rows.map((row) => [row.team, 0]));
    for (const match of matches) {
      if (resultIsFinalScore(resultsByMatchId.get(match.id))) continue;
      if (remainingByTeam.has(match.teamA)) remainingByTeam.set(match.teamA, remainingByTeam.get(match.teamA) + 1);
      if (remainingByTeam.has(match.teamB)) remainingByTeam.set(match.teamB, remainingByTeam.get(match.teamB) + 1);
    }
    const maxPoints = new Map(rows.map((row) => [row.team, row.points + (remainingByTeam.get(row.team) ?? 0) * 3]));

    const winnerRow = rows.find((row) =>
      rows.every((other) => other.team === row.team || row.points > (maxPoints.get(other.team) ?? other.points)),
    );
    let runnerUpRow = null;
    if (winnerRow) {
      runnerUpRow = rows.find((row) =>
        row.team !== winnerRow.team &&
        rows.every((other) =>
          other.team === row.team ||
          other.team === winnerRow.team ||
          row.points > (maxPoints.get(other.team) ?? other.points),
        ),
      );
    }

    known.set(groupKey, {
      winner: winnerRow?.team ?? null,
      runnerUp: runnerUpRow?.team ?? null,
      complete: false,
    });
  }

  return known;
}

function determineOutcome(teamA, teamB, result) {
  if (!teamA || !teamB || !result || result.status !== "final") return { winner: null, loser: null };
  if (!Number.isInteger(result.score_a) || !Number.isInteger(result.score_b)) return { winner: null, loser: null };
  if (result.score_a > result.score_b) return { winner: teamA, loser: teamB };
  if (result.score_b > result.score_a) return { winner: teamB, loser: teamA };
  // Remis nach regulärer Zeit -> Elfmeterschießen entscheidet das Weiterkommen.
  if (result.winner === "A") return { winner: teamA, loser: teamB };
  if (result.winner === "B") return { winner: teamB, loser: teamA };
  return { winner: null, loser: null };
}

// Löst alle K.o.-Spiele auf: Teams aus Tabellen/Dritten/Vorrunden-Siegern,
// optionaler Admin-Override pro Spiel, Sieger/Verlierer propagieren weiter.
export function resolveKnockout({
  standings = new Map(),
  thirds = [],
  matches = knockoutMatches,
  resultsByMatchId = new Map(),
  manualPairings = new Map(),
  groupMatches = [],
  partialGroupSlots = false,
  resolveThirds = true,
} = {}) {
  const resolved = new Map();
  const thirdAssignment = assignThirdSlots(thirds, { resolveThirds });
  const knownGroupSlots = partialGroupSlots
    ? resolveKnownGroupSlots(groupMatches, resultsByMatchId)
    : null;

  const resolveSlot = (slot, ownerId) => {
    if (!slot) return null;
    if (slot.kind === "group") {
      if (knownGroupSlots) {
        const known = knownGroupSlots.get(slot.group);
        return slot.rank === 1 ? (known?.winner ?? null) : (known?.runnerUp ?? null);
      }
      const rows = standings.get?.(slot.group);
      return rows?.[slot.rank - 1]?.team ?? null;
    }
    if (slot.kind === "third") {
      if (Array.isArray(slot.allowed)) return thirdAssignment.get(ownerId) ?? null;
      // Legacy: seed-basierte Drittel-Slots.
      const third = thirds[slot.seed - 1];
      return third && third.qualified !== false ? third.team : null;
    }
    if (slot.kind === "winner") return resolved.get(slot.match)?.winner ?? null;
    if (slot.kind === "loser") return resolved.get(slot.match)?.loser ?? null;
    return null;
  };

  const out = [];
  for (const match of matches) {
    const manual = manualPairings.get(match.id) ?? {};
    const teamA = manual.teamA ?? resolveSlot(match.slotA, match.id) ?? null;
    const teamB = manual.teamB ?? resolveSlot(match.slotB, match.id) ?? null;
    const result = resultsByMatchId.get(match.id) ?? null;
    const { winner, loser } = determineOutcome(teamA, teamB, result);

    const entry = {
      ...match,
      roundLabel: KNOCKOUT_ROUND_LABELS[match.round] ?? match.round,
      teamA,
      teamB,
      labelA: knockoutSlotLabel(match.slotA),
      labelB: knockoutSlotLabel(match.slotB),
      resolved: Boolean(teamA && teamB),
      winner,
      loser,
    };
    resolved.set(match.id, entry);
    out.push(entry);
  }
  return out;
}

// Komfort-Wrapper: Gruppenspiele + Ergebnisse rein, aufgelöster Baum raus.
export function buildKnockout(groupMatches = [], resultsByMatchId = new Map(), options = {}) {
  const standings = computeGroupStandings(groupMatches, resultsByMatchId);
  const thirds = rankThirdPlaced(standings);
  const bracket = resolveKnockout({
    standings,
    thirds,
    matches: options.matches ?? knockoutMatches,
    resultsByMatchId,
    manualPairings: options.manualPairings ?? new Map(),
    groupMatches,
    partialGroupSlots: Boolean(options.partialGroupSlots),
    resolveThirds: options.resolveThirds !== false,
  });
  return { standings, thirds, bracket };
}
