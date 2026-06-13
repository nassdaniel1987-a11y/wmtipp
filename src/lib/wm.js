// Geteilte WM-Domaenenhelfer (Tippabgabe-Ansicht + Admin).
import { groupFilters, KO_PHASES } from "./constants.js";
import { findPlayerByText } from "./players.js";

export function getInviteUrl(code) {
  const url = new URL(window.location.origin);
  url.searchParams.set("code", code);
  url.hash = "start";
  return url.toString();
}

export function getTeamMeta(matches) {
  const meta = new Map();
  matches.forEach((match) => {
    if (!meta.has(match.teamA)) {
      meta.set(match.teamA, { name: match.teamA, flagCode: match.flagCodeA ?? "" });
    }
    if (!meta.has(match.teamB)) {
      meta.set(match.teamB, { name: match.teamB, flagCode: match.flagCodeB ?? "" });
    }
  });
  return meta;
}

export function getGroups(matches) {
  const teamMeta = getTeamMeta(matches);

  return groupFilters
    .filter((group) => !["alle", "deutschland"].includes(group))
    .map((groupKey) => {
      const teams = Array.from(
        new Set(
          matches
            .filter((match) => match.groupKey === groupKey)
            .flatMap((match) => [match.teamA, match.teamB]),
        ),
      )
        .sort((first, second) => first.localeCompare(second, "de"))
        .map((team) => teamMeta.get(team) ?? { name: team, flagCode: "" });

      return { groupKey, teams };
    })
    .filter((group) => group.teams.length > 0);
}

export function isKnockoutPhase(match) {
  return KO_PHASES.includes(match?.phase);
}

export function createInitialBonusTips(matches, savedBonusTip = null, players = []) {
  const groups = getGroups(matches);
  const savedGroupWinners = savedBonusTip?.group_winners ?? savedBonusTip?.groupWinners ?? {};
  const topScorer = savedBonusTip?.top_scorer ?? savedBonusTip?.topScorer ?? "";
  const matchedPlayer = savedBonusTip?.top_scorer_player_id
    ? null
    : findPlayerByText(players, topScorer);

  return {
    champion: savedBonusTip?.champion ?? "",
    topScorer,
    topScorerPlayerId: savedBonusTip?.top_scorer_player_id ?? savedBonusTip?.topScorerPlayerId ?? matchedPlayer?.id ?? "",
    groupWinners: Object.fromEntries(
      groups.map((group) => [group.groupKey, savedGroupWinners[group.groupKey] ?? ""]),
    ),
    saved: Boolean(savedBonusTip),
  };
}

export function createInitialBonusResults(matches, savedBonusResults = null, players = []) {
  const groups = getGroups(matches);
  const savedGroupWinners = savedBonusResults?.group_winners ?? savedBonusResults?.groupWinners ?? {};
  const topScorer = savedBonusResults?.top_scorer ?? savedBonusResults?.topScorer ?? "";
  const matchedPlayer = savedBonusResults?.top_scorer_player_ids?.length
    ? null
    : findPlayerByText(players, topScorer);

  return {
    champion: savedBonusResults?.champion ?? "",
    topScorer,
    topScorerPlayerIds: savedBonusResults?.top_scorer_player_ids ?? savedBonusResults?.topScorerPlayerIds ?? (matchedPlayer ? [matchedPlayer.id] : []),
    groupWinners: Object.fromEntries(
      groups.map((group) => [group.groupKey, savedGroupWinners[group.groupKey] ?? ""]),
    ),
  };
}

export function countGroupWinnerTips(bonusTip) {
  return Object.values(bonusTip?.group_winners ?? {}).filter(Boolean).length;
}

export function isBonusTipStarted(bonusTip) {
  return Boolean(bonusTip?.champion || bonusTip?.top_scorer || countGroupWinnerTips(bonusTip) > 0);
}
