import { useMemo, useState } from "react";
import { matches as groupMatches } from "./data.js";
import {
  GROUP_KEYS,
  KNOCKOUT_ROUND_LABELS,
  knockoutMatches,
  computeGroupStandings,
  rankThirdPlaced,
  resolveKnockout,
} from "./koBracket.js";

const ROUND_ORDER = ["r32", "r16", "quarter", "semi", "third", "final"];

// Niedrige, plausible Torzahlen (0-4, Schwerpunkt 0-2). Gleiche Verteilung wie
// der Demo-Generator der WM-Sandbox.
function randomGoals() {
  const value = Math.random();
  if (value < 0.3) return 0;
  if (value < 0.62) return 1;
  if (value < 0.84) return 2;
  if (value < 0.95) return 3;
  return 4;
}

// Punktelogik wie netlify/functions/_shared/wm-scoring.js (90-Min-Ergebnis).
function tipPoints(tip, result) {
  if (!tip || !result || result.status !== "final") return null;
  if (tip.score_a === result.score_a && tip.score_b === result.score_b) return 4;
  const tipDiff = tip.score_a - tip.score_b;
  const resultDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipDiff);
  const resultTrend = Math.sign(resultDiff);

  // K.o.-Phase: 90-Min-Remis per Elfmeterschießen entschieden. Wer den
  // Weiterkommenden richtig getippt hat, bekommt die Tendenz-Punkte (2).
  if (resultTrend === 0 && (result.winner === "A" || result.winner === "B")) {
    if (tipTrend === 0) return 2;
    const advancingTrend = result.winner === "A" ? 1 : -1;
    return tipTrend === advancingTrend ? 2 : 0;
  }

  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return 2;
  return tipDiff === resultDiff ? 3 : 2;
}

function randomResult({ allowDraw = true } = {}) {
  const score_a = randomGoals();
  const score_b = randomGoals();
  const result = { score_a, score_b, status: "final" };
  if (!allowDraw && score_a === score_b) {
    // K.o.-Spiel endet remis -> Elfmeterschießen entscheidet das Weiterkommen.
    result.winner = Math.random() < 0.5 ? "A" : "B";
  }
  return result;
}

export default function KnockoutSimulator() {
  const [groupResults, setGroupResults] = useState(() => new Map());
  const [koResults, setKoResults] = useState(() => new Map());
  const [myTips, setMyTips] = useState(() => new Map());

  const groupsPlayed = groupResults.size > 0;

  const { standings, thirds } = useMemo(() => {
    const table = computeGroupStandings(groupMatches, groupResults);
    return { standings: table, thirds: rankThirdPlaced(table) };
  }, [groupResults]);

  const bracket = useMemo(
    () => resolveKnockout({ standings, thirds, resultsByMatchId: koResults }),
    [standings, thirds, koResults],
  );

  const bracketByRound = useMemo(() => {
    const grouped = new Map(ROUND_ORDER.map((round) => [round, []]));
    for (const match of bracket) grouped.get(match.round)?.push(match);
    return grouped;
  }, [bracket]);

  function simulateGroups() {
    const results = new Map();
    const tips = new Map(myTips);
    for (const match of groupMatches) {
      results.set(match.id, randomResult());
      if (!tips.has(match.id)) tips.set(match.id, { score_a: randomGoals(), score_b: randomGoals() });
    }
    setGroupResults(results);
    setKoResults(new Map());
    setMyTips(tips);
  }

  function nextRoundToPlay() {
    for (const round of ROUND_ORDER) {
      const matchesInRound = bracketByRound.get(round) ?? [];
      const ready = matchesInRound.filter((match) => match.resolved && !koResults.has(match.id));
      if (ready.length > 0) return { round, matches: ready };
    }
    return null;
  }

  function simulateRound() {
    const next = nextRoundToPlay();
    if (!next) return;
    const results = new Map(koResults);
    const tips = new Map(myTips);
    for (const match of next.matches) {
      results.set(match.id, randomResult({ allowDraw: false }));
      if (!tips.has(match.id)) tips.set(match.id, { score_a: randomGoals(), score_b: randomGoals() });
    }
    setKoResults(results);
    setMyTips(tips);
  }

  function simulateWholeTournament() {
    // In einem Rutsch bis zum Sieger durchspielen.
    let workingStandings = standings;
    let workingThirds = thirds;
    let results = groupResults;
    const tips = new Map(myTips);
    if (!groupsPlayed) {
      results = new Map();
      for (const match of groupMatches) {
        results.set(match.id, randomResult());
        if (!tips.has(match.id)) tips.set(match.id, { score_a: randomGoals(), score_b: randomGoals() });
      }
      workingStandings = computeGroupStandings(groupMatches, results);
      workingThirds = rankThirdPlaced(workingStandings);
    }
    const ko = new Map();
    for (let guard = 0; guard < 10; guard += 1) {
      const tree = resolveKnockout({ standings: workingStandings, thirds: workingThirds, resultsByMatchId: ko });
      const pending = tree.filter((match) => match.resolved && !ko.has(match.id));
      if (pending.length === 0) break;
      for (const match of pending) {
        ko.set(match.id, randomResult({ allowDraw: false }));
        if (!tips.has(match.id)) tips.set(match.id, { score_a: randomGoals(), score_b: randomGoals() });
      }
    }
    setGroupResults(results);
    setKoResults(ko);
    setMyTips(tips);
  }

  function reset() {
    setGroupResults(new Map());
    setKoResults(new Map());
    setMyTips(new Map());
  }

  const champion = bracket.find((match) => match.round === "final")?.winner ?? null;
  const next = groupsPlayed ? nextRoundToPlay() : null;

  // Punkte zusammenrechnen (Gruppenphase + K.o.) zur Demonstration des Scorings.
  const score = useMemo(() => {
    let total = 0;
    let scored = 0;
    const addFrom = (resultMap, ids) => {
      for (const id of ids) {
        const points = tipPoints(myTips.get(id), resultMap.get(id));
        if (points !== null) { total += points; scored += 1; }
      }
    };
    addFrom(groupResults, groupMatches.map((m) => m.id));
    addFrom(koResults, knockoutMatches.map((m) => m.id));
    return { total, scored };
  }, [groupResults, koResults, myTips]);

  return (
    <section className="panel ko-sim">
      <header className="ko-sim-head">
        <div>
          <h2>WM-Simulation (Testmodus)</h2>
          <p>Spiele eine komplette WM durch: Gruppenphase → K.o.-Phase → Sieger. Zufallsergebnisse, inkl. Demo-Tipp und Punkten.</p>
        </div>
        <div className="ko-sim-actions">
          <button type="button" className="primary-button" onClick={simulateGroups}>Gruppenphase simulieren</button>
          <button type="button" className="primary-button" onClick={simulateRound} disabled={!next}>
            {next ? `Nächste Runde: ${KNOCKOUT_ROUND_LABELS[next.round]}` : "Nächste Runde"}
          </button>
          <button type="button" className="ghost-button" onClick={simulateWholeTournament}>Komplette WM simulieren</button>
          <button type="button" className="danger-button" onClick={reset}>Zurücksetzen</button>
        </div>
      </header>

      <div className="ko-sim-score">
        <span>Demo-Tipper – Gesamtpunkte: <strong>{score.total}</strong></span>
        <span>Gewertete Tipps: <strong>{score.scored}</strong></span>
        {champion && <span className="ko-sim-champion">🏆 Weltmeister: <strong>{champion}</strong></span>}
      </div>

      {!groupsPlayed ? (
        <p className="ko-sim-empty">Noch keine Gruppenphase simuliert. Klicke auf „Gruppenphase simulieren".</p>
      ) : (
        <>
          <h3>Gruppentabellen</h3>
          <div className="ko-sim-groups">
            {GROUP_KEYS.map((group) => (
              <div key={group} className="ko-sim-group">
                <h4>Gruppe {group}</h4>
                <ol>
                  {(standings.get(group) ?? []).map((row) => (
                    <li key={row.team} className={row.rank <= 2 ? "is-advance" : row.rank === 3 ? "is-third" : ""}>
                      <span>{row.team}</span>
                      <span>{row.points} P · {row.goalDiff > 0 ? "+" : ""}{row.goalDiff}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <h3>Beste Gruppendritte (Top 8 qualifiziert)</h3>
          <ol className="ko-sim-thirds">
            {thirds.map((row) => (
              <li key={row.team} className={row.qualified ? "is-advance" : "is-out"}>
                <span>{row.seed}. {row.team}</span>
                <span>{row.points} P · {row.goalDiff > 0 ? "+" : ""}{row.goalDiff}{row.qualified ? "" : " · raus"}</span>
              </li>
            ))}
          </ol>

          <h3>K.o.-Phase</h3>
          {ROUND_ORDER.map((round) => {
            const rows = bracketByRound.get(round) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={round} className="ko-sim-round">
                <h4>{KNOCKOUT_ROUND_LABELS[round]}</h4>
                <div className="ko-sim-matches">
                  {rows.map((match) => {
                    const result = koResults.get(match.id);
                    const tip = myTips.get(match.id);
                    const points = tipPoints(tip, result);
                    return (
                      <div key={match.id} className={`ko-sim-match ${match.resolved ? "" : "is-pending"}`}>
                        <div className="ko-sim-teams">
                          <span className={match.winner && match.winner === match.teamA ? "is-winner" : ""}>{match.teamA ?? match.labelA}</span>
                          <span className="ko-sim-vs">
                            {result ? `${result.score_a}:${result.score_b}${result.winner ? " i.E." : ""}` : "–:–"}
                          </span>
                          <span className={match.winner && match.winner === match.teamB ? "is-winner" : ""}>{match.teamB ?? match.labelB}</span>
                        </div>
                        {match.resolved && (
                          <div className="ko-sim-tip">
                            Dein Tipp: {tip ? `${tip.score_a}:${tip.score_b}` : "–:–"}
                            {points !== null && <strong> · {points} P</strong>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}
