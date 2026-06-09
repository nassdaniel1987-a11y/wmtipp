// Reine, testbare Hilfen zum Erzeugen von Demo-Ergebnissen für die WM-Sandbox.
// Bewusst ohne Netlify-/Supabase-Imports, damit Unit-Tests sie direkt laden können.

// Plausible, niedrige Torzahlen (0-4, Schwerpunkt 0-2).
export function sampleGoals(random = Math.random) {
  const value = random();
  if (value < 0.3) return 0;
  if (value < 0.62) return 1;
  if (value < 0.84) return 2;
  if (value < 0.95) return 3;
  return 4;
}

// Erzeugt für jede Match-ID ein finales Demo-Ergebnis.
export function generateWmTestResultRows(matchIds = [], { random = Math.random, now = new Date() } = {}) {
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return matchIds
    .filter((id) => typeof id === "string" && id.length > 0)
    .map((matchId) => ({
      match_id: matchId,
      score_a: sampleGoals(random),
      score_b: sampleGoals(random),
      status: "final",
      updated_at: timestamp,
    }));
}
