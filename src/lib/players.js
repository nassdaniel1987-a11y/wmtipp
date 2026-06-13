// Geteilte Spieler-/Torschuetzen-Helfer (WM-Tippabgabe + Admin).
import { normalizeText } from "./scoring.js";

export function normalizePlayerName(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

export function playerLabel(player) {
  if (!player) return "";
  return player.team_name ? `${player.display_name} · ${player.team_name}` : player.display_name;
}

export function findPlayerByText(players, text) {
  const normalized = normalizePlayerName(text);
  if (!normalized) return null;
  const matches = players.filter((player) => {
    const names = [player.display_name, ...(Array.isArray(player.aliases) ? player.aliases : [])];
    return names.some((name) => normalizePlayerName(name) === normalized);
  });
  return matches.length === 1 ? matches[0] : null;
}
