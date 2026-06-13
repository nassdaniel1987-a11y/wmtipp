// Zentrale Score-Validierung, damit die Grenzen nicht in jeder Function driften.
// Tipps (Vorhersagen) erlauben 0..12, offizielle/Admin-Ergebnisse 0..30.
export const TIP_SCORE_MAX = 12;
export const RESULT_SCORE_MAX = 30;

export function isValidScore(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

export function isValidScorePair(scoreA, scoreB, max) {
  return isValidScore(scoreA, max) && isValidScore(scoreB, max);
}
