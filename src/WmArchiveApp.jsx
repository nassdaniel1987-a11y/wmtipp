import { useEffect, useMemo, useState } from "react";
import { loadDbMatches, loadRanking, loadResults } from "./api.js";
import { displayTeamName } from "./teamNames.js";
import { KO_PHASES, KO_PHASE_LABELS } from "./lib/constants.js";

// Read-only-Rueckblick auf das abgeschlossene WM-Tippspiel. Diese Ansicht ist
// bewusst schlank und ohne jede Tipp-/Speicher-Interaktion: Sie zeigt nur noch
// den Endstand der Rangliste und die Ergebnisse. Erreichbar ueber #wm-archiv.
// Die eigentliche WM-App wurde archiviert; die Bundesliga ist die aktive Saison.

function goToBundesliga() {
  window.location.assign(`${window.location.pathname}${window.location.search}`);
}

function phaseLabel(phase) {
  if (!phase || phase === "group") return "Gruppenphase";
  return KO_PHASE_LABELS[phase] ?? "K.o.-Phase";
}

function phaseOrder(phase) {
  if (!phase || phase === "group") return -1;
  const index = KO_PHASES.indexOf(phase);
  return index === -1 ? 99 : index;
}

export default function WmArchiveApp({ isTestMode = false }) {
  const [ranking, setRanking] = useState([]);
  const [matches, setMatches] = useState([]);
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [rankingPayload, matchRows, resultRows] = await Promise.all([
          loadRanking(),
          loadDbMatches(),
          loadResults(),
        ]);
        if (!active) return;
        setRanking(rankingPayload?.ranking ?? []);
        setMatches(matchRows ?? []);
        setResults(resultRows ?? []);
        setStatus("ready");
      } catch {
        if (!active) return;
        setStatus("error");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const resultsByMatch = useMemo(
    () => new Map(results.map((row) => [row.match_id, row])),
    [results],
  );

  const playedMatches = useMemo(() => {
    return matches
      .filter((row) => {
        const result = resultsByMatch.get(row.id);
        return result && result.score_a != null && result.score_b != null;
      })
      .sort((a, b) => {
        const phaseDiff = phaseOrder(a.phase) - phaseOrder(b.phase);
        if (phaseDiff !== 0) return phaseDiff;
        return (a.match_number ?? 0) - (b.match_number ?? 0);
      });
  }, [matches, resultsByMatch]);

  const groupedResults = useMemo(() => {
    const groups = new Map();
    for (const match of playedMatches) {
      const label = phaseLabel(match.phase);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(match);
    }
    return Array.from(groups.entries());
  }, [playedMatches]);

  return (
    <div className="app-shell wm-archive">
      <header className="topbar">
        <button type="button" className="brand" onClick={goToBundesliga}>
          <span className="brand-logo">
            <img src="/oesterfeld-logo-round.jpg" alt="WM-Tippspiel Österfeld-Edition" />
          </span>
          <span>
            <strong>WM-Tippspiel Österfeld-Edition</strong>
            <small>Rückblick · Saison beendet</small>
          </span>
        </button>
        <button type="button" className="nav-button" onClick={goToBundesliga}>
          Zur Bundesliga
        </button>
      </header>

      <main className="stadium">
        <section className="panel">
          <div className="wm-archive-banner" role="status">
            <strong>Die WM 2026 ist abgeschlossen.</strong>{" "}
            Dies ist der Rückblick auf das WM-Tippspiel – Endstand und Ergebnisse
            als Archiv. Neue Tipps sind hier nicht mehr möglich. Die aktive Saison
            läuft in der{" "}
            <button type="button" className="linklike" onClick={goToBundesliga}>
              Bundesliga
            </button>
            .
          </div>
        </section>

        {status === "error" && (
          <section className="panel">
            <p>Die Archivdaten konnten gerade nicht geladen werden. Bitte später erneut versuchen.</p>
          </section>
        )}

        {status === "loading" && (
          <section className="panel">
            <p>Rückblick wird geladen…</p>
          </section>
        )}

        {status === "ready" && (
          <>
            <section className="panel">
              <h2>Endstand der Rangliste</h2>
              {ranking.length === 0 ? (
                <p>Für dieses Turnier liegt kein Endstand vor.</p>
              ) : (
                <div className="table-scroll">
                  <table className="wm-archive-table">
                    <thead>
                      <tr>
                        <th scope="col">Platz</th>
                        <th scope="col">Name</th>
                        <th scope="col">Punkte</th>
                        <th scope="col">Spiel</th>
                        <th scope="col">Bonus</th>
                        <th scope="col">Schnitt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row, index) => (
                        <tr key={row.name ?? index}>
                          <td>{row.place ?? index + 1}</td>
                          <td>{row.name}</td>
                          <td>
                            <strong>{row.points ?? 0}</strong>
                          </td>
                          <td>{row.matchPoints ?? 0}</td>
                          <td>{row.bonusPoints ?? 0}</td>
                          <td>{(row.averagePoints ?? 0).toFixed ? Number(row.averagePoints ?? 0).toFixed(1) : row.averagePoints}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel">
              <h2>Ergebnisse</h2>
              {groupedResults.length === 0 ? (
                <p>Es sind keine Ergebnisse archiviert.</p>
              ) : (
                groupedResults.map(([label, group]) => (
                  <div key={label} className="wm-archive-phase">
                    <h3>{label}</h3>
                    <ul className="wm-archive-results">
                      {group.map((match) => {
                        const result = resultsByMatch.get(match.id);
                        return (
                          <li key={match.id}>
                            <span className="wm-archive-team home">{displayTeamName(match.team_a)}</span>
                            <span className="wm-archive-score">
                              {result.score_a} : {result.score_b}
                            </span>
                            <span className="wm-archive-team away">{displayTeamName(match.team_b)}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {isTestMode && (
          <section className="panel">
            <p className="muted">Testmodus: Archivdaten stammen ggf. aus der lokalen Umgebung.</p>
          </section>
        )}
      </main>
    </div>
  );
}
