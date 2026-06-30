// Geteilte WM-Komponenten (Tippabgabe-Ansicht + Admin): Spielerauswahl & Rangliste.
import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { playerLabel } from "../lib/players.js";
export function PlayerSelect({ players, value, fallbackText, disabled, multiple = false, onChange }) {
  const [query, setQuery] = useState("");
  const selectedIds = multiple ? value ?? [] : value ? [value] : [];
  const filteredPlayers = players
    .filter((player) => player.active !== false || selectedIds.includes(player.id))
    .filter((player) => {
      const haystack = [player.display_name, player.team_name, ...(Array.isArray(player.aliases) ? player.aliases : [])]
        .join(" ")
        .toLocaleLowerCase("de-DE");
      return !query.trim() || haystack.includes(query.trim().toLocaleLowerCase("de-DE"));
    });

  function updateSingle(playerId) {
    const player = players.find((item) => item.id === playerId);
    onChange(playerId, player);
  }

  function updateMultiple(playerId, checked) {
    const nextIds = checked
      ? [...new Set([...selectedIds, playerId])]
      : selectedIds.filter((id) => id !== playerId);
    onChange(nextIds, nextIds.map((id) => players.find((player) => player.id === id)).filter(Boolean));
  }

  return (
    <div className="player-select">
      <input
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Spieler suchen"
      />
      {multiple ? (
        <div className="player-check-list">
          {filteredPlayers.map((player) => (
            <label key={player.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(player.id)}
                disabled={disabled}
                onChange={(event) => updateMultiple(player.id, event.target.checked)}
              />
              {playerLabel(player)}
            </label>
          ))}
        </div>
      ) : (
        <select value={value ?? ""} disabled={disabled} onChange={(event) => updateSingle(event.target.value)}>
          <option value="">Bitte wählen</option>
          {filteredPlayers.map((player) => (
            <option key={player.id} value={player.id}>{playerLabel(player)}</option>
          ))}
        </select>
      )}
      {fallbackText && !selectedIds.length && (
        <small>Bisheriger Text: {fallbackText}</small>
      )}
      {players.length === 0 && <small>Noch keine Spieler im Adminbereich angelegt.</small>}
    </div>
  );
}

export function RankingPanel({ ranking: rows, expanded = false, setActiveTab }) {
  const [rankingMode, setRankingMode] = useState("total");
  const scoreKey = expanded && rankingMode === "average" ? "averagePoints" : "points";
  const sortedRows = useMemo(() => {
    const nextRows = rows.filter(
      (row) => row.isCurrent || (row.tipCount ?? 0) > 0 || (row.points ?? 0) > 0,
    );
    if (expanded && rankingMode === "average") {
      return nextRows.sort(
        (first, second) =>
          (second.averagePoints ?? 0) - (first.averagePoints ?? 0) ||
          (second.scoredTipCount ?? 0) - (first.scoredTipCount ?? 0) ||
          second.points - first.points ||
          first.name.localeCompare(second.name, "de"),
      );
    }
    return nextRows.sort((first, second) => second.points - first.points || first.name.localeCompare(second.name, "de"));
  }, [rows, expanded, rankingMode]);
  const rankedRows = useMemo(() => {
    let previousScore = null;
    let previousRank = 0;
    return sortedRows.map((row, index) => {
      const score = row[scoreKey] ?? 0;
      const displayRank = index > 0 && score === previousScore ? previousRank : index + 1;
      previousScore = score;
      previousRank = displayRank;
      return { ...row, displayRank };
    });
  }, [sortedRows, scoreKey]);
  const visibleRows = expanded ? rankedRows : rankedRows.slice(0, 10);
  const getRowLabel = (row, index) => {
    const rank = row.displayRank ?? row.rank ?? index + 1;
    if (!expanded) return `${rank} ${row.name} ${row.points}`;
    if (rankingMode === "average") {
      return `${rank} ${row.name} ${row.tipCount ?? 0} ${row.scoredTipCount ?? 0} ${(row.averagePoints ?? 0).toFixed(2)} ${row.matchPoints ?? row.points}`;
    }
    return `${rank} ${row.name} ${row.tipCount ?? 0} ${row.matchPoints ?? row.points} ${row.bonusPoints ?? 0} ${row.points}`;
  };

  return (
    <section className={`ranking-panel panel ${expanded ? "expanded" : ""}`}>
      <header className="section-title">
        <Trophy size={24} />
        <h2>Rangliste</h2>
        <span>{expanded ? "Alle" : "Top 10"}</span>
      </header>
      {expanded && (
        <div className="ranking-tabs">
          <button
            type="button"
            className={rankingMode === "total" ? "active" : ""}
            onClick={() => setRankingMode("total")}
          >
            Gesamtpunkte
          </button>
          <button
            type="button"
            className={rankingMode === "average" ? "active" : ""}
            onClick={() => setRankingMode("average")}
          >
            Durchschnitt
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Platz</th>
            <th>Name</th>
            {expanded && rankingMode === "total" && <th>Tipps</th>}
            {expanded && rankingMode === "total" && <th>Spielpunkte</th>}
            {expanded && rankingMode === "total" && <th>Bonus</th>}
            {expanded && rankingMode === "average" && <th>Tipps</th>}
            {expanded && rankingMode === "average" && <th>Gewertet</th>}
            {expanded && rankingMode === "average" && <th>Schnitt</th>}
            <th>{rankingMode === "average" ? "Spielpunkte" : "Gesamt"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={expanded ? 6 : 3}>Noch keine Punkte vorhanden.</td>
            </tr>
          )}
          {visibleRows.map((row, index) => (
            <tr key={`${row.name}-${index}`} className={row.isCurrent ? "current" : ""} aria-label={getRowLabel(row, index)}>
              <td data-label="Platz">{row.displayRank ?? row.rank ?? index + 1}</td>
              <td data-label="Name">{row.name}</td>
              {expanded && rankingMode === "total" && <td data-label="Tipps">{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "total" && <td data-label="Spielpunkte">{row.matchPoints ?? row.points}</td>}
              {expanded && rankingMode === "total" && <td data-label="Bonus">{row.bonusPoints ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Tipps">{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Gewertet">{row.scoredTipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Schnitt">{(row.averagePoints ?? 0).toFixed(2)}</td>}
              <td data-label={rankingMode === "average" ? "Spielpunkte" : "Gesamt"}>
                {rankingMode === "average" ? row.matchPoints ?? row.points : row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expanded && rankingMode === "average" && (
        <p className="ranking-note">
          Tipps zeigt alle gespeicherten Spieltipps. Gewertet zählt nur Spiele mit eingetragenem Endergebnis.
          Der Schnitt nutzt nur Spielpunkte pro gewertetem Tipp; Bonuspunkte sind nicht eingerechnet.
        </p>
      )}
      {!expanded && (
        <button type="button" className="ghost-button" onClick={() => setActiveTab?.("rangliste")}>
          Zur vollständigen Rangliste
        </button>
      )}
    </section>
  );
}
