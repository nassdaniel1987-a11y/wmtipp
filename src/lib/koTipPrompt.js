import { KO_PHASES } from "./constants.js";

export function getKoTipPromptMatches(matches = [], { limit = 3, now = Date.now() } = {}) {
  return matches
    .filter((match) => KO_PHASES.includes(match?.phase))
    .filter((match) => {
      if (!match?.kickoffAt) return true;
      const kickoffMs = new Date(match.kickoffAt).getTime();
      return !Number.isFinite(kickoffMs) || kickoffMs > now;
    })
    .sort((first, second) => (first.matchNumber ?? 0) - (second.matchNumber ?? 0))
    .slice(0, limit);
}

export function shouldShowKoTipPrompt({
  participant,
  koVisible,
  koMatches = [],
  dismissed = false,
  now = Date.now(),
} = {}) {
  return Boolean(
    participant &&
    koVisible &&
    !dismissed &&
    getKoTipPromptMatches(koMatches, { limit: 1, now }).length > 0,
  );
}
