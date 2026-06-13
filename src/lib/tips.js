// Geteilte Tipp-Initialisierung (WM + Bundesliga).

export function createInitialTips(matches, savedTips = []) {
  const savedByMatch = new Map(savedTips.map((tip) => [tip.match_id, tip]));
  return Object.fromEntries(
    matches.map((match) => {
      const saved = savedByMatch.get(match.id);
      return [
        match.id,
        {
          scoreA: Number.isInteger(saved?.score_a) ? saved.score_a : null,
          scoreB: Number.isInteger(saved?.score_b) ? saved.score_b : null,
          saved: Boolean(saved),
        },
      ];
    }),
  );
}
