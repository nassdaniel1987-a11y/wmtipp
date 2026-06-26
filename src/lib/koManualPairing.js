export function normalizeKnockoutOverride(override = {}) {
  const teamA = typeof override.teamA === "string" ? override.teamA.trim() : "";
  const teamB = typeof override.teamB === "string" ? override.teamB.trim() : "";
  const normalized = {};
  if (teamA) normalized.teamA = teamA;
  if (teamB) normalized.teamB = teamB;
  return normalized;
}

export function buildManualKnockoutSaveRequest(matchId, override = {}) {
  const manualPairing = normalizeKnockoutOverride(override);
  if (!matchId || Object.keys(manualPairing).length === 0) return null;

  return {
    mode: "apply",
    scope: "partial",
    updateIds: [matchId],
    manualPairings: {
      [matchId]: manualPairing,
    },
  };
}
