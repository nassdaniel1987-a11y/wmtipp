import { displayTeamName } from "../teamNames.js";

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

function normalizeTeamFlagKey(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("de-DE");
}

function addTeamFlag(lookup, teamName, flagCode) {
  const team = typeof teamName === "string" ? teamName.trim() : "";
  const flag = typeof flagCode === "string" ? flagCode.trim() : "";
  if (!team || !flag) return;

  for (const name of new Set([team, displayTeamName(team)])) {
    const key = normalizeTeamFlagKey(name);
    if (key && !lookup.has(key)) lookup.set(key, flag);
  }
}

export function buildTeamFlagLookup(matches = []) {
  const lookup = new Map();
  for (const row of matches) {
    addTeamFlag(lookup, row?.team_a, row?.flag_code_a);
    addTeamFlag(lookup, row?.team_b, row?.flag_code_b);
  }
  return lookup;
}

export function resolveTeamFlagCode(flagLookup, teamName) {
  const key = normalizeTeamFlagKey(teamName);
  return key ? (flagLookup.get(key) ?? "") : "";
}
