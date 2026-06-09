// WM 2026 K.o.-Phase: reine, testbare Logik (kein React, keine API).
// - Gruppentabellen aus Ergebnissen berechnen
// - 8 beste Gruppendritte ermitteln
// - R32-Paarungen auflösen und Sieger durch den Turnierbaum propagieren
// - Auto-Berechnung mit optionalem Admin-Override (manualPairings)
//
// Wertung der Tipps läuft unverändert über wm-scoring (90-Min-Ergebnis, 4/3/2/0).
// Hier geht es NUR um Struktur/Weiterkommen: Bei K.o.-Remis entscheidet ein
// explizites `winner: "A" | "B"` (Elfmeterschießen) über das Weiterkommen.

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

// HINWEIS: Diese R32-Zuordnung ist eine gültige, aber PROVISORISCHE Belegung
// (jeder Gruppensieger/-zweite genau einmal, 8 beste Dritte). Die exakte
// offizielle FIFA-Tabelle "welcher beste Dritte in welches Spiel" wird vor dem
// Echtbetrieb hinterlegt; der Admin-Override kann jede Paarung korrigieren.
const R32_PAIRINGS = [
  [{ kind: "group", group: "A", rank: 1 }, { kind: "third", seed: 1 }],
  [{ kind: "group", group: "C", rank: 1 }, { kind: "group", group: "F", rank: 2 }],
  [{ kind: "group", group: "E", rank: 1 }, { kind: "third", seed: 2 }],
  [{ kind: "group", group: "G", rank: 1 }, { kind: "group", group: "H", rank: 2 }],
  [{ kind: "group", group: "I", rank: 1 }, { kind: "third", seed: 3 }],
  [{ kind: "group", group: "K", rank: 1 }, { kind: "group", group: "L", rank: 2 }],
  [{ kind: "group", group: "B", rank: 1 }, { kind: "third", seed: 4 }],
  [{ kind: "group", group: "D", rank: 1 }, { kind: "group", group: "A", rank: 2 }],
  [{ kind: "group", group: "F", rank: 1 }, { kind: "third", seed: 5 }],
  [{ kind: "group", group: "H", rank: 1 }, { kind: "group", group: "C", rank: 2 }],
  [{ kind: "group", group: "J", rank: 1 }, { kind: "third", seed: 6 }],
  [{ kind: "group", group: "L", rank: 1 }, { kind: "group", group: "E", rank: 2 }],
  [{ kind: "group", group: "B", rank: 2 }, { kind: "third", seed: 7 }],
  [{ kind: "group", group: "D", rank: 2 }, { kind: "group", group: "G", rank: 2 }],
  [{ kind: "group", group: "I", rank: 2 }, { kind: "third", seed: 8 }],
  [{ kind: "group", group: "J", rank: 2 }, { kind: "group", group: "K", rank: 2 }],
];

function roundId(round, index) {
  return `ko-${round}-${String(index + 1).padStart(2, "0")}`;
}

// Baut die vollständige Spielliste R32 -> Finale (+ Spiel um Platz 3).
function buildKnockoutMatches() {
  const matches = [];

  const r32 = R32_PAIRINGS.map(([slotA, slotB], index) => ({
    id: roundId("r32", index),
    round: "r32",
    matchNumber: index + 1,
    date: ROUND_DATES.r32,
    slotA,
    slotB,
  }));
  matches.push(...r32);

  // Spätere Runden ergeben sich deterministisch aus den Siegern der Vorrunde.
  const buildNext = (round, prevRound, count) => {
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      rows.push({
        id: roundId(round, index),
        round,
        matchNumber: index + 1,
        date: ROUND_DATES[round],
        slotA: { kind: "winner", match: roundId(prevRound, index * 2) },
        slotB: { kind: "winner", match: roundId(prevRound, index * 2 + 1) },
      });
    }
    return rows;
  };

  const r16 = buildNext("r16", "r32", 8);
  const quarter = buildNext("quarter", "r16", 4);
  const semi = buildNext("semi", "quarter", 2);
  matches.push(...r16, ...quarter, ...semi);

  matches.push({
    id: "ko-third-01",
    round: "third",
    matchNumber: 1,
    date: ROUND_DATES.third,
    slotA: { kind: "loser", match: "ko-semi-01" },
    slotB: { kind: "loser", match: "ko-semi-02" },
  });
  matches.push({
    id: "ko-final-01",
    round: "final",
    matchNumber: 1,
    date: ROUND_DATES.final,
    slotA: { kind: "winner", match: "ko-semi-01" },
    slotB: { kind: "winner", match: "ko-semi-02" },
  });

  return matches;
}

export const knockoutMatches = buildKnockoutMatches();

// Lesbares Platzhalter-Label für einen noch nicht aufgelösten Slot.
export function knockoutSlotLabel(slot) {
  if (!slot) return "—";
  if (slot.kind === "group") return `${slot.rank === 1 ? "Sieger" : "Zweiter"} Gruppe ${slot.group}`;
  if (slot.kind === "third") return `Bester Dritter (${slot.seed})`;
  if (slot.kind === "winner") return "Sieger Vorrunde";
  if (slot.kind === "loser") return "Verlierer Halbfinale";
  return "—";
}

function emptyStats(team) {
  return { team, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
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
    if (!teams.has(match.teamA)) teams.set(match.teamA, emptyStats(match.teamA));
    if (!teams.has(match.teamB)) teams.set(match.teamB, emptyStats(match.teamB));

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
} = {}) {
  const resolved = new Map();

  const resolveSlot = (slot) => {
    if (!slot) return null;
    if (slot.kind === "group") {
      const rows = standings.get?.(slot.group);
      return rows?.[slot.rank - 1]?.team ?? null;
    }
    if (slot.kind === "third") {
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
    const teamA = manual.teamA ?? resolveSlot(match.slotA) ?? null;
    const teamB = manual.teamB ?? resolveSlot(match.slotB) ?? null;
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
  });
  return { standings, thirds, bracket };
}
