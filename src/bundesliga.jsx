// Bundesliga-Bereich: Konstanten, Routing-/Datenhelfer und die
// Teilnehmer- sowie Admin-Oberflaeche. Importe folgen nach Lint-Pruefung.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Download,
  Goal,
  House,
  Info,
  ListFilter,
  QrCode,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { apiGet, apiPost } from "./api.js";
import {
  clampScore,
  formatDateTime,
  formatDateTimeInput,
  getBundesligaTipCountdown,
} from "./lib/format.js";
import { explainBundesligaPoints, isCompleteTip, pointsFor } from "./lib/scoring.js";
import { AUTO_SAVE_DELAY_MS } from "./lib/constants.js";
import { createInitialTips } from "./lib/tips.js";
import { QrCodeImage, ScoreControl } from "./components/shared.jsx";
export const BUNDESLIGA_FEATURE_ENABLED = true;
export const BUNDESLIGA_STORAGE_KEY = "bundesliga-tippspiel-participant";
export const BUNDESLIGA_DEFAULT_COMPETITION_ID = "bundesliga-2026";
export const BUNDESLIGA_ARCHIVE_COMPETITION_ID = "bundesliga-2025";
export const BUNDESLIGA_RETIRED_LIVE_PROBE_ID = "bundesliga-liveprobe-rel-2026";
export const BUNDESLIGA_BRAND_ASSETS = {
  header: "/brand/bundesliga/logo-header.png",
  compact: "/brand/bundesliga/logo-compact.png",
  icon: "/brand/bundesliga/icon-512.png",
  badgeMatchdayWinner: "/brand/bundesliga/badge-matchday-winner.png",
  badgeRankingTop3: "/brand/bundesliga/badge-ranking-top3.png",
  badgeLive: "/brand/bundesliga/badge-live.png",
  shareCardBg: "/brand/bundesliga/share-card-bg.png",
};

export const bundesligaRuleRows = [
  ["Exaktes Ergebnis", "4 Punkte"],
  ["Richtige Tordifferenz", "3 Punkte"],
  ["Richtige Tendenz", "2 Punkte"],
  ["Falscher Tipp", "0 Punkte"],
  ["Meister richtig", "6 Punkte"],
  ["Torschützenkönig richtig", "6 Punkte"],
  ["Absteiger richtig", "4 Punkte je Verein"],
];

export const bundesligaTabIds = new Set([
  "bundesliga-start",
  "bundesliga-tippen",
  "bundesliga-bonus",
  "bundesliga-rangliste",
  "bundesliga-live",
  "bundesliga-tabelle",
  "bundesliga-torschuetzen",
  "bundesliga-spielplan",
]);
export const BUNDESLIGA_MATCH_DETAIL_PREFIX = "bundesliga-spiel/";

export function getCurrentHashId() {
  return window.location.hash.replace("#", "").trim();
}

export function normalizeBundesligaTabId(tabId = getCurrentHashId()) {
  return tabId;
}

export function getBundesligaTabFromHash() {
  const tabId = normalizeBundesligaTabId();
  if (tabId.startsWith(BUNDESLIGA_MATCH_DETAIL_PREFIX) && tabId.length > BUNDESLIGA_MATCH_DETAIL_PREFIX.length) {
    return tabId;
  }
  return bundesligaTabIds.has(tabId) ? tabId : "bundesliga-start";
}

export function getBundesligaMatchDetailId(tabId) {
  if (!tabId?.startsWith(BUNDESLIGA_MATCH_DETAIL_PREFIX)) return "";
  return decodeURIComponent(tabId.slice(BUNDESLIGA_MATCH_DETAIL_PREFIX.length));
}

export function getBundesligaTabLabel(tabId) {
  if (tabId === "bundesliga-start") return "Zentrale";
  if (tabId === "bundesliga-tippen") return "Spieltag tippen";
  if (tabId === "bundesliga-bonus") return "Bonus";
  if (tabId === "bundesliga-rangliste") return "Rangliste";
  if (tabId === "bundesliga-live") return "Live-Spieltag";
  if (tabId === "bundesliga-tabelle") return "Tabelle";
  if (tabId === "bundesliga-torschuetzen") return "Torschützen";
  if (tabId === "bundesliga-spielplan") return "Spielplan";
  if (getBundesligaMatchDetailId(tabId)) return "Spielauswertung";
  return "Bundesliga";
}

export function getBundesligaCompetitionFromUrl() {
  const requested = new URLSearchParams(window.location.search).get("blCompetition");
  if (requested === BUNDESLIGA_ARCHIVE_COMPETITION_ID || requested === BUNDESLIGA_RETIRED_LIVE_PROBE_ID) {
    return requested;
  }
  return BUNDESLIGA_DEFAULT_COMPETITION_ID;
}

export function isBundesligaRoute() {
  return BUNDESLIGA_FEATURE_ENABLED && getCurrentHashId().startsWith("bundesliga-");
}

export function getBundesligaInviteUrl(code, competitionId = BUNDESLIGA_DEFAULT_COMPETITION_ID) {
  const url = new URL(window.location.origin);
  url.searchParams.set("blCode", code);
  url.searchParams.set("blCompetition", competitionId);
  url.hash = "bundesliga-start";
  return url.toString();
}

export function openBundesligaPreview(competitionId) {
  const url = new URL(window.location.href);
  url.searchParams.delete("test");
  url.searchParams.delete("blCode");
  url.searchParams.set("blCompetition", competitionId);
  url.hash = "bundesliga-start";
  window.location.href = url.toString();
}

export function getBundesligaLogoFallback(name) {
  return String(name || "BL")
    .replace(/^\d+\.\s*/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 3) || "BL";
}

export function BundesligaLogo({ src, name, className = "bundesliga-team-logo" }) {
  const [failed, setFailed] = useState(false);
  const fallback = getBundesligaLogoFallback(name);

  return (
    <span className={className} aria-hidden="true">
      {src && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>{fallback}</span>
      )}
    </span>
  );
}

export function BundesligaBrandLogo({ className = "bundesliga-brand-logo", decorative = false, variant = "header" }) {
  const src = BUNDESLIGA_BRAND_ASSETS[variant] ?? BUNDESLIGA_BRAND_ASSETS.header;

  return (
    <span className={`${className} ${variant ? `is-${variant}` : ""}`}>
      <img
        src={src}
        alt={decorative ? "" : "Österfeld Bundesliga Tippspiel"}
      />
    </span>
  );
}

export function loadSavedBundesligaParticipant() {
  try {
    const raw = window.localStorage.getItem(BUNDESLIGA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function mapBundesligaMatch(row) {
  return {
    id: row.id,
    matchNumber: row.match_number,
    matchday: row.matchday,
    phase: row.phase,
    date: row.match_date,
    time: row.match_time,
    kickoffAt: row.kickoff_at,
    teamA: row.team_a_name,
    teamB: row.team_b_name,
    teamAId: row.team_a_id,
    teamBId: row.team_b_id,
    status: row.status,
  };
}

export function createBundesligaBonusTip(savedBonusTip = null) {
  return {
    championTeamId: savedBonusTip?.champion_team_id ?? "",
    topScorerId: savedBonusTip?.top_scorer_id ?? "",
    topScorer: savedBonusTip?.top_scorer ?? "",
    relegatedTeamIds: savedBonusTip?.relegated_team_ids ?? [],
    saved: Boolean(savedBonusTip),
  };
}

export function createTestBundesligaData() {
  const teams = [
    { id: "bayern", name: "FC Bayern München", short_name: "Bayern", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1f/Logo_FC_Bayern_M%C3%BCnchen_%282002%E2%80%932017%29.svg" },
    { id: "dortmund", name: "Borussia Dortmund", short_name: "BVB", logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg" },
    { id: "leipzig", name: "RB Leipzig", short_name: "RBL", logo_url: null },
    { id: "stuttgart", name: "VfB Stuttgart", short_name: "VfB", logo_url: "https://upload.wikimedia.org/wikipedia/commons/e/eb/VfB_Stuttgart_1893_Logo.svg" },
  ];
  const matches = [
    { id: "bl-test-1", match_number: 1, matchday: 1, phase: "league", match_date: "2026-05-01", match_time: "20:30", kickoff_at: "2026-05-01T18:30:00Z", team_a_id: "bayern", team_b_id: "dortmund", team_a_name: "FC Bayern München", team_b_name: "Borussia Dortmund", status: "final" },
    { id: "bl-test-2", match_number: 2, matchday: 1, phase: "league", match_date: "2026-08-15", match_time: "15:30", kickoff_at: "2026-08-15T13:30:00Z", team_a_id: "leipzig", team_b_id: "stuttgart", team_a_name: "RB Leipzig", team_b_name: "VfB Stuttgart", status: "scheduled" },
    { id: "bl-test-3", match_number: 3, matchday: 2, phase: "league", match_date: "2026-08-21", match_time: "20:30", kickoff_at: "2026-08-21T18:30:00Z", team_a_id: "dortmund", team_b_id: "leipzig", team_a_name: "Borussia Dortmund", team_b_name: "RB Leipzig", status: "scheduled" },
  ];
  const participants = [
    { id: "bl-test", display_name: "Daniel BL" },
    { id: "bl-rival", display_name: "Aaron BL" },
  ];
  const participantTips = [
    { participant_id: "bl-test", match_id: "bl-test-1", score_a: 2, score_b: 1 },
    { participant_id: "bl-rival", match_id: "bl-test-1", score_a: 1, score_b: 1 },
    { participant_id: "bl-rival", match_id: "bl-test-2", score_a: 2, score_b: 0 },
  ];
  return {
    competition: { id: "bundesliga-2026", season_label: "2026/2027", status: "admin_test", public_enabled: false },
    teams,
    matches,
    results: [{ match_id: "bl-test-1", score_a: 2, score_b: 1, status: "final" }],
    participants,
    participantTips,
    goals: [
      { id: "bl-goal-1", match_id: "bl-test-1", minute: 18, scorer_name: "Harry Kane", team_side: "home", is_penalty: false, is_own_goal: false },
      { id: "bl-goal-2", match_id: "bl-test-1", minute: 54, scorer_name: "Jamal Musiala", team_side: "home", is_penalty: false, is_own_goal: false },
      { id: "bl-goal-3", match_id: "bl-test-1", minute: 81, scorer_name: "Serhou Guirassy", team_side: "away", is_penalty: false, is_own_goal: false },
    ],
    topScorers: [
      { id: "kane", display_name: "Harry Kane", goals: 36 },
      { id: "undav", display_name: "Deniz Undav", goals: 19 },
    ],
    ranking: [
      { id: "bl-test", name: "Daniel BL", points: 4, matchPoints: 4, bonusPoints: 0, tipCount: 1, scoredTipCount: 1, averagePoints: 4, matchdayWins: 1, matchdayPoints: { 1: 4 } },
      { id: "bl-rival", name: "Aaron BL", points: 0, matchPoints: 0, bonusPoints: 0, tipCount: 2, scoredTipCount: 1, averagePoints: 0, matchdayWins: 0, matchdayPoints: { 1: 0 } },
    ],
    rulesSummary: {
      matchPoints: bundesligaRuleRows.slice(0, 4),
      visibility: "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar.",
      visibilityMode: "kickoff",
      tieBreaker: "Bei Punktgleichstand zählen zuerst die Spieltagssiege.",
      bonusDeadlineAt: null,
    },
  };
}

export function canViewBundesligaTips(match) {
  if (!match?.kickoffAt) return false;
  const kickoff = new Date(match.kickoffAt);
  return !Number.isNaN(kickoff.getTime()) && kickoff <= new Date();
}

export function getBundesligaMatchState(match, result) {
  if (result?.status === "final") return "finished";
  if (result?.status === "live") return "live";
  return canViewBundesligaTips(match) ? "locked" : "open";
}

export function buildBundesligaBonusStatus(bonusTip) {
  const relegatedDoneCount = Math.min(3, bonusTip?.relegatedTeamIds?.length ?? 0);
  const doneCount = (bonusTip?.championTeamId ? 1 : 0) + (bonusTip?.topScorerId || bonusTip?.topScorer ? 1 : 0) + relegatedDoneCount;
  return {
    doneCount,
    totalCount: 5,
    relegatedDoneCount,
    complete: doneCount >= 5,
  };
}

export function buildBundesligaMatchdayStatus(matches, tips, resultsByMatch) {
  const grouped = new Map();
  matches.forEach((match) => {
    const matchday = Number(match.matchday);
    if (!Number.isInteger(matchday)) return;
    const row = grouped.get(matchday) ?? {
      matchday,
      matchCount: 0,
      savedTipCount: 0,
      openTipCount: 0,
      lockedCount: 0,
      finishedCount: 0,
      status: "open",
    };
    const tip = tips[match.id];
    const result = resultsByMatch.get(match.id);
    row.matchCount += 1;
    if (tip?.saved) row.savedTipCount += 1;
    if (!tip?.saved) row.openTipCount += 1;
    const state = getBundesligaMatchState(match, result);
    if (state === "locked") row.lockedCount += 1;
    if (state === "finished") row.finishedCount += 1;
    grouped.set(matchday, row);
  });
  return Array.from(grouped.values()).map((row) => ({
    ...row,
    status: row.finishedCount === row.matchCount
      ? "finished"
      : row.openTipCount === 0
        ? "complete"
        : row.lockedCount > 0
          ? "locked"
          : "open",
  }));
}

export function buildBundesligaLiveFromData(data, participant, selectedMatchday) {
  const rawMatches = (data?.matches ?? []).map(mapBundesligaMatch).filter((match) => Number(match.matchday) === Number(selectedMatchday));
  const participants = data?.participants ?? [];
  const participantTips = data?.participantTips ?? [];
  const resultsByMatch = new Map((data?.results ?? []).map((result) => [result.match_id, result]));
  const standings = new Map(participants.map((row) => [row.id, {
    participantId: row.id,
    name: row.display_name,
    points: 0,
    tipCount: 0,
    scoredTipCount: 0,
  }]));

  rawMatches.forEach((match) => {
    const result = resultsByMatch.get(match.id);
    participantTips.filter((tip) => tip.match_id === match.id).forEach((tip) => {
      const row = standings.get(tip.participant_id);
      if (!row) return;
      row.tipCount += 1;
      if (result?.status === "final") row.scoredTipCount += 1;
      row.points += pointsFor({ scoreA: tip.score_a, scoreB: tip.score_b }, result);
    });
  });

  return {
    matchday: Number(selectedMatchday),
    standings: Array.from(standings.values())
      .filter((row) => row.tipCount > 0 || row.scoredTipCount > 0)
      .sort((first, second) => second.points - first.points || first.name.localeCompare(second.name, "de")),
    matches: rawMatches.map((match) => {
      const result = resultsByMatch.get(match.id) ?? null;
      const tipsVisible = canViewBundesligaTips(match) || result?.status === "final";
      return {
        id: match.id,
        matchday: match.matchday,
        kickoffAt: match.kickoffAt,
        teamA: match.teamA,
        teamB: match.teamB,
        result,
        status: getBundesligaMatchState(match, result),
        tipsVisible,
        tips: participantTips
          .filter((tip) => tip.match_id === match.id)
          .map((tip) => {
            const isOwnTip = tip.participant_id === participant?.id;
            return {
              participantId: tip.participant_id,
              participantName: participants.find((row) => row.id === tip.participant_id)?.display_name ?? "Teilnehmer",
              isOwnTip,
              visible: tipsVisible || isOwnTip,
              scoreA: tipsVisible || isOwnTip ? tip.score_a : null,
              scoreB: tipsVisible || isOwnTip ? tip.score_b : null,
              points: result?.status === "final" && (tipsVisible || isOwnTip)
                ? pointsFor({ scoreA: tip.score_a, scoreB: tip.score_b }, result)
                : null,
              reason: result?.status === "final" && (tipsVisible || isOwnTip)
                ? explainBundesligaPoints({ scoreA: tip.score_a, scoreB: tip.score_b }, result).reason
                : null,
            };
          }),
      };
    }),
  };
}

export function buildBundesligaTipTrendsFromData(data, selectedMatchday) {
  const rawMatches = (data?.matches ?? []).map(mapBundesligaMatch).filter((match) => Number(match.matchday) === Number(selectedMatchday));
  const matchIds = new Set(rawMatches.map((match) => match.id));
  const trends = new Map();
  (data?.participantTips ?? []).forEach((tip) => {
    if (!matchIds.has(tip.match_id)) return;
    const match = rawMatches.find((row) => row.id === tip.match_id);
    if (!match || !canViewBundesligaTips(match)) return;
    const row = trends.get(tip.match_id) ?? { matchId: tip.match_id, total: 0, home: 0, draw: 0, away: 0 };
    row.total += 1;
    const trend = Math.sign(tip.score_a - tip.score_b);
    if (trend > 0) row.home += 1;
    else if (trend < 0) row.away += 1;
    else row.draw += 1;
    trends.set(tip.match_id, row);
  });
  return Array.from(trends.values()).map((row) => ({
    ...row,
    homePercent: row.total ? Math.round((row.home / row.total) * 100) : 0,
    drawPercent: row.total ? Math.round((row.draw / row.total) * 100) : 0,
    awayPercent: row.total ? Math.round((row.away / row.total) * 100) : 0,
  }));
}

export function buildBundesligaMatchDetailFromData(data, participant, matchId) {
  const sourceMatch = (data?.matches ?? []).find((match) => match.id === matchId);
  const result = (data?.results ?? []).find((row) => row.match_id === matchId);
  if (!sourceMatch || result?.status !== "final") return null;
  const teamsById = new Map((data?.teams ?? []).map((team) => [team.id, team]));
  const participantById = new Map((data?.participants ?? []).map((row) => [row.id, row]));
  const tipRows = (data?.participantTips ?? [])
    .filter((tip) => tip.match_id === matchId)
    .map((tip) => {
      const explanation = explainBundesligaPoints({ scoreA: tip.score_a, scoreB: tip.score_b }, result);
      return {
        participantId: tip.participant_id,
        participantName: participantById.get(tip.participant_id)?.display_name ?? "Teilnehmer",
        isOwnTip: tip.participant_id === participant?.id,
        scoreA: tip.score_a,
        scoreB: tip.score_b,
        points: explanation.points,
        reason: explanation.reason,
      };
    })
    .sort((first, second) => second.points - first.points || first.participantName.localeCompare(second.participantName, "de"));
  const trend = tipRows.reduce((row, tip) => {
    row.total += 1;
    const direction = Math.sign(tip.scoreA - tip.scoreB);
    if (direction > 0) row.home += 1;
    else if (direction < 0) row.away += 1;
    else row.draw += 1;
    return row;
  }, { total: 0, home: 0, draw: 0, away: 0 });

  return {
    match: {
      id: sourceMatch.id,
      matchday: sourceMatch.matchday,
      kickoffAt: sourceMatch.kickoff_at,
      status: "finished",
      teamA: { id: sourceMatch.team_a_id, name: sourceMatch.team_a_name, logoUrl: teamsById.get(sourceMatch.team_a_id)?.logo_url },
      teamB: { id: sourceMatch.team_b_id, name: sourceMatch.team_b_name, logoUrl: teamsById.get(sourceMatch.team_b_id)?.logo_url },
    },
    result,
    goals: (data?.goals ?? []).filter((goal) => goal.match_id === matchId).map((goal) => ({
      id: goal.id,
      minute: goal.minute,
      scorerName: goal.scorer_name,
      teamSide: goal.team_side,
      isPenalty: Boolean(goal.is_penalty),
      isOwnGoal: Boolean(goal.is_own_goal),
    })),
    ownTip: tipRows.find((tip) => tip.isOwnTip) ?? null,
    tips: tipRows,
    tipsVisible: true,
    trend: {
      ...trend,
      homePercent: trend.total ? Math.round((trend.home / trend.total) * 100) : 0,
      drawPercent: trend.total ? Math.round((trend.draw / trend.total) * 100) : 0,
      awayPercent: trend.total ? Math.round((trend.away / trend.total) * 100) : 0,
    },
  };
}

export function BundesligaParticipantApp({ isTestMode }) {
  const selectedCompetitionAtLoad = useMemo(() => getBundesligaCompetitionFromUrl(), []);
  const savedParticipant = useMemo(() => {
    if (selectedCompetitionAtLoad === BUNDESLIGA_ARCHIVE_COMPETITION_ID) return null;
    const saved = loadSavedBundesligaParticipant();
    if (!saved) return null;
    const savedCompetitionId = saved.competitionId ?? BUNDESLIGA_DEFAULT_COMPETITION_ID;
    return savedCompetitionId === selectedCompetitionAtLoad ? { ...saved, competitionId: savedCompetitionId } : null;
  }, [selectedCompetitionAtLoad]);
  const competitionId = selectedCompetitionAtLoad;
  const [activeTab, setActiveTab] = useState(getBundesligaTabFromHash);
  const [data, setData] = useState(() => (isTestMode ? createTestBundesligaData() : null));
  const [participant, setParticipant] = useState(() => (isTestMode ? { id: "bl-test", name: "Daniel BL", code: "BL-TEST" } : savedParticipant));
  const [code, setCode] = useState(() => (
    selectedCompetitionAtLoad === BUNDESLIGA_ARCHIVE_COMPETITION_ID
      ? ""
      : new URLSearchParams(window.location.search).get("blCode")?.trim() || savedParticipant?.code || ""
  ));
  const [name, setName] = useState(() => savedParticipant?.name ?? "");
  const [codeStatus, setCodeStatus] = useState(isTestMode ? "claimed" : code ? "checking" : "missing");
  const [loginState, setLoginState] = useState(() => (
    isTestMode || savedParticipant ? "success" : code ? "checking" : "idle"
  ));
  const [loginFeedback, setLoginFeedback] = useState(() => (
    isTestMode ? "Bundesliga-Testmodus aktiv." : savedParticipant ? "Login gespeichert." : code ? "Code wird geprüft..." : selectedCompetitionAtLoad === BUNDESLIGA_ARCHIVE_COMPETITION_ID ? "Archiv-Demo wird geöffnet..." : "Gib deinen Bundesliga-Code ein."
  ));
  const [tips, setTips] = useState({});
  const [bonusTip, setBonusTip] = useState(createBundesligaBonusTip());
  const [bonusDirty, setBonusDirty] = useState(false);
  const [ranking, setRanking] = useState(() => (isTestMode ? createTestBundesligaData().ranking : []));
  const [selectedMatchday, setSelectedMatchday] = useState(1);
  const [message, setMessage] = useState(isTestMode ? "Bundesliga-Testmodus aktiv" : "Bundesliga wird geladen...");
  const [tipStatuses, setTipStatuses] = useState({});
  const [liveData, setLiveData] = useState(null);
  const [liveTrends, setLiveTrends] = useState([]);
  const [rankingMode, setRankingMode] = useState("total");
  const [personalStats, setPersonalStats] = useState(null);
  const [matchdayWinners, setMatchdayWinners] = useState([]);
  const [compareParticipantId, setCompareParticipantId] = useState("");
  const [liveRefreshKey, setLiveRefreshKey] = useState(0);
  const [liveRefreshStatus, setLiveRefreshStatus] = useState({ state: "idle", message: "" });
  const [matchDetail, setMatchDetail] = useState(null);
  const [matchDetailLoading, setMatchDetailLoading] = useState(false);
  const [matchDetailError, setMatchDetailError] = useState("");
  const [matchDetailReturnTab, setMatchDetailReturnTab] = useState("bundesliga-spielplan");
  const [tipExtrasOpen, setTipExtrasOpen] = useState(() => !window.matchMedia("(max-width: 760px)").matches);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [tipCountdownNow, setTipCountdownNow] = useState(() => Date.now());
  const tipsRef = useRef(tips);
  const bonusRef = useRef(bonusTip);
  const manualLiveRefreshPendingRef = useRef(false);

  const matches = useMemo(() => (data?.matches ?? []).map(mapBundesligaMatch), [data]);
  const teams = data?.teams ?? [];
  const bonusTeams = data?.bonusTeams ?? teams;
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const topScorers = data?.topScorers ?? [];
  const resultsByMatch = useMemo(() => new Map((data?.results ?? []).map((result) => [result.match_id, result])), [data]);
  const matchdayOptions = useMemo(() =>
    Array.from(new Set(matches.map((match) => Number(match.matchday)).filter(Number.isInteger))).sort((a, b) => a - b),
  [matches]);
  const visibleMatches = matches.filter((match) => Number(match.matchday) === Number(selectedMatchday));
  const savedTipCount = Object.values(tips).filter((tip) => tip.saved).length;
  const visibleSavedTipCount = visibleMatches.filter((match) => tips[match.id]?.saved).length;
  const selectedMatchdayIndex = Math.max(0, matchdayOptions.indexOf(Number(selectedMatchday)));
  const matchdayStatusRows = useMemo(() => buildBundesligaMatchdayStatus(matches, tips, resultsByMatch), [matches, tips, resultsByMatch]);
  const selectedMatchdayStatus = matchdayStatusRows.find((row) => Number(row.matchday) === Number(selectedMatchday)) ?? {
    matchday: selectedMatchday,
    matchCount: visibleMatches.length,
    savedTipCount: visibleSavedTipCount,
    openTipCount: Math.max(0, visibleMatches.length - visibleSavedTipCount),
    lockedCount: 0,
    finishedCount: 0,
    status: "open",
  };
  const bonusStatus = buildBundesligaBonusStatus(bonusTip);
  const rulesSummary = data?.rulesSummary;
  const archivePreview = competitionId === BUNDESLIGA_ARCHIVE_COMPETITION_ID;
  const retiredLiveProbe = competitionId === BUNDESLIGA_RETIRED_LIVE_PROBE_ID;
  const communityVisibilityMode = rulesSummary?.visibilityMode ?? "kickoff";
  const bonusLocked = archivePreview || Boolean(rulesSummary?.bonusDeadlineAt && new Date(rulesSummary.bonusDeadlineAt) <= new Date());

  function accessHeaders(activeCode = participant?.code) {
    return {
      "X-Bundesliga-Competition": competitionId,
      ...(activeCode ? { "X-Bundesliga-Code": activeCode } : {}),
    };
  }

  useEffect(() => {
    tipsRef.current = tips;
  }, [tips]);

  useEffect(() => {
    bonusRef.current = bonusTip;
  }, [bonusTip]);

  useEffect(() => {
    function syncTab() {
      setActiveTab(getBundesligaTabFromHash());
    }
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, []);

  useEffect(() => {
    if (!participant && !archivePreview && activeTab !== "bundesliga-start") {
      setBundesligaTab("bundesliga-start");
    }
  }, [activeTab, participant, archivePreview]);

  useEffect(() => {
    async function loadData() {
      if (retiredLiveProbe) return;
      if (isTestMode) {
        const testData = createTestBundesligaData();
        setData(testData);
        setTips(createInitialTips(
          testData.matches.map(mapBundesligaMatch),
          testData.participantTips.filter((tip) => tip.participant_id === "bl-test"),
        ));
        setRanking(testData.ranking);
        setSelectedMatchday(1);
        return;
      }
      try {
        const payload = await apiGet("/api/bundesliga-public-data", accessHeaders());
        setData(payload);
        if (archivePreview && payload.showcaseParticipant && !participant?.id) {
          const showcase = {
            id: payload.showcaseParticipant.id,
            name: payload.showcaseParticipant.display_name,
            competitionId,
            showcase: true,
          };
          setParticipant(showcase);
          setName(showcase.name);
          setLoginState("success");
          setLoginFeedback("Schreibgeschützte Demo-Ansicht geöffnet.");
        }
        const mappedMatches = (payload.matches ?? []).map(mapBundesligaMatch);
        setTips(createInitialTips(mappedMatches));
        setSelectedMatchday(Number(mappedMatches[0]?.matchday) || 1);
        await refreshRanking();
        setMessage(archivePreview ? "Archiv-Demo bereit" : "Bundesliga bereit");
      } catch (error) {
        setMessage(error.message);
      }
    }
    loadData();
  }, [isTestMode, participant?.code, competitionId, archivePreview, retiredLiveProbe]);

  useEffect(() => {
    async function resolveParticipant() {
      if (retiredLiveProbe) return;
      if (isTestMode) return;
      if (!code || participant?.id) return;
      setLoginState("checking");
      setLoginFeedback("Code wird geprüft...");
      try {
        const payload = await apiGet(`/api/bundesliga-participant?code=${encodeURIComponent(code)}`, accessHeaders(""));
        setCodeStatus(payload.codeStatus);
        if (payload.participant) {
          const saved = { id: payload.participant.id, name: payload.participant.display_name, code, competitionId };
          setParticipant(saved);
          setName(saved.name);
          window.localStorage.setItem(BUNDESLIGA_STORAGE_KEY, JSON.stringify(saved));
          setLoginState("success");
          setLoginFeedback(`Willkommen zurück, ${saved.name}.`);
        } else if (payload.codeStatus === "free" && archivePreview) {
          setLoginState("error");
          setLoginFeedback("Archivvorschau: Nur bereits zugeordnete Codes können vorhandene Stände ansehen.");
        } else if (payload.codeStatus === "free") {
          setLoginState("needsName");
          setLoginFeedback("Code erkannt. Jetzt fehlt nur dein Name.");
        } else {
          setLoginState("error");
          setLoginFeedback("Dieser Bundesliga-Code ist nicht aktiv.");
        }
      } catch {
        setLoginFeedback("Dieser Bundesliga-Code wurde nicht gefunden.");
        setMessage("Dieser Bundesliga-Code wurde nicht gefunden.");
        setCodeStatus("unknown");
        setLoginState("error");
      }
    }
    resolveParticipant();
  }, [code, participant?.id, isTestMode, competitionId, archivePreview, retiredLiveProbe]);

  useEffect(() => {
    async function loadParticipantState() {
      if (retiredLiveProbe || isTestMode || !participant?.id || !matches.length) return;
      try {
        const [tipPayload, bonusPayload] = await Promise.all([
          apiGet("/api/bundesliga-tips", accessHeaders()),
          apiGet("/api/bundesliga-bonus-tips", accessHeaders()).catch(() => ({ bonusTip: null })),
        ]);
        setTips(createInitialTips(matches, tipPayload.tips ?? []));
        setBonusTip(createBundesligaBonusTip(bonusPayload.bonusTip));
        setBonusDirty(false);
        await refreshRanking();
      } catch (error) {
        setMessage(error.message);
      }
    }
    loadParticipantState();
  }, [participant?.id, matches, isTestMode, competitionId, retiredLiveProbe]);

  useEffect(() => {
    if (retiredLiveProbe || !participant?.id) {
      setLiveData(null);
      return undefined;
    }
    let cancelled = false;
    const manualRefresh = manualLiveRefreshPendingRef.current;
    manualLiveRefreshPendingRef.current = false;
    async function loadLiveData() {
      if (isTestMode) {
        setLiveData(buildBundesligaLiveFromData(data, participant, selectedMatchday));
        setLiveTrends(buildBundesligaTipTrendsFromData(data, selectedMatchday));
        if (manualRefresh) setLiveRefreshStatus({ state: "success", message: "Live-Daten neu geladen." });
        return;
      }
      try {
        const payload = await apiGet(`/api/bundesliga-matchday-live?matchday=${encodeURIComponent(selectedMatchday)}`, accessHeaders());
        if (!cancelled) {
          setLiveData(payload.live ?? null);
          setLiveTrends(payload.trends ?? []);
          if (manualRefresh) setLiveRefreshStatus({ state: "success", message: "Live-Daten neu geladen." });
        }
      } catch (error) {
        if (!cancelled) {
          setLiveData(null);
          setLiveTrends([]);
          if (manualRefresh) setLiveRefreshStatus({ state: "error", message: error.message || "Live-Daten konnten nicht geladen werden." });
        }
      }
    }
    loadLiveData();
    return () => {
      cancelled = true;
    };
  }, [participant?.id, selectedMatchday, data, isTestMode, liveRefreshKey, competitionId, retiredLiveProbe]);

  function refreshLiveDataManually() {
    manualLiveRefreshPendingRef.current = true;
    setLiveRefreshStatus({ state: "loading", message: "Live-Daten werden geladen..." });
    setLiveRefreshKey((current) => current + 1);
  }

  useEffect(() => {
    if (!participant?.id || !["bundesliga-start", "bundesliga-live"].includes(activeTab)) return undefined;
    if (!(liveData?.matches ?? []).some((match) => match.status === "live")) return undefined;
    const timer = window.setInterval(() => {
      setLiveRefreshKey((current) => current + 1);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [activeTab, participant?.id, liveData?.matches]);

  useEffect(() => {
    if (activeTab !== "bundesliga-tippen" || archivePreview) return undefined;
    const now = Date.now();
    const nextKickoff = visibleMatches
      .filter((match) => getBundesligaMatchState(match, resultsByMatch.get(match.id)) === "open")
      .map((match) => new Date(match.kickoffAt).getTime())
      .filter((kickoffMs) => Number.isFinite(kickoffMs) && kickoffMs > now)
      .sort((first, second) => first - second)[0];
    if (!nextKickoff) return undefined;
    const countdownDelay = nextKickoff - now - 5 * 60 * 1000;
    let countdownTimer;
    let countdownStartTimer;
    const startCountdown = () => {
      setTipCountdownNow(Date.now());
      countdownTimer = window.setInterval(() => setTipCountdownNow(Date.now()), 1000);
    };
    if (countdownDelay <= 0) {
      startCountdown();
    } else if (countdownDelay < 2_147_000_000) {
      countdownStartTimer = window.setTimeout(startCountdown, countdownDelay);
    }
    return () => {
      window.clearTimeout(countdownStartTimer);
      window.clearInterval(countdownTimer);
    };
  }, [activeTab, archivePreview, selectedMatchday, matches, resultsByMatch]);

  useEffect(() => {
    const matchId = getBundesligaMatchDetailId(activeTab);
    if (retiredLiveProbe || !matchId || !participant?.id) return undefined;
    let cancelled = false;
    async function loadMatchDetail() {
      setMatchDetailLoading(true);
      setMatchDetailError("");
      if (isTestMode) {
        const detail = buildBundesligaMatchDetailFromData(data, participant, matchId);
        if (!cancelled) {
          setMatchDetail(detail);
          setMatchDetailError(detail ? "" : "Für dieses Spiel ist noch keine Auswertung verfügbar.");
          setMatchDetailLoading(false);
        }
        return;
      }
      try {
        const payload = await apiGet(`/api/bundesliga-match-detail?matchId=${encodeURIComponent(matchId)}`, accessHeaders());
        if (!cancelled) setMatchDetail(payload);
      } catch (error) {
        if (!cancelled) {
          setMatchDetail(null);
          setMatchDetailError(error.message);
        }
      } finally {
        if (!cancelled) setMatchDetailLoading(false);
      }
    }
    void loadMatchDetail();
    return () => {
      cancelled = true;
    };
  }, [activeTab, participant?.id, data, isTestMode, competitionId, retiredLiveProbe]);

  useEffect(() => {
    const pendingIds = Object.entries(tipStatuses)
      .filter(([, status]) => status === "pending")
      .map(([matchId]) => matchId)
      .filter((matchId) => isCompleteTip(tipsRef.current[matchId]));
    if (!pendingIds.length) return undefined;
    const timer = window.setTimeout(() => {
      void saveTipRows(pendingIds, tipsRef.current);
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [tipStatuses, participant?.id]);

  useEffect(() => {
    if (!participant?.id || !bonusDirty || bonusTip.saved || archivePreview) return undefined;
    const timer = window.setTimeout(() => {
      void saveBonus(bonusRef.current, { auto: true });
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [bonusTip, bonusDirty, participant?.id, archivePreview]);

  function setBundesligaTab(tabId) {
    if (!bundesligaTabIds.has(tabId)) return;
    setMobileMoreOpen(false);
    window.location.hash = tabId;
    setActiveTab(tabId);
    window.scrollTo(0, 0);
  }

  function openBundesligaMatchDetail(matchId, returnTab) {
    setMatchDetailReturnTab(returnTab);
    const detailTab = `${BUNDESLIGA_MATCH_DETAIL_PREFIX}${encodeURIComponent(matchId)}`;
    window.location.hash = detailTab;
    setActiveTab(detailTab);
    window.scrollTo(0, 0);
  }

  async function refreshRanking() {
    if (isTestMode) {
      const testData = createTestBundesligaData();
      setRanking(testData.ranking);
      setMatchdayWinners([{ matchday: 1, bestPoints: 4, winners: [{ participantId: "bl-test", name: "Daniel BL", points: 4 }] }]);
      setPersonalStats({ savedTipCount: 1, scoredTipCount: 1, exactHits: 1, goalDiffHits: 0, tendencyHits: 0, wrongTips: 0, bestMatchdays: [{ matchday: 1, points: 4 }] });
      return;
    }
    const payload = await apiGet("/api/bundesliga-ranking", accessHeaders()).catch(() => ({ ranking: [] }));
    setRanking(payload.ranking ?? []);
    setMatchdayWinners(payload.matchdayWinners ?? []);
    setPersonalStats(payload.personalStats ?? null);
  }

  async function checkBundesligaCode(event) {
    event.preventDefault();
    const cleanCode = code.trim();
    if (!cleanCode) {
      setLoginState("error");
      setLoginFeedback("Bitte gib deinen Bundesliga-Code ein.");
      return;
    }
    if (isTestMode) return;
    setLoginState("checking");
    setLoginFeedback("Code wird geprüft...");
    setCodeStatus("checking");
    try {
      const payload = await apiGet(`/api/bundesliga-participant?code=${encodeURIComponent(cleanCode)}`, accessHeaders(""));
      setCodeStatus(payload.codeStatus);
      if (payload.participant) {
        const saved = { id: payload.participant.id, name: payload.participant.display_name, code: cleanCode, competitionId };
        setParticipant(saved);
        setName(saved.name);
        window.localStorage.setItem(BUNDESLIGA_STORAGE_KEY, JSON.stringify(saved));
        setLoginState("success");
        setLoginFeedback(`Login erfolgreich. Willkommen zurück, ${saved.name}.`);
        setMessage("Bundesliga-Login erfolgreich.");
      } else if (payload.codeStatus === "free" && archivePreview) {
        setLoginState("error");
        setLoginFeedback("Archivvorschau: Dieser freie Code kann hier nicht aktiviert werden.");
        setMessage("Archivvorschau: Änderungen sind nicht möglich.");
      } else if (payload.codeStatus === "free") {
        setLoginState("needsName");
        setLoginFeedback("Code erkannt. Trag deinen Namen ein, dann ist dein Bereich bereit.");
        setMessage("Bundesliga-Code erkannt.");
      } else {
        setLoginState("error");
        setLoginFeedback("Dieser Bundesliga-Code ist nicht aktiv.");
        setMessage("Dieser Bundesliga-Code ist nicht aktiv.");
      }
    } catch (error) {
      setCodeStatus("unknown");
      setLoginState("error");
      setLoginFeedback(error.message || "Dieser Bundesliga-Code wurde nicht gefunden.");
      setMessage(error.message || "Dieser Bundesliga-Code wurde nicht gefunden.");
    }
  }

  async function claimCode(event) {
    event.preventDefault();
    if (!code.trim() || name.trim().length < 2) return;
    if (isTestMode) return;
    if (archivePreview) {
      setLoginState("error");
      setLoginFeedback("Archivvorschau: Neue Zugänge werden nur für 2026/2027 aktiviert.");
      return;
    }
    setLoginState("submitting");
    setLoginFeedback("Dein Bundesliga-Zugang wird angelegt...");
    try {
      const payload = await apiPost("/api/bundesliga-claim-code", { code, name }, undefined, accessHeaders(""));
      const saved = { id: payload.participant.id, name: payload.participant.display_name, code, competitionId };
      setParticipant(saved);
      setName(saved.name);
      setCodeStatus("claimed");
      setLoginState("success");
      setLoginFeedback(`Login erfolgreich. Willkommen, ${saved.name}.`);
      window.localStorage.setItem(BUNDESLIGA_STORAGE_KEY, JSON.stringify(saved));
      setMessage("Bundesliga-Code aktiviert.");
    } catch (error) {
      setLoginState("error");
      setLoginFeedback(error.message);
      setMessage(error.message);
    }
  }

  function resetBundesligaLogin() {
    window.localStorage.removeItem(BUNDESLIGA_STORAGE_KEY);
    setParticipant(null);
    setCode("");
    setName("");
    setCodeStatus("missing");
    setLoginState("idle");
    setLoginFeedback(archivePreview ? "Archiv-Demo wird geöffnet..." : "Gib deinen Bundesliga-Code ein.");
    setTips(createInitialTips(matches));
    setBonusTip(createBundesligaBonusTip());
    setBonusDirty(false);
    setRanking([]);
    setPersonalStats(null);
    setMatchdayWinners([]);
    setLiveData(null);
    setLiveTrends([]);
    setMatchDetail(null);
    setMatchDetailError("");
    setMessage("Bundesliga-Code erforderlich.");
    setBundesligaTab("bundesliga-start");
  }

  function changeScore(matchId, side, delta) {
    if (archivePreview) {
      setMessage("Archivvorschau: Änderungen sind nicht möglich.");
      return;
    }
    setTips((current) => {
      const tip = current[matchId] ?? {};
      const otherSide = side === "scoreA" ? "scoreB" : "scoreA";
      const hasValue = Number.isInteger(tip[side]);
      const next = {
        ...tip,
        [side]: hasValue ? clampScore(tip[side] + delta) : 0,
        saved: false,
      };
      // Erster Tipp von -:- aus: beide Seiten gemeinsam auf 0 -> 0:0
      if (!hasValue && !Number.isInteger(tip[otherSide])) {
        next[otherSide] = 0;
      }
      return { ...current, [matchId]: next };
    });
    setTipStatuses((current) => ({ ...current, [matchId]: "pending" }));
  }

  async function saveTipRows(matchIds, sourceTips = tipsRef.current) {
    if (!participant?.id) {
      setMessage("Bitte zuerst Bundesliga-Code aktivieren.");
      return;
    }
    if (archivePreview) {
      setMessage("Archivvorschau: Änderungen sind nicht möglich.");
      return;
    }
    const completeIds = matchIds.filter((matchId) => isCompleteTip(sourceTips[matchId]));
    if (!completeIds.length) {
      setMessage("Bitte erst beide Torzahlen auswählen. Neue Tipps starten mit -:-.");
      return;
    }
    if (isTestMode) {
      setTips((current) => ({ ...current, ...Object.fromEntries(completeIds.map((id) => [id, { ...current[id], saved: true }])) }));
      setTipStatuses((current) => ({ ...current, ...Object.fromEntries(completeIds.map((id) => [id, "saved"])) }));
      setMessage("Bundesliga-Testtipp gespeichert.");
      setLiveRefreshKey((current) => current + 1);
      return;
    }
    try {
      const payload = await apiPost("/api/bundesliga-save-tips", {
        tips: completeIds.map((matchId) => ({
          matchId,
          scoreA: sourceTips[matchId].scoreA,
          scoreB: sourceTips[matchId].scoreB,
        })),
      }, undefined, accessHeaders());
      const savedIds = new Set((payload.tips ?? []).map((tip) => tip.match_id));
      setTips((current) => {
        const next = { ...current };
        savedIds.forEach((id) => { next[id] = { ...next[id], saved: true }; });
        return next;
      });
      setTipStatuses((current) => ({ ...current, ...Object.fromEntries([...savedIds].map((id) => [id, "saved"])) }));
      setMessage("Bundesliga-Tipp gespeichert.");
      setLiveRefreshKey((current) => current + 1);
      await refreshRanking();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveVisibleMatchdayTips() {
    await saveTipRows(visibleMatches.map((match) => match.id));
  }

  function jumpToFirstOpenTip() {
    const firstOpen = visibleMatches.find((match) => !tips[match.id]?.saved);
    if (firstOpen) {
      document.getElementById(`bundesliga-match-${firstOpen.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const firstOpenStatus = matchdayStatusRows.find((row) => row.openTipCount > 0);
    if (firstOpenStatus) setSelectedMatchday(firstOpenStatus.matchday);
  }

  function updateBonus(patch) {
    if (archivePreview) {
      setMessage("Archivvorschau: Änderungen sind nicht möglich.");
      return;
    }
    if (bonusLocked) {
      setMessage("Die Bundesliga-Bonusfrist ist abgelaufen.");
      return;
    }
    setBonusTip((current) => ({ ...current, ...patch, saved: false }));
    setBonusDirty(true);
  }

  function moveMatchday(delta) {
    if (!matchdayOptions.length) return;
    const nextIndex = Math.max(0, Math.min(matchdayOptions.length - 1, selectedMatchdayIndex + delta));
    setSelectedMatchday(matchdayOptions[nextIndex]);
  }

  function toggleRelegatedTeam(teamId) {
    const current = bonusTip.relegatedTeamIds ?? [];
    const next = current.includes(teamId)
      ? current.filter((id) => id !== teamId)
      : [...current, teamId].slice(0, 3);
    updateBonus({ relegatedTeamIds: next });
  }

  function teamBadge(teamId, name, { align = "left" } = {}) {
    const team = teamsById.get(teamId);
    return (
      <span className={`bundesliga-team-badge ${align === "right" ? "reverse" : ""}`}>
        <BundesligaLogo src={team?.logo_url} name={team?.name ?? name} />
        <strong>{team?.name ?? name}</strong>
      </span>
    );
  }

  function matchStatusLabel(match, result, tip) {
    const state = getBundesligaMatchState(match, result);
    if (result?.status === "final") return "ausgewertet";
    if (result?.status === "live") return "LIVE";
    if (tip?.saved) return "gespeichert";
    if (state === "locked") return "gesperrt";
    return "offen";
  }

  async function saveBonus(source = bonusRef.current, { auto = false } = {}) {
    if (!participant?.id) {
      setMessage("Bitte zuerst Bundesliga-Code aktivieren.");
      return;
    }
    if (archivePreview) {
      setMessage("Archivvorschau: Änderungen sind nicht möglich.");
      return;
    }
    if (isTestMode) {
      setBonusTip((current) => ({ ...current, saved: true }));
      setBonusDirty(false);
      setMessage(auto ? "Bundesliga-Bonus automatisch gespeichert." : "Bundesliga-Bonus gespeichert.");
      return;
    }
    if (bonusLocked) {
      setMessage("Die Bundesliga-Bonusfrist ist abgelaufen.");
      return;
    }
    try {
      const scorer = topScorers.find((row) => row.id === source.topScorerId);
      const payload = await apiPost("/api/bundesliga-save-bonus-tips", {
        championTeamId: source.championTeamId,
        topScorerId: source.topScorerId,
        topScorer: scorer?.display_name ?? source.topScorer,
        relegatedTeamIds: source.relegatedTeamIds,
      }, undefined, accessHeaders());
      setBonusTip(createBundesligaBonusTip(payload.bonusTip));
      setBonusDirty(false);
      setMessage(auto ? "Bundesliga-Bonus automatisch gespeichert." : "Bundesliga-Bonus gespeichert.");
      await refreshRanking();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function renderLoginPanel() {
    const needsName = loginState === "needsName";
    const busy = loginState === "checking" || loginState === "submitting";
    return (
      <section className={`bundesliga-login-panel state-${loginState}`}>
        <div>
          <strong>Mit deinem Code einloggen</strong>
          <span>{loginFeedback}</span>
        </div>
        <form onSubmit={needsName ? claimCode : checkBundesligaCode}>
          <label>
            Code
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                if (loginState !== "idle") {
                  setLoginState("idle");
                  setLoginFeedback("Code bereit zur Prüfung.");
                }
              }}
              placeholder="BL-..."
              autoComplete="one-time-code"
              autoFocus
            />
          </label>
          {needsName && (
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dein Name" />
            </label>
          )}
          <button type="submit" disabled={busy || !code.trim() || (needsName && name.trim().length < 2)}>
            {needsName ? "Zugang aktivieren" : busy ? "Prüfe..." : "Einloggen"}
          </button>
        </form>
      </section>
    );
  }

  function renderNextStepCard() {
    let title = "Code aktivieren";
    let detail = "Logge dich ein, damit deine Zentrale personalisiert wird.";
    let actionLabel = "Zum Login";
    let action = () => setBundesligaTab("bundesliga-start");
    if (participant && archivePreview) {
      title = "Archivstand ansehen";
      detail = "Dieser Saisonstand ist schreibgeschützt. Ergebnisse, Rangliste und gespeicherte Tipps bleiben einsehbar.";
      actionLabel = "Rangliste ansehen";
      action = () => setBundesligaTab("bundesliga-rangliste");
    } else if (participant && preseasonPending) {
      title = "Spielplan 2026/27 noch nicht verfügbar";
      detail = "Sobald der offizielle Spielplan importiert ist, werden hier deine Spieltage und Tipps freigeschaltet.";
      actionLabel = null;
    } else if (participant && openTipCount > 0) {
      title = `Spieltag ${nextOpenMatchday} tippen`;
      detail = `${openTipCount} Tipps sind noch offen. Der nächste offene Spieltag wartet schon.`;
      actionLabel = "Tipps öffnen";
      action = () => {
        setSelectedMatchday(nextOpenMatchday);
        setBundesligaTab("bundesliga-tippen");
      };
    } else if (participant && !bonusStatus.complete) {
      title = "Bonus fertig machen";
      detail = `${bonusStatus.doneCount}/${bonusStatus.totalCount} Bonus-Tipps sind gespeichert.`;
      actionLabel = "Bonus öffnen";
      action = () => setBundesligaTab("bundesliga-bonus");
    } else if (participant) {
      title = "Alles bereit";
      detail = "Tipps und Bonus sind gespeichert. Jetzt kannst du Live-Spieltag und Rangliste verfolgen.";
      actionLabel = "Live öffnen";
      action = () => setBundesligaTab("bundesliga-live");
    }
    return (
      <section className="bundesliga-next-step">
        <span>Nächster Schritt</span>
        <h2>{title}</h2>
        <p>{detail}</p>
        {actionLabel && <button type="button" onClick={action}>{actionLabel}</button>}
      </section>
    );
  }

  function renderMatchdayCommandCenter() {
    const focusMatch = nextOpenMatch ?? dashboardMatches[0] ?? null;
    return (
      <section className="bundesliga-matchday-command" aria-label="Bundesliga Matchday Zentrale">
        <div className="bundesliga-matchday-command-main">
          <span>{preseasonPending ? "Saisonvorbereitung" : liveMatchCount > 0 ? `${liveMatchCount} live` : "Nächster Fokus"}</span>
          <h2>{nextActionTitle}</h2>
          <p>{nextActionDetail}</p>
          <div className="bundesliga-progress-meter" aria-label={`${tipCompletionPercent} Prozent der Tipps gespeichert`}>
            <span style={{ width: `${tipCompletionPercent}%` }} />
          </div>
          <small>{savedTipCount} von {matches.length} Tipps gespeichert</small>
        </div>
        {focusMatch && !preseasonPending && (
          <div className="bundesliga-command-fixture">
            <time>{formatDateTime(focusMatch.kickoffAt)}</time>
            <div>
              {teamBadge(focusMatch.teamAId, focusMatch.teamA)}
              <b>{resultsByMatch.get(focusMatch.id) ? `${resultsByMatch.get(focusMatch.id).score_a}:${resultsByMatch.get(focusMatch.id).score_b}` : "vs"}</b>
              {teamBadge(focusMatch.teamBId, focusMatch.teamB, { align: "right" })}
            </div>
          </div>
        )}
        <div className="bundesliga-command-rail">
          <article>
            <span>Platz</span>
            <strong>{currentRankPosition ? `#${currentRankPosition}` : "-"}</strong>
            <small>{pointsToNextRank > 0 ? `${pointsToNextRank} P bis nach oben` : currentRankPosition === 1 ? "Tabellenführer" : "nach erster Wertung"}</small>
          </article>
          <article>
            <span>Bonus</span>
            <strong>{bonusAvailable ? `${bonusStatus.doneCount}/${bonusStatus.totalCount}` : "-"}</strong>
            <small>{bonusStatus.complete ? "vollständig" : "noch offen"}</small>
          </article>
          <article>
            <span>Community</span>
            <strong>{latestMatchdayWinner ? `ST ${latestMatchdayWinner.matchday}` : liveMatchCount > 0 ? "Live" : "-"}</strong>
            <small>{latestMatchdayWinner ? `${latestMatchdayWinner.bestPoints} P bester Spieltag` : `${visibleLiveTipCount} sichtbare Live-Tipps`}</small>
          </article>
        </div>
        <div className="bundesliga-command-actions">
          <button type="button" onClick={nextAction}>{nextActionLabel}</button>
          <button type="button" className="secondary" onClick={() => setBundesligaTab("bundesliga-live")}>Live öffnen</button>
        </div>
      </section>
    );
  }

  function renderBonusReminder() {
    const bonusDeadlineText = rulesSummary?.bonusDeadlineAt
      ? `Bonusfrist: ${formatDateTime(rulesSummary.bonusDeadlineAt)}`
      : "Bonusfrist: bis zum Saisonstart";
    return (
      <section className={`bundesliga-public-card bundesliga-bonus-reminder ${bonusStatus.complete ? "complete" : ""}`}>
        <h2>Bonusfragen</h2>
        <p>{bonusStatus.doneCount} / {bonusStatus.totalCount} Bonus-Tipps erledigt · Meister, Torschützenkönig und Absteiger.</p>
        <small>{bonusDeadlineText}</small>
        <div>
          <span className={bonusTip.championTeamId ? "done" : ""}>Meister</span>
          <span className={bonusTip.topScorerId || bonusTip.topScorer ? "done" : ""}>Torschützenkönig</span>
          <span className={bonusStatus.relegatedDoneCount === 3 ? "done" : ""}>Absteiger {bonusStatus.relegatedDoneCount}/3</span>
        </div>
        <button type="button" onClick={() => setBundesligaTab("bundesliga-bonus")}>
          {archivePreview ? "Bonus ansehen" : "Bonus öffnen"}
        </button>
      </section>
    );
  }

  function renderBonusProgress() {
    const bonusDeadlineText = rulesSummary?.bonusDeadlineAt
      ? `Frist: ${formatDateTime(rulesSummary.bonusDeadlineAt)}`
      : "Frist: bis zum Saisonstart";
    return (
      <section className={`bundesliga-bonus-progress ${bonusStatus.complete ? "complete" : ""}`}>
        <div>
          <strong>{bonusStatus.doneCount}/{bonusStatus.totalCount} Bonus-Tipps erledigt</strong>
          <small>{bonusDeadlineText}</small>
        </div>
        <span className={bonusTip.championTeamId ? "done" : ""}>Meister</span>
        <span className={bonusTip.topScorerId || bonusTip.topScorer ? "done" : ""}>Torschütze</span>
        <span className={bonusStatus.relegatedDoneCount === 3 ? "done" : ""}>Absteiger {bonusStatus.relegatedDoneCount}/3</span>
      </section>
    );
  }

  function renderRulesCard() {
    return (
      <section className="bundesliga-public-card bundesliga-rules-card">
        <h2>Regeln</h2>
        <div className="bundesliga-rule-list compact">
          {(rulesSummary?.matchPoints ?? bundesligaRuleRows.slice(0, 4)).map(([label, value]) => (
            <div key={label}><span>{label}</span><b>{value}</b></div>
          ))}
        </div>
        <p>{rulesSummary?.visibility ?? "Fremde Tipps werden pro Spiel ab Anpfiff sichtbar."} {rulesSummary?.tieBreaker ?? "Bei Punktgleichstand zählen zuerst die Spieltagssiege."}</p>
        {rulesSummary?.bonusDeadlineAt && <p>Bonusfrist: {formatDateTime(rulesSummary.bonusDeadlineAt)}</p>}
      </section>
    );
  }

  function renderMatchdayCenter() {
    return (
      <section className="bundesliga-matchday-center">
        <div>
          <strong>Spieltag {selectedMatchday}</strong>
          <span>{selectedMatchdayStatus.savedTipCount}/{selectedMatchdayStatus.matchCount} Tipps gespeichert</span>
        </div>
        <div>
          <span className="open">{selectedMatchdayStatus.openTipCount} offen</span>
          <span>{selectedMatchdayStatus.lockedCount} gesperrt</span>
          <span>{selectedMatchdayStatus.finishedCount} ausgewertet</span>
        </div>
        <div className="bundesliga-matchday-actions">
          {archivePreview ? (
            <span>Archivstand - keine Speicherung möglich.</span>
          ) : (
            <>
              <button type="button" onClick={saveVisibleMatchdayTips}>Alle Tipps dieses Spieltags speichern</button>
              <button type="button" className="secondary" onClick={jumpToFirstOpenTip}>Zum nächsten offenen Tipp</button>
            </>
          )}
        </div>
      </section>
    );
  }

  function renderCardHeading(label, onClick, children = null) {
    return (
      <h2 className="bundesliga-card-heading">
        <button type="button" className="bundesliga-card-heading-link" onClick={onClick}>
          {children}
          {label}
        </button>
      </h2>
    );
  }

  function renderLivePanel({ headingLink = true, heading = "Live-Spieltag" } = {}) {
    const live = liveData;
    const trendsByMatch = new Map(liveTrends.map((trend) => [trend.matchId, trend]));
    return (
      <section className="bundesliga-public-card bundesliga-live-panel">
        {headingLink
          ? renderCardHeading(heading, () => setBundesligaTab("bundesliga-live"))
          : <h2>{heading}</h2>}
        <div className="bundesliga-live-standings">
          {(live?.standings ?? []).slice(0, 5).map((row, index) => (
            <div key={row.participantId ?? row.name}>
              <span>{index + 1}</span>
              <strong>{row.name}</strong>
              <b>{row.points}{(live?.matches ?? []).some((match) => match.status === "live") ? " *" : ""}</b>
            </div>
          ))}
          {(!live?.standings || live.standings.length === 0) && <p>Noch keine sichtbare Spieltag-Auswertung.</p>}
        </div>
        <div className="bundesliga-live-match-list">
          {(live?.matches ?? []).map((match) => (
            <article key={match.id} className={match.status === "live" ? "is-live" : ""}>
              <header>
                <small>{formatDateTime(match.kickoffAt)}</small>
                <strong>{match.teamA}</strong>
                <b>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</b>
                <strong>{match.teamB}</strong>
              </header>
              {match.status === "live" && <span className="bundesliga-live-pill">LIVE · Punkte vorläufig</span>}
              {match.updatedAt && match.status === "live" && <small className="bundesliga-live-updated">Aktualisiert: {formatDateTime(match.updatedAt)}</small>}
              {match.goals?.length > 0 && (
                <div className="bundesliga-live-goals">
                  {match.goals.map((goal) => (
                    <span key={goal.id}>
                      <b>{Number.isInteger(goal.minute) ? `${goal.minute}'` : "Tor"}</b>
                      <strong>{goal.scorerName}</strong>
                      {(goal.isPenalty || goal.isOwnGoal) && <small>{goal.isPenalty ? "Elfmeter" : "Eigentor"}</small>}
                    </span>
                  ))}
                </div>
              )}
              {match.goalsPending && <p className="bundesliga-live-goals-pending">Torereignisse folgen.</p>}
              {trendsByMatch.has(match.id) && (
                <div className="bundesliga-trend-row">
                  <span>Heim {trendsByMatch.get(match.id).homePercent}%</span>
                  <span>Remis {trendsByMatch.get(match.id).drawPercent}%</span>
                  <span>Auswärts {trendsByMatch.get(match.id).awayPercent}%</span>
                </div>
              )}
              <div>
                {(match.tips ?? []).map((tip) => (
                  <span key={`${match.id}:${tip.participantId}`} className={tip.isOwnTip ? "own" : ""}>
                    <strong>{tip.participantName}</strong>
                    <em>{tip.visible ? `${tip.scoreA}:${tip.scoreB}` : "versteckt bis Anpfiff"}</em>
                    <b>{Number.isInteger(tip.points) ? `${tip.points} P${tip.provisional ? " *" : ""}` : ""}</b>
                    {tip.reason && <small>{tip.reason}</small>}
                  </span>
                ))}
                {(match.tips ?? []).length === 0 && <p>{match.tipsVisible ? "Noch keine Tipps für dieses Spiel." : "Tipps werden ab Anpfiff sichtbar."}</p>}
              </div>
              {match.status === "finished" && (
                <button type="button" className="bundesliga-match-detail-link" onClick={() => openBundesligaMatchDetail(match.id, "bundesliga-live")}>
                  Spielauswertung öffnen
                </button>
              )}
            </article>
          ))}
        </div>
        {(live?.matches ?? []).some((match) => match.status === "live") && <p>* Zwischenstand und Punkte sind vorläufig bis zum Abpfiff.</p>}
      </section>
    );
  }

  function renderOpenTasksCard({ compact = false } = {}) {
    if (preseasonPending) {
      return (
        <section className="bundesliga-public-card bundesliga-open-tasks">
          <h2>Was kommt als Nächstes?</h2>
          <div>
            <article>
              <strong>-</strong>
              <span>Spieltipps</span>
              <small>starten nach dem Spielplanimport</small>
            </article>
            <article>
              <strong>-</strong>
              <span>Bonus</span>
              <small>{bonusAvailable ? "wird zum Saisonstart geöffnet" : "folgt nach dem Teamimport"}</small>
            </article>
          </div>
        </section>
      );
    }
    const firstOpenStatus = matchdayStatusRows.find((row) => row.openTipCount > 0);
    return (
      <section className="bundesliga-public-card bundesliga-open-tasks">
        <h2>Was fehlt noch?</h2>
        <div>
          <article className={openTipCount === 0 ? "done" : ""}>
            <strong>{openTipCount}</strong>
            <span>offene Tipps</span>
            <small>{firstOpenStatus ? `nächster offener Spieltag: ${firstOpenStatus.matchday}` : "alle Spieltipps gespeichert"}</small>
          </article>
          <article className={bonusStatus.complete ? "done" : ""}>
            <strong>{bonusStatus.doneCount}/{bonusStatus.totalCount}</strong>
            <span>Bonus erledigt</span>
            <small>{bonusStatus.complete ? "Bonus vollständig" : "Meister, Torschütze oder Absteiger fehlen noch"}</small>
          </article>
        </div>
        {!compact && !archivePreview && (
          <button type="button" onClick={jumpToFirstOpenTip}>
            nächsten offenen Tipp anzeigen
          </button>
        )}
      </section>
    );
  }

  function renderPersonalStatsCard() {
    const stats = personalStats ?? {
      savedTipCount,
      scoredTipCount: currentParticipantRank?.scoredTipCount ?? 0,
      exactHits: 0,
      goalDiffHits: 0,
      tendencyHits: 0,
      wrongTips: 0,
      bestMatchdays: [],
    };
    return (
      <section className="bundesliga-public-card bundesliga-personal-stats">
        <h2>Meine Statistik</h2>
        <div>
          <article><span>Gespeichert</span><strong>{stats.savedTipCount ?? savedTipCount}</strong></article>
          <article><span>Gewertet</span><strong>{stats.scoredTipCount ?? 0}</strong></article>
          <article><span>Exakt</span><strong>{stats.exactHits ?? 0}</strong></article>
          <article><span>Differenz</span><strong>{stats.goalDiffHits ?? 0}</strong></article>
          <article><span>Tendenz</span><strong>{stats.tendencyHits ?? 0}</strong></article>
          <article><span>Falsch</span><strong>{stats.wrongTips ?? 0}</strong></article>
        </div>
        <footer>
          {(stats.bestMatchdays ?? []).length > 0
            ? stats.bestMatchdays.map((row) => <span key={row.matchday}>ST {row.matchday}: {row.points} P</span>)
            : <span>Beste Spieltage erscheinen nach den ersten Ergebnissen.</span>}
        </footer>
      </section>
    );
  }

  function renderCommunityCard() {
    const latestWinner = [...matchdayWinners].reverse().find((row) => row.winners?.length);
    const compareRows = ranking.filter((row) => row.id && row.id !== participant?.id).slice(0, 12);
    const selectedCompare = ranking.find((row) => row.id === compareParticipantId) ?? null;
    const ownLiveTips = (liveData?.matches ?? []).flatMap((match) => (match.tips ?? [])
      .filter((tip) => tip.isOwnTip)
      .map((tip) => ({ ...tip, match })));
    const rivalLiveTips = selectedCompare
      ? (liveData?.matches ?? []).flatMap((match) => (match.tips ?? [])
        .filter((tip) => tip.participantId === selectedCompare.id && tip.visible)
        .map((tip) => ({ ...tip, match })))
      : [];
    const comparisonLabel = communityVisibilityMode === "match_finished"
      ? "Vergleich nach Abpfiff"
      : "Vergleich ab Anpfiff";
    return (
      <section className="bundesliga-public-card bundesliga-community-card">
        {renderCardHeading("Community", () => setBundesligaTab("bundesliga-live"))}
        {latestWinner ? (
          <div className="bundesliga-winner-callout">
            <img src={BUNDESLIGA_BRAND_ASSETS.badgeMatchdayWinner} alt="" aria-hidden="true" />
            <p>Letzter Spieltagssieger: <strong>{latestWinner.winners.map((row) => row.name).join(", ")}</strong> mit {latestWinner.bestPoints} Punkten an ST {latestWinner.matchday}.</p>
          </div>
        ) : (
          <p>Spieltagssieger erscheinen, sobald Ergebnisse und Tipps gewertet sind.</p>
        )}
        {communityVisibilityMode === "never" ? (
          <p className="bundesliga-community-privacy">Teilnehmervergleiche sind für diese Saison deaktiviert. Deine Tipps bleiben privat.</p>
        ) : <label>
          {comparisonLabel}
          <select value={compareParticipantId} onChange={(event) => setCompareParticipantId(event.target.value)}>
            <option value="">Teilnehmer wählen</option>
            {compareRows.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>}
        {communityVisibilityMode !== "never" && selectedCompare && (
          <div className="bundesliga-compare-list">
            {ownLiveTips.slice(0, 5).map((ownTip) => {
              const rivalTip = rivalLiveTips.find((tip) => tip.match.id === ownTip.match.id);
              return (
                <div key={ownTip.match.id}>
                  <strong>{ownTip.match.teamA} - {ownTip.match.teamB}</strong>
                  <span>Du: {ownTip.scoreA}:{ownTip.scoreB} · {Number.isInteger(ownTip.points) ? `${ownTip.points} P` : "offen"}</span>
                  <span>{selectedCompare.name}: {rivalTip ? `${rivalTip.scoreA}:${rivalTip.scoreB}` : "versteckt/offen"} · {Number.isInteger(rivalTip?.points) ? `${rivalTip.points} P` : "offen"}</span>
                </div>
              );
            })}
          </div>
        )}
        {currentParticipantRank && (
          <div className="bundesliga-share-card">
            <img src={BUNDESLIGA_BRAND_ASSETS.icon} alt="" aria-hidden="true" />
            <span>Share-Karte</span>
            <strong>{currentParticipantRank.name}</strong>
            <b>{currentParticipantRank.points} Punkte · Platz {ranking.findIndex((row) => row.id === currentParticipantRank.id || row.name === currentParticipantRank.name) + 1}</b>
          </div>
        )}
      </section>
    );
  }

  function renderSeasonStatusCard() {
    const resultCount = data?.results?.length ?? 0;
    const seasonState = archivePreview
      ? {
          label: "Archivstand verfügbar",
          detail: "Die Saison 2025/2026 bleibt als interne Vorschau lesbar.",
          meta: "Änderungen sind in dieser Vorschau deaktiviert.",
        }
      : preseasonPending
        ? {
            label: "Spielplan wird vorbereitet",
            detail: "Der offizielle Spielplan für 2026/2027 ist noch nicht verfügbar.",
            meta: "Deine Tippbereiche werden nach dem Import freigeschaltet.",
          }
        : resultCount > 0
          ? {
              label: "Ergebnisse werden aktualisiert",
              detail: "Spielplan und Auswertungen der laufenden Saison sind verfügbar.",
              meta: "Neue Ergebnisse erscheinen nach der Aktualisierung.",
            }
          : {
              label: "Saison bereit",
              detail: "Der Spielplan ist geladen und deine Tipps können abgegeben werden.",
              meta: "Auswertungen erscheinen nach den ersten Ergebnissen.",
            };
    return (
      <section className="bundesliga-public-card bundesliga-season-status">
        <h2>Saisonstatus</h2>
        <strong>{seasonState.label}</strong>
        <p>{seasonState.detail}</p>
        <small>{seasonState.meta}</small>
      </section>
    );
  }

  function renderFullTablePage() {
    return (
      <section className="bundesliga-detail-page">
        <section className="bundesliga-public-card bundesliga-detail-head">
          <div>
            <span>Live-Tabelle</span>
            <h1>Bundesliga Tabelle</h1>
            <p>Alle Teams mit Spielen, Toren, Differenz und Punkten aus den importierten Ergebnissen.</p>
          </div>
          <button type="button" onClick={() => setBundesligaTab("bundesliga-start")}>Zur Zentrale</button>
        </section>
        <section className="bundesliga-public-card bundesliga-full-table-card">
          {(data?.results ?? []).length === 0 && (
            <p className="bundesliga-detail-empty-note">Noch keine offiziellen Ergebnisse importiert. Die Tabelle startet daher mit Nullwerten.</p>
          )}
          <div className="bundesliga-full-table-scroll">
            <table className="bundesliga-full-table">
              <thead>
                <tr>
                  <th>Pl.</th>
                  <th>Team</th>
                  <th>Sp.</th>
                  <th>S</th>
                  <th>U</th>
                  <th>N</th>
                  <th>Tore</th>
                  <th>Diff.</th>
                  <th>Pkt.</th>
                </tr>
              </thead>
              <tbody>
                {displayTableRows.map((row, index) => {
                  const diff = (row.goalsFor ?? 0) - (row.goalsAgainst ?? 0);
                  return (
                    <tr key={row.teamId} className={[
                      index < 4 ? "zone-champions" : "",
                      index >= 4 && index < 6 ? "zone-europa" : "",
                      index === 15 ? "zone-relegation" : "",
                      index >= 16 ? "zone-down" : "",
                    ].filter(Boolean).join(" ")}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="bundesliga-table-team">
                          <BundesligaLogo src={row.logoUrl} name={row.team} />
                          <strong>{row.team}</strong>
                        </span>
                      </td>
                      <td>{row.played ?? 0}</td>
                      <td>{row.won ?? 0}</td>
                      <td>{row.drawn ?? 0}</td>
                      <td>{row.lost ?? 0}</td>
                      <td>{row.goalsFor ?? 0}:{row.goalsAgainst ?? 0}</td>
                      <td>{diff > 0 ? `+${diff}` : diff}</td>
                      <td><b>{row.points}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  function renderTopScorersPage() {
    return (
      <section className="bundesliga-detail-page">
        <section className="bundesliga-public-card bundesliga-detail-head">
          <div>
            <span>Torschützen</span>
            <h1>Torschützenliste</h1>
            <p>Die importierte OpenLigaDB-Liste für Torschützenkönig und Saisonüberblick.</p>
          </div>
          <button type="button" onClick={() => setBundesligaTab("bundesliga-bonus")}>{archivePreview ? "Bonus ansehen" : "Bonus öffnen"}</button>
        </section>
        <section className="bundesliga-public-card bundesliga-scorer-page-list">
          {topScorers.map((row, index) => (
            <article key={row.id ?? `${row.display_name}-${index}`}>
              <span>{index + 1}</span>
              <strong>{row.display_name}</strong>
              <small>{row.team_name || "OpenLigaDB"}</small>
              <b>{row.goals}</b>
            </article>
          ))}
          {topScorers.length === 0 && <p>Noch keine Torschützen importiert.</p>}
        </section>
      </section>
    );
  }

  function renderSchedulePage() {
    if (preseasonPending) {
      return (
        <section className="bundesliga-detail-page">
          <section className="bundesliga-public-card bundesliga-detail-head">
            <div>
              <span>Spielplan</span>
              <h1>Spielplan 2026/27</h1>
              <p>Die Spieltage werden sichtbar, sobald der offizielle Spielplan importiert wurde.</p>
            </div>
          </section>
          <section className="bundesliga-public-card bundesliga-preseason-empty">
            <h2>Spielplan noch nicht verfügbar</h2>
            <p>Hier findest du später alle Spieltage, Anstoßzeiten und deine Tippzustände.</p>
          </section>
        </section>
      );
    }
    return (
      <section className="bundesliga-detail-page">
        <section className="bundesliga-public-card bundesliga-detail-head">
          <div>
            <span>Spielplan</span>
            <h1>Spieltag {selectedMatchday}</h1>
            <p>{visibleMatches.length} Spiele · {visibleSavedTipCount} deiner Tipps gespeichert.</p>
          </div>
        </section>
        <div className="bundesliga-matchday-chips" aria-label="Schnellauswahl Spieltage">
          {matchdayOptions.map((day) => {
            const status = matchdayStatusRows.find((row) => row.matchday === day)?.status ?? "open";
            return (
              <button key={day} type="button" className={[Number(selectedMatchday) === day ? "active" : "", `status-${status}`].filter(Boolean).join(" ")} onClick={() => setSelectedMatchday(day)}>
                {day}
              </button>
            );
          })}
        </div>
        <section className="bundesliga-public-card bundesliga-schedule-page-list">
          {visibleMatches.map((match) => {
            const tip = tips[match.id];
            const result = resultsByMatch.get(match.id);
            const state = getBundesligaMatchState(match, result);
            return (
              <article key={match.id}>
                <time>{formatDateTime(match.kickoffAt)}</time>
                {teamBadge(match.teamAId, match.teamA)}
                <b>{result ? `${result.score_a}:${result.score_b}` : "-:-"}</b>
                {teamBadge(match.teamBId, match.teamB, { align: "right" })}
                <span className={`bundesliga-match-status status-${result?.status === "live" ? "live" : tip?.saved ? "saved" : result?.status === "final" ? "finished" : state}`}>
                  {matchStatusLabel(match, result, tip)}
                </span>
                <button type="button" onClick={() => result?.status === "final"
                  ? openBundesligaMatchDetail(match.id, "bundesliga-spielplan")
                  : setBundesligaTab("bundesliga-tippen")}>
                  {result?.status === "final" ? "Auswertung ansehen" : archivePreview ? "Details ansehen" : tip?.saved ? "Tipp bearbeiten" : state === "locked" ? "Details ansehen" : "Tipp abgeben"}
                </button>
              </article>
            );
          })}
        </section>
      </section>
    );
  }

  function renderMatchDetailPage() {
    if (matchDetailLoading) {
      return (
        <section className="bundesliga-public-card bundesliga-match-detail-state">
          <h2>Spielauswertung wird geladen</h2>
          <p>Ergebnis, Torverlauf und Tipps werden zusammengestellt.</p>
        </section>
      );
    }
    if (!matchDetail || matchDetailError) {
      return (
        <section className="bundesliga-public-card bundesliga-match-detail-state">
          <h2>Spielauswertung nicht verfügbar</h2>
          <p>{matchDetailError || "Für dieses Spiel liegen noch keine finalen Auswertungsdaten vor."}</p>
          <button type="button" onClick={() => setBundesligaTab(matchDetailReturnTab)}>Zurück</button>
        </section>
      );
    }
    const { match, result, goals, ownTip, tips: detailTips, trend } = matchDetail;
    return (
      <section className="bundesliga-match-detail-page">
        <section className="bundesliga-public-card bundesliga-match-detail-head">
          <div className="bundesliga-match-detail-toolbar">
            <button type="button" onClick={() => setBundesligaTab(matchDetailReturnTab)}>Zurück</button>
            <span>Spieltag {match.matchday} · {formatDateTime(match.kickoffAt)}</span>
            {archivePreview && <b>Archivvorschau · nur lesbar</b>}
          </div>
          <div className="bundesliga-match-detail-score">
            <div>
              <BundesligaLogo src={match.teamA.logoUrl} name={match.teamA.name} />
              <strong>{match.teamA.name}</strong>
            </div>
            <section>
              <small>Endergebnis</small>
              <b>{result.score_a}:{result.score_b}</b>
              <span>Beendet</span>
            </section>
            <div className="away">
              <BundesligaLogo src={match.teamB.logoUrl} name={match.teamB.name} />
              <strong>{match.teamB.name}</strong>
            </div>
          </div>
        </section>
        <section className="bundesliga-match-detail-grid">
          <div className="bundesliga-match-detail-main">
            <section className={`bundesliga-public-card bundesliga-own-match-tip ${ownTip ? "" : "empty"}`}>
              <h2>Dein Tipp</h2>
              {ownTip ? (
                <div>
                  <strong>{ownTip.scoreA}:{ownTip.scoreB}</strong>
                  <b>{ownTip.points} Punkte</b>
                  <span>{ownTip.reason}</span>
                </div>
              ) : <p>Kein Tipp abgegeben.</p>}
            </section>
            <section className="bundesliga-public-card bundesliga-match-tip-overview">
              <h2>Tippübersicht</h2>
              {detailTips.length > 0 ? detailTips.map((tip, index) => (
                <article key={tip.participantId} className={tip.isOwnTip ? "own" : ""}>
                  <span>{index + 1}</span>
                  <strong>{tip.participantName}{tip.isOwnTip ? " (Du)" : ""}</strong>
                  <b>{tip.scoreA}:{tip.scoreB}</b>
                  <em>{tip.points} P</em>
                  <small>{tip.reason}</small>
                </article>
              )) : <p>Noch keine sichtbaren Tipps für dieses Spiel.</p>}
            </section>
          </div>
          <aside className="bundesliga-side-stack">
            <section className="bundesliga-public-card bundesliga-goal-timeline">
              <h2>Torverlauf</h2>
              {goals.length > 0 ? goals.map((goal) => (
                <article key={goal.id} className={goal.teamSide ?? "neutral"}>
                  <b>{Number.isInteger(goal.minute) ? `${goal.minute}'` : "-"}</b>
                  <strong>{goal.scorerName}</strong>
                  <small>{goal.isPenalty ? "Elfmeter" : goal.isOwnGoal ? "Eigentor" : goal.teamSide === "home" ? match.teamA.name : goal.teamSide === "away" ? match.teamB.name : "Tor"}</small>
                </article>
              )) : <p>Keine Torereignisse importiert.</p>}
            </section>
            <section className="bundesliga-public-card bundesliga-match-trend-card">
              <h2>Tippverteilung</h2>
              <div>
                <article><strong>{trend.homePercent}%</strong><span>Heimsieg</span></article>
                <article><strong>{trend.drawPercent}%</strong><span>Remis</span></article>
                <article><strong>{trend.awayPercent}%</strong><span>Auswärtssieg</span></article>
              </div>
              <small>{trend.total} sichtbare Tipps</small>
            </section>
          </aside>
        </section>
      </section>
    );
  }

  function renderLivePage() {
    if (preseasonPending) {
      return (
        <section className="bundesliga-public-card bundesliga-preseason-empty">
          <h2>Live-Spieltag startet mit der Saison</h2>
          <p>Sobald der Spielplan vorliegt und die ersten Partien beginnen, erscheinen hier Live-Rangliste und Tippvergleich.</p>
        </section>
      );
    }
    const latestLiveUpdatedAt = (liveData?.matches ?? [])
      .map((match) => match.updatedAt)
      .filter(Boolean)
      .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0];
    return (
      <section className="bundesliga-stage-grid">
        <section className="bundesliga-live-page">
          <div className="bundesliga-public-card bundesliga-public-section-head">
            <div>
              <h2>Live-Spieltag</h2>
              <p>Spieltag {selectedMatchday} mit Live-Rangliste, eigenen Tipps und sichtbaren Community-Tipps.</p>
            </div>
            <div className="bundesliga-live-refresh">
              <small>Zuletzt aktualisiert: {latestLiveUpdatedAt ? formatDateTime(latestLiveUpdatedAt) : "noch keine Live-Daten"}</small>
              <button type="button" onClick={refreshLiveDataManually} disabled={liveRefreshStatus.state === "loading"}>
                {liveRefreshStatus.state === "loading" ? "Aktualisiere..." : "Aktualisieren"}
              </button>
              {liveRefreshStatus.message && (
                <span className={`bundesliga-live-refresh-feedback is-${liveRefreshStatus.state}`} role="status" aria-live="polite">
                  {liveRefreshStatus.message}
                </span>
              )}
            </div>
            <div className="bundesliga-matchday-switcher" aria-label="Spieltag wechseln">
              <button type="button" onClick={() => moveMatchday(-1)} disabled={selectedMatchdayIndex <= 0}>
                <ChevronRight size={18} />
              </button>
              <strong>Spieltag {selectedMatchday}</strong>
              <button type="button" onClick={() => moveMatchday(1)} disabled={selectedMatchdayIndex >= matchdayOptions.length - 1}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="bundesliga-live-scoreboard" aria-label="Live Kennzahlen">
            <article><span>Live-Spiele</span><strong>{liveMatchCount}</strong></article>
            <article><span>Sichtbare Tipps</span><strong>{visibleLiveTipCount}</strong></article>
            <article><span>Gewertet</span><strong>{liveMatches.filter((match) => match.status === "finished").length}</strong></article>
          </div>
          {renderLivePanel({ headingLink: false, heading: "Rangliste und Spiele" })}
        </section>
        <aside className="bundesliga-side-stack">
          {renderPersonalStatsCard()}
          {renderCommunityCard()}
          {renderRulesCard()}
        </aside>
      </section>
    );
  }

  const tableRows = data?.table ?? [];
  const displayTableRows = tableRows.length
    ? tableRows
    : teams.map((team) => ({
        teamId: team.id,
        team: team.name,
        logoUrl: team.logo_url,
        points: 0,
      }));
  const firstMatches = matches.slice(0, 5);
  const upcomingMatches = matches
    .filter((match) => new Date(match.kickoffAt).getTime() >= Date.now())
    .slice(0, 5);
  const dashboardMatches = upcomingMatches.length ? upcomingMatches : firstMatches;
  const topScorerPreview = topScorers.slice(0, 5);
  const currentParticipantRank = participant
    ? ranking.find((row) => row.id === participant.id || row.name === participant.name)
    : null;
  const topRankingRows = ranking.slice(0, 3);
  const totalRankingReady = ranking.some((row) => (row.scoredTipCount ?? 0) > 0 || (row.points ?? 0) > 0);
  const averageRankingReady = ranking.some((row) => (row.scoredTipCount ?? 0) > 0);
  const selectedRankingReady = rankingMode === "average" ? averageRankingReady : totalRankingReady;
  const displayedRanking = useMemo(() => {
    const nextRows = [...ranking];
    if (rankingMode === "average") {
      return nextRows.sort((first, second) =>
        (second.averagePoints ?? 0) - (first.averagePoints ?? 0) ||
        (second.scoredTipCount ?? 0) - (first.scoredTipCount ?? 0) ||
        (second.points ?? 0) - (first.points ?? 0) ||
        first.name.localeCompare(second.name, "de"),
      );
    }
    return nextRows.sort((first, second) =>
      (second.points ?? 0) - (first.points ?? 0) ||
      (second.matchdayWins ?? 0) - (first.matchdayWins ?? 0) ||
      (second.matchPoints ?? 0) - (first.matchPoints ?? 0) ||
      first.name.localeCompare(second.name, "de"),
    );
  }, [ranking, rankingMode]);
  const displayedCurrentRank = participant
    ? displayedRanking.find((row) => row.id === participant.id || row.name === participant.name)
    : null;
  const displayedTopRankingRows = selectedRankingReady ? displayedRanking.slice(0, 3) : [];
  const openTipCount = Math.max(0, matches.length - savedTipCount);
  const nextOpenMatchday = matchdayStatusRows.find((row) => row.openTipCount > 0)?.matchday ?? selectedMatchday;
  const nextOpenMatch = matches.find((match) => Number(match.matchday) === Number(nextOpenMatchday) && !tips[match.id]?.saved) ?? null;
  const tipCompletionPercent = matches.length ? Math.round((savedTipCount / matches.length) * 100) : 0;
  const currentRankPosition = displayedCurrentRank
    ? displayedRanking.findIndex((row) => row.id === displayedCurrentRank.id || row.name === displayedCurrentRank.name) + 1
    : 0;
  const pointsToNextRank = currentRankPosition > 1
    ? Math.max(0, (displayedRanking[currentRankPosition - 2]?.points ?? 0) - (displayedCurrentRank?.points ?? 0) + 1)
    : 0;
  const latestMatchdayWinner = [...matchdayWinners].reverse().find((row) => row.winners?.length) ?? null;
  const liveMatches = liveData?.matches ?? [];
  const liveMatchCount = liveMatches.filter((match) => match.status === "live").length;
  const visibleLiveTipCount = liveMatches.reduce(
    (sum, match) => sum + (match.tips ?? []).filter((tip) => tip.visible).length,
    0,
  );
  const preseasonPending = Boolean(data) && !archivePreview && matches.length === 0;
  const bonusAvailable = bonusTeams.length > 0;
  const nextActionTitle = preseasonPending
    ? "Spielplan abwarten"
    : openTipCount > 0
      ? `Spieltag ${nextOpenMatchday} tippen`
      : !bonusStatus.complete
        ? "Bonus fertig machen"
        : liveMatchCount > 0
          ? "Live-Spieltag verfolgen"
          : "Rangliste checken";
  const nextActionDetail = preseasonPending
    ? "Sobald die offiziellen Spiele importiert sind, erscheinen Tippkarten, Tabelle und Live-Bereich."
    : openTipCount > 0
      ? `${openTipCount} Tipps sind noch offen. Der nächste offene Spieltag ist direkt erreichbar.`
      : !bonusStatus.complete
        ? `${bonusStatus.doneCount}/${bonusStatus.totalCount} Bonus-Tipps sind gespeichert.`
        : liveMatchCount > 0
          ? `${liveMatchCount} Spiele laufen gerade, ${visibleLiveTipCount} Tipps sind sichtbar.`
          : "Alles gespeichert. Jetzt geht es um Punkte, Spieltagssiege und den Abstand nach oben.";
  const nextActionLabel = preseasonPending
    ? "Spielplan ansehen"
    : openTipCount > 0
      ? "Tipps öffnen"
      : !bonusStatus.complete
        ? "Bonus öffnen"
        : liveMatchCount > 0
          ? "Live öffnen"
          : "Rangliste öffnen";
  const nextAction = () => {
    if (preseasonPending) {
      setBundesligaTab("bundesliga-spielplan");
      return;
    }
    if (openTipCount > 0) {
      setSelectedMatchday(nextOpenMatchday);
      setBundesligaTab("bundesliga-tippen");
      return;
    }
    if (!bonusStatus.complete && bonusAvailable) {
      setBundesligaTab("bundesliga-bonus");
      return;
    }
    setBundesligaTab(liveMatchCount > 0 ? "bundesliga-live" : "bundesliga-rangliste");
  };
  const displayedTab = participant ? activeTab : "bundesliga-start";
  const headerSeasonLabel = isTestMode
    ? "Testmodus"
    : archivePreview
      ? "Archivvorschau 2025/2026"
      : data?.competition?.public_enabled
        ? "Saison 2026/2027"
        : "Vorschau 2026/2027";
  const moreNavigationActive = ["bundesliga-tabelle", "bundesliga-torschuetzen", "bundesliga-spielplan"].includes(displayedTab);
  const shellClassName = "bundesliga-public-shell";

  if (retiredLiveProbe) {
    return (
      <div className={shellClassName}>
        <main className="bundesliga-retired-probe">
          <img src={BUNDESLIGA_BRAND_ASSETS.header} alt="Österfeld Tippspiel" />
          <section className="bundesliga-public-card">
            <h1>Liveprobe abgeschlossen</h1>
            <p>Die Relegations-Generalprobe wurde erfolgreich beendet und ihre Testdaten werden entfernt.</p>
            <button
              type="button"
              className="bundesliga-primary-action"
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("blCompetition");
                url.searchParams.delete("blCode");
                url.hash = "bundesliga-start";
                window.location.assign(url.toString());
              }}
            >
              Zur Bundesliga 2026/2027
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      <header className={`bundesliga-public-header ${participant ? "" : "is-login"}`}>
        <button type="button" className="bundesliga-header-brand" onClick={() => setBundesligaTab("bundesliga-start")}>
          <BundesligaBrandLogo decorative variant="compact" />
          <span>
            <strong>Österfeld Bundesliga</strong>
            <small>{headerSeasonLabel}</small>
          </span>
        </button>
        {participant && (
          <nav>
            <button className={displayedTab === "bundesliga-start" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-start")}>Start</button>
            <button className={displayedTab === "bundesliga-tippen" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-tippen")}>Tippen</button>
            <button className={displayedTab === "bundesliga-live" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-live")}>Live</button>
            <button className={displayedTab === "bundesliga-bonus" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-bonus")}>Bonus</button>
            <button className={displayedTab === "bundesliga-rangliste" ? "active" : ""} onClick={() => { setBundesligaTab("bundesliga-rangliste"); void refreshRanking(); }}>Rangliste</button>
            <span className="bundesliga-secondary-nav">
              <button className={displayedTab === "bundesliga-tabelle" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-tabelle")}>Tabelle</button>
              <button className={displayedTab === "bundesliga-torschuetzen" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-torschuetzen")}>Torschützen</button>
              <button className={displayedTab === "bundesliga-spielplan" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-spielplan")}>Spielplan</button>
            </span>
            <button
              type="button"
              className={`bundesliga-more-toggle ${moreNavigationActive || mobileMoreOpen ? "active" : ""}`}
              aria-expanded={mobileMoreOpen}
              aria-controls="bundesliga-mobile-more-menu"
              onClick={() => setMobileMoreOpen((current) => !current)}
            >
              Mehr
              <ChevronDown size={16} />
            </button>
          </nav>
        )}
        {participant && mobileMoreOpen && (
          <div id="bundesliga-mobile-more-menu" className="bundesliga-mobile-more-menu" role="navigation" aria-label="Weitere Bundesliga-Bereiche">
            <button className={displayedTab === "bundesliga-tabelle" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-tabelle")}>Tabelle</button>
            <button className={displayedTab === "bundesliga-torschuetzen" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-torschuetzen")}>Torschützen</button>
            <button className={displayedTab === "bundesliga-spielplan" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-spielplan")}>Spielplan</button>
          </div>
        )}
        <button type="button" onClick={() => { window.location.hash = "start"; }}>Zur WM</button>
      </header>

      <main className="bundesliga-public-main">
        {archivePreview && (
          <section className="bundesliga-archive-banner" aria-live="polite">
            <strong>Archiv-Demo 2025/2026</strong>
            <span>Ohne Login ansehen: Beispieltipps zeigen den Ablauf. Änderungen sind nicht möglich.</span>
          </section>
        )}
        {displayedTab !== "bundesliga-start" && (
          <section className="bundesliga-public-status" aria-live="polite">
            <span>{participant ? (archivePreview ? `Demo-Profil ${participant.name}` : `Angemeldet als ${participant.name}`) : "Bundesliga-Code erforderlich"}</span>
            <strong>{participant ? `${savedTipCount} von ${matches.length} Tipps gespeichert` : loginFeedback}</strong>
            <span>{message}</span>
          </section>
        )}

        {displayedTab === "bundesliga-start" && !participant && (
          <section className="bundesliga-login-screen">
            <section className="bundesliga-login-welcome bundesliga-public-card">
              <div className="bundesliga-dashboard-hero">
                <BundesligaBrandLogo variant="header" />
                <div>
                  <h1>{archivePreview ? "Archiv-Demo wird geladen" : "Bundesliga starten"}</h1>
                  <p>{archivePreview ? "Die schreibgeschützte Saisonansicht mit Beispieltipps wird vorbereitet." : "Gib deinen persönlichen Code ein. Ist er bereits verknüpft, öffnet sich deine Zentrale sofort."}</p>
                </div>
              </div>
              {!archivePreview && renderLoginPanel()}
              <p className="bundesliga-login-note">{archivePreview ? message || "Einen Augenblick bitte." : "Deine Tipps, Bonusfragen und Ranglistenposition bleiben deinem Code zugeordnet."}</p>
            </section>
          </section>
        )}

        {displayedTab === "bundesliga-start" && participant && (
          <section className="bundesliga-home-dashboard">
            <section className="bundesliga-home-primary">
            <section className="bundesliga-welcome-card bundesliga-public-card">
              <div className="bundesliga-dashboard-hero">
                <BundesligaBrandLogo variant="header" />
                <div>
                  <span>{archivePreview ? "Archiv-Demo" : "Deine Zentrale"}</span>
                  <h1>Hallo {participant.name}</h1>
                  <p>{archivePreview ? "So wirkt die Bundesliga-Saisonansicht mit vorab angelegten Beispieltipps." : "Deine Tipps, dein Bonus, dein aktueller Stand und die nächsten Schritte auf einen Blick."}</p>
                </div>
              </div>
              <div className="bundesliga-session-row">
                <div>
                  <strong>{archivePreview ? "Nur ansehen" : "Zugang aktiv"}</strong>
                  <span>{archivePreview ? "Archiv-Demo ohne Login. Eingaben und Speichern sind deaktiviert." : loginState === "success" ? loginFeedback : `Eingeloggt als ${participant.name}.`}</span>
                </div>
                {!archivePreview && <button type="button" onClick={resetBundesligaLogin}>Abmelden</button>}
              </div>
              {renderMatchdayCommandCenter()}
              <div className="bundesliga-dashboard-metrics">
                <article>
                  <span>Offene Tipps</span>
                  <strong>{preseasonPending ? "-" : openTipCount}</strong>
                  <small>{preseasonPending ? "nach Spielplanimport verfügbar" : `${savedTipCount} von ${matches.length} gespeichert`}</small>
                </article>
                <article>
                  <span>Bonus</span>
                  <strong>{bonusAvailable ? `${bonusStatus.doneCount}/${bonusStatus.totalCount}` : "-"}</strong>
                  <small>{bonusAvailable ? (bonusStatus.complete ? "vollständig" : "noch offen") : "nach Teamimport verfügbar"}</small>
                </article>
                <article>
                  <span>Dein Stand</span>
                  <strong>{preseasonPending ? "-" : currentParticipantRank ? `${currentParticipantRank.points} P` : "offen"}</strong>
                  <small>{preseasonPending ? "beginnt mit der Saison" : currentParticipantRank ? `${currentParticipantRank.matchdayWins ?? 0} Spieltagssiege` : "Code aktivieren"}</small>
                </article>
                <article>
                  <span>Nächster Fokus</span>
                  <strong>{preseasonPending ? "Warten" : `ST ${nextOpenMatchday}`}</strong>
                  <small>{preseasonPending ? "Spielplan in Vorbereitung" : `${selectedMatchdayStatus.openTipCount} offene Tipps dort`}</small>
                </article>
              </div>
              {renderNextStepCard()}
              {!preseasonPending && (
                <div className="bundesliga-dashboard-actions">
                  <button type="button" onClick={() => setBundesligaTab("bundesliga-live")}>Live-Spieltag öffnen</button>
                  <button type="button" onClick={() => setBundesligaTab("bundesliga-rangliste")}>Rangliste ansehen</button>
                </div>
              )}
            </section>
              {renderOpenTasksCard({ compact: true })}
            </section>

            <section className="bundesliga-dashboard-secondary" aria-label="Persönliche Übersicht">
              {renderPersonalStatsCard()}
              {bonusAvailable && renderBonusReminder()}
              <section className="bundesliga-public-card bundesliga-top-three">
                {renderCardHeading("Top 3", () => {
                  setBundesligaTab("bundesliga-rangliste");
                  void refreshRanking();
                }, <img src={BUNDESLIGA_BRAND_ASSETS.badgeRankingTop3} alt="" aria-hidden="true" />)}
                <div>
                  {topRankingRows.map((row, index) => (
                    <article key={row.id ?? row.name}>
                      <span>{index + 1}</span>
                      <strong>{row.name}</strong>
                      <b>{row.points} P</b>
                    </article>
                  ))}
                  {topRankingRows.length === 0 && <p>Noch keine Rangliste vorhanden.</p>}
                </div>
              </section>
              {displayTableRows.length > 0 && <section className="bundesliga-public-card">
                {renderCardHeading("Live-Tabelle", () => setBundesligaTab("bundesliga-tabelle"))}
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 8).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <BundesligaLogo src={row.logoUrl} name={row.team} />
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>}
              {renderCommunityCard()}
              {dashboardMatches.length > 0 && <section className="bundesliga-public-card">
                {renderCardHeading("Nächste Spiele", () => setBundesligaTab("bundesliga-spielplan"))}
                <div className="bundesliga-fixture-list">
                  {dashboardMatches.map((match) => (
                    <div key={match.id}>
                      <span>{formatDateTime(match.kickoffAt)}</span>
                      <section>
                        {teamBadge(match.teamAId, match.teamA)}
                        <small>vs</small>
                        {teamBadge(match.teamBId, match.teamB)}
                      </section>
                    </div>
                  ))}
                </div>
              </section>}
              {renderSeasonStatusCard()}
            </section>
          </section>
        )}

        {displayedTab === "bundesliga-tippen" && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card bundesliga-tip-stage">
              <div className="bundesliga-public-section-head">
                <div>
                  <h2>Spieltag tippen</h2>
                  <p>{archivePreview ? "Archivvorschau - Änderungen nicht möglich" : preseasonPending ? "Der Spielplan für 2026/2027 wird vorbereitet." : `${visibleMatches.length} Spiele am ${selectedMatchday}. Spieltag · ${visibleSavedTipCount} gespeichert`}</p>
                </div>
                {!preseasonPending && <div className="bundesliga-matchday-switcher" aria-label="Spieltag wechseln">
                  <button type="button" onClick={() => moveMatchday(-1)} disabled={selectedMatchdayIndex <= 0}>
                    <ChevronRight size={18} />
                  </button>
                  <strong>Spieltag {selectedMatchday}</strong>
                  <button type="button" onClick={() => moveMatchday(1)} disabled={selectedMatchdayIndex >= matchdayOptions.length - 1}>
                    <ChevronRight size={18} />
                  </button>
                </div>}
              </div>
              {preseasonPending ? (
                <section className="bundesliga-preseason-empty">
                  <h2>Noch keine Spiele zum Tippen</h2>
                  <p>Deine Tippkarten erscheinen automatisch, sobald der offizielle Spielplan importiert ist.</p>
                </section>
              ) : <>
              {renderMatchdayCenter()}
              <div className="bundesliga-matchday-chips" aria-label="Schnellauswahl Spieltage">
                {matchdayOptions.map((day) => {
                  const status = matchdayStatusRows.find((row) => row.matchday === day)?.status ?? "open";
                  return (
                  <button key={day} type="button" className={[Number(selectedMatchday) === day ? "active" : "", `status-${status}`].filter(Boolean).join(" ")} onClick={() => setSelectedMatchday(day)}>
                    {day}
                  </button>
                  );
                })}
              </div>
              <div className="bundesliga-tip-card-list">
                {visibleMatches.map((match) => {
                  const tip = tips[match.id] ?? { scoreA: null, scoreB: null, saved: false };
                  const result = resultsByMatch.get(match.id);
                  const matchState = getBundesligaMatchState(match, result);
                  const tipLocked = archivePreview || (!isTestMode && matchState !== "open");
                  const showTipControls = !archivePreview && (matchState === "open" || (isTestMode && matchState !== "finished"));
                  const points = result?.status === "final" && tip.saved ? pointsFor(tip, result) : null;
                  const statusLabel = matchStatusLabel(match, result, tip);
                  const statusClass = result?.status === "live" ? "live" : result?.status === "final" ? "finished" : tip?.saved ? "saved" : matchState;
                  const closingCountdown = !archivePreview && matchState === "open"
                    ? getBundesligaTipCountdown(match, tipCountdownNow)
                    : null;
                  return (
                    <article key={match.id} id={`bundesliga-match-${match.id}`} className={`bundesliga-user-match-card status-${matchState} status-${statusClass}${tip.saved ? " is-saved" : ""}`}>
                      <header>
                        <span>{formatDateTime(match.kickoffAt)}</span>
                        <b>{result ? `${result.score_a}:${result.score_b}` : "-:-"}</b>
                        <em className={`bundesliga-match-status status-${statusClass}`}>{statusLabel}</em>
                      </header>
                      {closingCountdown && (
                        <div className={`bundesliga-tip-countdown${closingCountdown.urgent ? " is-urgent" : ""}`} aria-live="polite">
                          <strong>{closingCountdown.label}</strong>
                          {!tip.saved && <span>Noch nicht gespeichert</span>}
                        </div>
                      )}
                      <div className="bundesliga-user-match-body">
                        {teamBadge(match.teamAId, match.teamA)}
                        {showTipControls ? (
                          <div className="score-row" aria-label="Dein Tipp">
                            <small>Dein Tipp</small>
                            <ScoreControl value={tip.scoreA} onIncrease={() => changeScore(match.id, "scoreA", 1)} onDecrease={() => changeScore(match.id, "scoreA", -1)} disabled={tipLocked} />
                            <span className="score-separator">:</span>
                            <ScoreControl value={tip.scoreB} onIncrease={() => changeScore(match.id, "scoreB", 1)} onDecrease={() => changeScore(match.id, "scoreB", -1)} disabled={tipLocked} />
                          </div>
                        ) : (
                          <div className="bundesliga-closed-tip">
                            <span>Dein Tipp</span>
                            <strong>{isCompleteTip(tip) ? `${tip.scoreA}:${tip.scoreB}` : "kein Tipp"}</strong>
                            {Number.isInteger(points) && <b>{points} Punkte</b>}
                          </div>
                        )}
                        {teamBadge(match.teamBId, match.teamB, { align: "right" })}
                      </div>
                      {showTipControls && (
                        <footer>
                          <small>{tip.saved ? "Gespeichert" : tipStatuses[match.id] === "pending" ? "Autosave wartet..." : tipLocked ? "Spiel gesperrt" : "Noch ohne Tipp"}</small>
                          <button type="button" onClick={() => saveTipRows([match.id])} disabled={!isCompleteTip(tip) || tipLocked}>Tipp speichern</button>
                        </footer>
                      )}
                      {result?.status === "final" && (
                        <footer className="bundesliga-finished-match-action">
                          <small>Endergebnis und Community-Tipps verfügbar</small>
                          <button type="button" onClick={() => openBundesligaMatchDetail(match.id, "bundesliga-tippen")}>Auswertung ansehen</button>
                        </footer>
                      )}
                    </article>
                  );
                })}
              </div>
              </>}
            </section>

            <details className="bundesliga-tip-extras" open={tipExtrasOpen} onToggle={(event) => setTipExtrasOpen(event.currentTarget.open)}>
              <summary>Infos &amp; Statistik</summary>
              <aside className="bundesliga-side-stack">
              {renderOpenTasksCard()}
              {bonusAvailable && renderBonusReminder()}
              {renderPersonalStatsCard()}
              {renderLivePanel()}
              <section className="bundesliga-public-card">
                {renderCardHeading("Live-Tabelle", () => setBundesligaTab("bundesliga-tabelle"))}
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 6).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <BundesligaLogo src={row.logoUrl} name={row.team} />
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="bundesliga-public-card">
                {renderCardHeading("Torschützen", () => setBundesligaTab("bundesliga-torschuetzen"))}
                <div className="bundesliga-scorer-mini-list">
                  {topScorerPreview.map((row, index) => (
                    <div key={row.id}>
                      <span>{index + 1}</span>
                      <strong>{row.display_name}</strong>
                      <b>{row.goals}</b>
                    </div>
                  ))}
                </div>
              </section>
              {renderRulesCard()}
              </aside>
            </details>
          </section>
        )}

        {displayedTab === "bundesliga-bonus" && !bonusAvailable && !archivePreview && (
          <section className="bundesliga-public-card bundesliga-preseason-empty">
            <h2>Bonusfragen werden vorbereitet</h2>
            <p>Sobald die Teams der Saison 2026/2027 importiert sind, kannst du Meister, Torschützenkönig und Absteiger tippen.</p>
          </section>
        )}

        {displayedTab === "bundesliga-bonus" && (bonusAvailable || archivePreview) && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card bundesliga-bonus-public">
              <div className="bundesliga-public-section-head">
                <div>
                  <h2>Bonus tippen</h2>
                  <p>{archivePreview ? "Archivvorschau - Änderungen nicht möglich" : "Meister, Torschützenkönig und drei Absteiger wählen."}</p>
                </div>
                <button type="button" onClick={() => saveBonus()} disabled={bonusLocked}>{archivePreview ? "Nur lesbar" : bonusLocked ? "Bonusfrist abgelaufen" : "Bonus speichern"}</button>
              </div>
              {renderBonusProgress()}
              <div className="bundesliga-bonus-stepper" aria-label="Bonus Fortschritt">
                <span className={bonusTip.championTeamId ? "done" : "active"}>1 Meister</span>
                <span className={bonusTip.topScorerId || bonusTip.topScorer ? "done" : bonusTip.championTeamId ? "active" : ""}>2 Torschütze</span>
                <span className={bonusStatus.relegatedDoneCount === 3 ? "done" : bonusTip.topScorerId || bonusTip.topScorer ? "active" : ""}>3 Absteiger</span>
              </div>
              <section className="bundesliga-choice-section">
                <h3>Meister</h3>
                <div className="bundesliga-choice-grid">
                  {bonusTeams.map((team) => (
                    <button key={team.id} type="button" disabled={bonusLocked} className={bonusTip.championTeamId === team.id ? "selected" : ""} onClick={() => updateBonus({ championTeamId: team.id })}>
                      <BundesligaLogo src={team.logo_url} name={team.name} />
                      <strong>{team.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="bundesliga-choice-section">
                <h3>Torschützenkönig</h3>
                <label className="bundesliga-scorer-manual-input">
                  Spielername
                  <input
                    value={bonusTip.topScorer ?? ""}
                    disabled={bonusLocked}
                    placeholder="z. B. Harry Kane"
                    onChange={(event) => updateBonus({ topScorer: event.target.value, topScorerId: "" })}
                  />
                </label>
                <div className="bundesliga-scorer-choice-list">
                  {topScorers.slice(0, 12).map((row) => (
                    <button key={row.id} type="button" disabled={bonusLocked} className={bonusTip.topScorerId === row.id ? "selected" : ""} onClick={() => updateBonus({ topScorerId: row.id, topScorer: row.display_name })}>
                      <strong>{row.display_name}</strong>
                      <span>{row.team_name || "OpenLigaDB"}</span>
                      <b>{row.goals} Tore</b>
                    </button>
                  ))}
                </div>
                {topScorers.length === 0 && <p className="bundesliga-field-note">Die Vorschlagsliste erscheint nach dem ersten OpenLigaDB-Torschützenimport. Dein eingetragener Name wird bereits gespeichert.</p>}
              </section>
              <section className="bundesliga-choice-section">
                <h3>Absteiger <span>{bonusTip.relegatedTeamIds.length} / 3</span></h3>
                <div className="bundesliga-choice-grid compact">
                  {bonusTeams.map((team) => (
                    <button key={team.id} type="button" disabled={bonusLocked} className={bonusTip.relegatedTeamIds.includes(team.id) ? "selected" : ""} onClick={() => toggleRelegatedTeam(team.id)}>
                      <BundesligaLogo src={team.logo_url} name={team.name} />
                      <strong>{team.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
            </section>
            <aside className="bundesliga-side-stack">
              <section className="bundesliga-public-card">
                <h2>Dein Bonus</h2>
                <div className="bundesliga-bonus-summary">
                  <div><span>Meister</span><strong>{teamsById.get(bonusTip.championTeamId)?.name ?? "offen"}</strong></div>
                  <div><span>Torschütze</span><strong>{topScorers.find((row) => row.id === bonusTip.topScorerId)?.display_name ?? (bonusTip.topScorer?.trim() || "offen")}</strong></div>
                  <div><span>Absteiger</span><strong>{bonusTip.relegatedTeamIds.length} / 3</strong></div>
                </div>
              </section>
              <section className="bundesliga-public-card">
                <h2>Bonuspunkte</h2>
                <div className="bundesliga-rule-list compact">
                  {bundesligaRuleRows.slice(4).map(([label, value]) => (
                    <div key={label}><span>{label}</span><b>{value}</b></div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        )}

        {displayedTab === "bundesliga-rangliste" && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card">
              <div className="bundesliga-ranking-header">
                <h2>Bundesliga Rangliste</h2>
                <div className="bundesliga-ranking-tabs" aria-label="Ranglistenwertung">
                  <button type="button" className={rankingMode === "total" ? "active" : ""} onClick={() => setRankingMode("total")}>Gesamtpunkte</button>
                  <button type="button" className={rankingMode === "average" ? "active" : ""} onClick={() => setRankingMode("average")}>Punkteschnitt</button>
                </div>
              </div>
              {!selectedRankingReady ? (
                <section className="bundesliga-ranking-empty">
                  <strong>Noch keine Rangliste</strong>
                  <p>Die Platzierung entsteht nach den ersten ausgewerteten Spielen.</p>
                  {ranking.length > 0 && (
                    <div>
                      <span>Teilnehmer</span>
                      {ranking.map((row) => <b key={row.id ?? row.name}>{row.name}</b>)}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <div className="bundesliga-ranking-podium">
                    {displayedTopRankingRows.map((row, index) => (
                      <article key={row.id ?? row.name} className={participant?.id === row.id || participant?.name === row.name ? "current" : ""}>
                        <span>#{index + 1}</span>
                        <strong>{row.name}</strong>
                        <b>{rankingMode === "average" ? `${(row.averagePoints ?? 0).toFixed(2)} P / Tipp` : `${row.points} P`}</b>
                        <small>{rankingMode === "average" ? `${row.scoredTipCount ?? 0} gewertete Tipps` : `${row.matchdayWins ?? 0} Spieltags-Siege`}</small>
                      </article>
                    ))}
                  </div>
                  {displayedCurrentRank && (
                    <div className="bundesliga-current-rank">
                      <span>Dein Platz</span>
                      <strong>{displayedRanking.findIndex((row) => row.id === displayedCurrentRank.id || row.name === displayedCurrentRank.name) + 1}. {displayedCurrentRank.name}</strong>
                      <b>{rankingMode === "average" ? `${(displayedCurrentRank.averagePoints ?? 0).toFixed(2)} P / Tipp` : `${displayedCurrentRank.points} Punkte`}</b>
                      <small>{pointsToNextRank > 0 ? `${pointsToNextRank} Punkte bis zum nächsten Platz` : currentRankPosition === 1 ? "Du führst die Rangliste an." : "Abstand wird nach der ersten Wertung sichtbar."}</small>
                    </div>
                  )}
                  <div className={`bundesliga-public-ranking mode-${rankingMode}`}>
                    {rankingMode === "total" ? (
                      <div className="head"><span>Pl.</span><strong>Name</strong><span>Getippt</span><span>Spieltags-Siege</span><span>Spielpunkte</span><span>Bonus</span><b>Gesamt</b></div>
                    ) : (
                      <div className="head"><span>Pl.</span><strong>Name</strong><span>Gewertete Tipps</span><span>Punkte / Tipp</span><b>Spielpunkte</b></div>
                    )}
                    {displayedRanking.map((row, index) => (
                      <div key={row.id ?? row.name} className={participant?.id === row.id || participant?.name === row.name ? "current" : ""}>
                        <span data-label="Platz">{index + 1}</span>
                        <strong data-label="Name">{row.name}</strong>
                        {rankingMode === "total" ? (
                          <>
                            <span data-label="Getippt">{row.tipCount}</span>
                            <span data-label="Spieltags-Siege">{row.matchdayWins ?? 0}</span>
                            <span data-label="Spielpunkte">{row.matchPoints}</span>
                            <span data-label="Bonus">{row.bonusPoints}</span>
                            <b data-label="Gesamt">{row.points}</b>
                          </>
                        ) : (
                          <>
                            <span data-label="Gewertete Tipps">{row.scoredTipCount ?? 0}</span>
                            <span data-label="Punkte / Tipp">{(row.averagePoints ?? 0).toFixed(2)}</span>
                            <b data-label="Spielpunkte">{row.matchPoints}</b>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="bundesliga-ranking-note">
                    {rankingMode === "total"
                      ? "Gesamt = Spielpunkte + Bonus. Bei Punktgleichstand entscheiden zuerst die Spieltags-Siege."
                      : "Punkteschnitt = Spielpunkte pro gewertetem Tipp. Bonuspunkte zählen nicht in den Schnitt."}
                  </p>
                </>
              )}
            </section>
            <aside className="bundesliga-side-stack">
              {renderCommunityCard()}
              {renderPersonalStatsCard()}
              {renderRulesCard()}
              <section className="bundesliga-public-card">
                {renderCardHeading("Live-Tabelle", () => setBundesligaTab("bundesliga-tabelle"))}
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 6).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <BundesligaLogo src={row.logoUrl} name={row.team} />
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        )}

        {displayedTab === "bundesliga-live" && renderLivePage()}
        {displayedTab === "bundesliga-tabelle" && renderFullTablePage()}
        {displayedTab === "bundesliga-torschuetzen" && renderTopScorersPage()}
        {displayedTab === "bundesliga-spielplan" && renderSchedulePage()}
        {getBundesligaMatchDetailId(displayedTab) && renderMatchDetailPage()}
      </main>
      {participant && (
        <nav className="bundesliga-bottom-nav" aria-label="Bundesliga Hauptnavigation">
          <button type="button" className={displayedTab === "bundesliga-start" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-start")}>
            <House size={18} />
            <span>Start</span>
          </button>
          <button type="button" className={displayedTab === "bundesliga-tippen" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-tippen")}>
            <ListFilter size={18} />
            <span>Tippen</span>
          </button>
          <button type="button" className={displayedTab === "bundesliga-live" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-live")}>
            <Goal size={18} />
            <span>Live</span>
          </button>
          <button type="button" className={displayedTab === "bundesliga-rangliste" ? "active" : ""} onClick={() => { setBundesligaTab("bundesliga-rangliste"); void refreshRanking(); }}>
            <Trophy size={18} />
            <span>Rang</span>
          </button>
          <button type="button" className={moreNavigationActive || mobileMoreOpen ? "active" : ""} onClick={() => setMobileMoreOpen((current) => !current)}>
            <ChevronDown size={18} />
            <span>Menü</span>
          </button>
        </nav>
      )}
    </div>
  );
}

export function BundesligaAdminArea({
  data,
  loading,
  message,
  onRefresh,
  onImport,
  onCreateDemoParticipant,
  onCreateInviteCodes,
  onCreateParticipant,
  onDeleteInviteCode,
  onGenerateDemoTips,
  onRunReleaseProbe,
  onResetReleaseProbe,
  onResetTestlabData,
  onResetSeasonFoundation,
  onImportResults,
  onResetResults,
  onImportTopScorers,
  onSaveTopScorer,
  onRenameParticipant,
  onDeleteParticipant,
  onSaveParticipantTip,
  onSaveParticipantBonus,
  onSaveBonusResults,
  onSetCompetitionStatus,
  onSaveReleaseSettings,
  onSetLiveUpdatesPaused,
  onRefreshLiveNow,
  onBackToWorldCup,
}) {
  const [includeRelegation, setIncludeRelegation] = useState(true);
  const [throughMatchday, setThroughMatchday] = useState(1);
  const [selectedMatchday, setSelectedMatchday] = useState(1);
  const [expandedParticipantId, setExpandedParticipantId] = useState(null);
  const [activeAdminView, setActiveAdminView] = useState("overview");
  const [demoName, setDemoName] = useState("");
  const [newParticipantName, setNewParticipantName] = useState("");
  const [scorerDrafts, setScorerDrafts] = useState({});
  const [participantNameDrafts, setParticipantNameDrafts] = useState({});
  const [participantTipDrafts, setParticipantTipDrafts] = useState({});
  const [participantBonusDrafts, setParticipantBonusDrafts] = useState({});
  const [releaseProbeReport, setReleaseProbeReport] = useState(null);
  const [releaseSettingsDraft, setReleaseSettingsDraft] = useState({
    bonusDeadlineAt: "",
    foreignTipsVisibleFrom: "kickoff",
  });
  const [bonusResultDraft, setBonusResultDraft] = useState({
    championTeamId: "",
    topScorers: [],
    relegatedTeamIds: [],
  });
  const matches = data?.matches ?? [];
  const leagueMatches = matches.filter((match) => match.phase === "league");
  const resultCount = data?.results?.length ?? 0;
  const maxMatchday = Math.max(34, ...leagueMatches.map((match) => Number(match.matchday) || 0));
  const nextMatchday = Math.min(maxMatchday, Math.max(1, throughMatchday));
  const activeMatchday = Math.min(maxMatchday, Math.max(1, selectedMatchday));
  const matchdayOptions = Array.from(
    new Set(leagueMatches.map((match) => Number(match.matchday)).filter(Number.isInteger)),
  ).sort((first, second) => first - second);
  const adminMatchdayOptions = matchdayOptions.length
    ? matchdayOptions
    : Array.from({ length: maxMatchday }, (_, index) => index + 1);
  const selectedMatchdayIndex = Math.max(0, adminMatchdayOptions.indexOf(activeMatchday));
  const visibleMatches = leagueMatches.filter((match) => Number(match.matchday) === activeMatchday);
  const matchdayTipCount = visibleMatches.reduce((sum, match) => sum + (match.demoTips?.length ?? 0), 0);
  const tableRows = data?.table ?? [];
  const rankingRows = data?.ranking ?? [];
  const topScorerRows = data?.topScorers ?? [];
  const inviteCodes = data?.inviteCodes ?? [];
  const participants = data?.participants ?? [];
  const participantTips = data?.participantTips ?? [];
  const participantBonusTips = data?.participantBonusTips ?? [];
  const participantRankingRows = data?.participantRanking ?? [];
  const bonusResults = data?.bonusResults ?? null;
  const ruleSettings = data?.ruleSettings ?? null;
  const rulesSummary = data?.rulesSummary ?? null;
  const dataQuality = data?.dataQuality ?? {};
  const teamRows = data?.teams ?? [];
  const preseasonWaiting = leagueMatches.length === 0 && teamRows.length === 0;
  const logoIssueCount = dataQuality.logoIssueCount ?? 0;
  const normalizedLogoCount = dataQuality.normalizedLogoCount ?? 0;
  const participantsWithoutTips = participants.filter(
    (participant) => !participantTips.some((tip) => tip.participant_id === participant.id),
  );
  const participantsWithIncompleteBonus = preseasonWaiting ? [] : participants.filter((participant) => {
    const bonusTip = participantBonusTips.find((tip) => tip.participant_id === participant.id);
    return !bonusTip?.champion_team_id ||
      !(bonusTip?.top_scorer_id || bonusTip?.top_scorer) ||
      (bonusTip?.relegated_team_ids ?? []).length < 3;
  });
  const matchdaysWithoutCompleteResults = matchdayOptions
    .map((matchday) => {
      const matchdayMatches = leagueMatches.filter((match) => Number(match.matchday) === Number(matchday));
      const missingResults = matchdayMatches.filter((match) => !match.result).length;
      return { matchday, missingResults, matchCount: matchdayMatches.length };
    })
    .filter((row) => row.missingResults > 0);
  const matchdaysWithOpenParticipantTips = matchdayOptions
    .map((matchday) => {
      const matchdayMatches = leagueMatches.filter((match) => Number(match.matchday) === Number(matchday));
      const expectedTips = participants.length * matchdayMatches.length;
      const savedTips = participantTips.filter((tip) => matchdayMatches.some((match) => match.id === tip.match_id)).length;
      return { matchday, openTips: Math.max(0, expectedTips - savedTips), expectedTips };
    })
    .filter((row) => row.expectedTips > 0 && row.openTips > 0);
  const bonusResultsPrepared = Boolean(
    bonusResults?.champion_team_id ||
    (bonusResults?.top_scorers ?? []).length > 0 ||
    (bonusResults?.relegated_team_ids ?? []).length > 0,
  );
  const probeMatchday = matchdayOptions[0] ?? 1;
  const probeMatchdayMatches = leagueMatches.filter((match) => Number(match.matchday) === Number(probeMatchday));
  const probeMatchIds = new Set(probeMatchdayMatches.map((match) => match.id));
  const probeTipCount = participantTips.filter((tip) => probeMatchIds.has(tip.match_id)).length;
  const probeResultCount = probeMatchdayMatches.filter((match) => match.result).length;
  const completeBonusTipCount = participantBonusTips.filter((tip) =>
    tip.champion_team_id &&
    (tip.top_scorer_id || tip.top_scorer) &&
    (tip.relegated_team_ids ?? []).length >= 3
  ).length;
  const fallbackReleaseChecks = [
    {
      label: "Spielplan importiert",
      done: leagueMatches.length >= 306,
      detail: `${leagueMatches.length} Liga-Spiele`,
    },
    {
      label: "Teams/Logos vollständig",
      done: teamRows.length >= 18 && logoIssueCount === 0,
      detail: `${teamRows.length} Teams · ${logoIssueCount} Logo-Hinweise`,
    },
    {
      label: "Torschützen importiert",
      done: topScorerRows.length > 0 && dataQuality.topScorerSource !== "match_goals_fallback",
      detail: `${dataQuality.topScorerCount ?? topScorerRows.length} Spieler`,
    },
    {
      label: "Bonus-Ergebnisse vorbereitet",
      done: bonusResultsPrepared,
      detail: bonusResultsPrepared ? "mindestens ein offizieller Bonuswert gesetzt" : "noch offen",
    },
    {
      label: "Codes erzeugt",
      done: inviteCodes.length > 0,
      detail: `${inviteCodes.length} Codes im Admin`,
    },
    {
      label: "Testteilnehmer geprüft",
      done: participants.length > 0 && participantTips.length > 0,
      detail: `${participants.length} Teilnehmer · ${participantTips.length} Tipps`,
    },
    {
      label: "Öffentliche Freigabe noch aus",
      done: !data?.competition?.public_enabled,
      detail: data?.competition?.public_enabled ? "öffentlich aktiv" : "weiter versteckt",
    },
    {
      label: "Spieltag-Zentrale aktiv",
      done: Boolean(data?.participantMatchdayStatus || data?.demoMatchdayStatus),
      detail: "Status für offene, gesperrte und ausgewertete Spiele",
    },
    {
      label: "Live-Auswertung verfügbar",
      done: Boolean(data?.activeLive),
      detail: "Spieltagssieger und sichtbare Tipps werden berechnet",
    },
    {
      label: "Bonus-Erinnerung sichtbar",
      done: true,
      detail: "Teilnehmer sehen Bonus-Fortschritt auf Start und Tippen",
    },
    {
      label: "Regeln sichtbar",
      done: true,
      detail: "Punkte, Sichtbarkeit und Tie-Breaker sind erklärt",
    },
    {
      label: "Branding eingebunden",
      done: true,
      detail: "Österfeld-Bundesliga-Logo in Teilnehmeransicht und Admin",
    },
    {
      label: "Start-Dashboard aktiv",
      done: true,
      detail: "Status, Top 3, nächste Spiele und Tabelle sichtbar",
    },
    {
      label: "Mobile Rangliste vorbereitet",
      done: true,
      detail: "Rangliste klappt auf Smartphone in Karten um",
    },
    {
      label: "Admin-Qualitätscheck aktiv",
      done: true,
      detail: "offene Tipps, Bonus und Ergebnislücken werden sichtbar",
    },
    {
      label: "Komfortkarten aktiv",
      done: true,
      detail: "Was fehlt noch, Meine Statistik, Community und Saisonstatus",
    },
    {
      label: "Automatik geschützt",
      done: dataQuality.autoImportEnabled === false,
      detail: dataQuality.autoImportEnabled ? "Auto-Import per Env aktiv" : "Auto-Import bleibt ohne Env-Flag inaktiv",
    },
  ];
  const releaseChecks = data?.releaseGates?.checks?.length
    ? data.releaseGates.checks.map((check) => ({
        id: check.id,
        label: check.label,
        done: check.passed,
        waiting: preseasonWaiting && ["fixtures", "teams", "scorers", "probe-data", "test-results"].includes(check.id),
        detail: check.detail,
      }))
    : fallbackReleaseChecks;
  const releaseReady = Boolean(data?.releaseGates?.ready);
  const importedThrough = leagueMatches.reduce((max, match) => {
    if (!match.result) return max;
    return Math.max(max, Number(match.matchday) || 0);
  }, 0);
  const releaseProbeChecks = [
    {
      label: "Spielplan importiert",
      done: leagueMatches.length >= 306,
      detail: `${leagueMatches.length} / 306 Liga-Spiele`,
    },
    {
      label: "Teams/Logos vorhanden",
      done: teamRows.length >= 18 && logoIssueCount === 0,
      detail: `${teamRows.length} Teams · ${logoIssueCount} Logo-Hinweise`,
    },
    {
      label: "Torschützen importiert",
      done: topScorerRows.length > 0 && dataQuality.topScorerSource !== "match_goals_fallback",
      detail: `${dataQuality.topScorerCount ?? topScorerRows.length} Einträge`,
    },
    {
      label: "Testcode vorhanden",
      done: inviteCodes.length > 0,
      detail: `${inviteCodes.length} Bundesliga-Codes`,
    },
    {
      label: "Testteilnehmer aktiviert",
      done: participants.length > 0,
      detail: `${participants.length} Teilnehmer`,
    },
    {
      label: `Spieltag ${probeMatchday}-Tipps gespeichert`,
      done: probeTipCount > 0,
      detail: `${probeTipCount} Tipps für ${probeMatchdayMatches.length} Spiele`,
    },
    {
      label: "Bonus gespeichert",
      done: completeBonusTipCount > 0,
      detail: `${completeBonusTipCount} vollständige Bonus-Tipps`,
    },
    {
      label: `Ergebnisse Spieltag ${probeMatchday} importiert`,
      done: probeMatchdayMatches.length > 0 && probeResultCount === probeMatchdayMatches.length,
      detail: `${probeResultCount} / ${probeMatchdayMatches.length} Ergebnisse`,
    },
    {
      label: "Rangliste berechnet",
      done: participantRankingRows.length > 0,
      detail: `${participantRankingRows.length} Ranking-Zeilen`,
    },
  ];

  useEffect(() => {
    setBonusResultDraft({
      championTeamId: bonusResults?.champion_team_id ?? "",
      topScorers: bonusResults?.top_scorers ?? [],
      relegatedTeamIds: bonusResults?.relegated_team_ids ?? [],
    });
  }, [bonusResults?.champion_team_id, bonusResults?.top_scorers, bonusResults?.relegated_team_ids]);

  useEffect(() => {
    setReleaseSettingsDraft({
      bonusDeadlineAt: formatDateTimeInput(data?.competition?.bonus_deadline_at),
      foreignTipsVisibleFrom: ruleSettings?.foreign_tips_visible_from ?? "kickoff",
    });
  }, [data?.competition?.bonus_deadline_at, ruleSettings?.foreign_tips_visible_from]);

  async function createDemoParticipant() {
    await onCreateDemoParticipant(demoName);
    setDemoName("");
  }

  async function createParticipant() {
    const payload = await onCreateParticipant(newParticipantName);
    if (payload?.participant) {
      setNewParticipantName("");
      setExpandedParticipantId(payload.participant.id);
    }
  }

  function moveAdminMatchday(delta) {
    if (!adminMatchdayOptions.length) return;
    const currentIndex = adminMatchdayOptions.indexOf(activeMatchday);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(adminMatchdayOptions.length - 1, safeIndex + delta));
    setSelectedMatchday(adminMatchdayOptions[nextIndex]);
  }

  function scorerDraftFor(row) {
    return scorerDrafts[row.id] ?? {
      displayName: row.name,
      teamName: row.teamName ?? "",
    };
  }

  function updateScorerDraft(row, patch) {
    setScorerDrafts((current) => ({
      ...current,
      [row.id]: {
        ...scorerDraftFor(row),
        ...patch,
      },
    }));
  }

  async function saveScorer(row) {
    const draft = scorerDraftFor(row);
    await onSaveTopScorer(row.id, draft.displayName, draft.teamName);
    setScorerDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
  }

  function participantNameDraft(participant) {
    return participantNameDrafts[participant.id] ?? participant.display_name;
  }

  function participantTipDraft(participantId, matchId) {
    const key = `${participantId}:${matchId}`;
    if (participantTipDrafts[key]) return participantTipDrafts[key];
    const savedTip = participantTips.find((tip) => tip.participant_id === participantId && tip.match_id === matchId);
    return {
      scoreA: Number.isInteger(savedTip?.score_a) ? savedTip.score_a : null,
      scoreB: Number.isInteger(savedTip?.score_b) ? savedTip.score_b : null,
    };
  }

  function updateParticipantTipDraft(participantId, matchId, patch) {
    const key = `${participantId}:${matchId}`;
    setParticipantTipDrafts((current) => ({
      ...current,
      [key]: {
        ...participantTipDraft(participantId, matchId),
        ...current[key],
        ...patch,
      },
    }));
  }

  function participantBonusDraft(participantId) {
    if (participantBonusDrafts[participantId]) return participantBonusDrafts[participantId];
    const savedBonus = participantBonusTips.find((tip) => tip.participant_id === participantId);
    return {
      championTeamId: savedBonus?.champion_team_id ?? "",
      topScorerId: savedBonus?.top_scorer_id ?? "",
      topScorer: savedBonus?.top_scorer ?? "",
      relegatedTeamIds: savedBonus?.relegated_team_ids ?? [],
    };
  }

  function updateParticipantBonusDraft(participantId, patch) {
    setParticipantBonusDrafts((current) => ({
      ...current,
      [participantId]: {
        ...participantBonusDraft(participantId),
        ...current[participantId],
        ...patch,
      },
    }));
  }

  function toggleId(list, id, max = 99) {
    return list.includes(id) ? list.filter((item) => item !== id) : [...list, id].slice(0, max);
  }

  async function saveParticipantBonus(participantId) {
    const draft = participantBonusDraft(participantId);
    const scorer = topScorerRows.find((row) => row.id === draft.topScorerId);
    await onSaveParticipantBonus(participantId, {
      championTeamId: draft.championTeamId,
      topScorerId: draft.topScorerId,
      topScorer: scorer?.name ?? draft.topScorer,
      relegatedTeamIds: draft.relegatedTeamIds,
    });
  }

  async function saveOfficialBonusResults() {
    await onSaveBonusResults(bonusResultDraft);
  }

  async function runReleaseProbe() {
    const payload = await onRunReleaseProbe();
    if (payload?.releaseProbe) setReleaseProbeReport(payload.releaseProbe);
  }

  async function resetReleaseProbe() {
    const payload = await onResetReleaseProbe();
    if (payload?.resetReleaseProbe) {
      setReleaseProbeReport(null);
      await onRefresh();
    }
  }

  async function resetTestlabData() {
    const payload = await onResetTestlabData();
    if (payload?.resetTestlabData) {
      setReleaseProbeReport(null);
      await onRefresh();
    }
  }

  const adminNavGroups = [
    {
      label: "Alltag",
      items: [
        { id: "overview", label: "Übersicht", Icon: House },
        { id: "participants", label: "Teilnehmer", Icon: UsersRound },
        { id: "codes", label: "Codes", Icon: QrCode },
      ],
    },
    {
      label: "Spielbetrieb",
      items: [
        { id: "schedule", label: "Spielplan", Icon: CalendarDays },
        { id: "results", label: "Ergebnisse", Icon: ListFilter },
        { id: "bonus", label: "Bonus", Icon: ShieldCheck },
        { id: "ranking", label: "Rangliste", Icon: Trophy },
      ],
    },
    {
      label: "Technik",
      items: [
        { id: "import", label: "Datenimport", Icon: Download },
        { id: "diagnostics", label: "Diagnose & Freigabe", Icon: Info },
      ],
    },
  ];
  const criticalReleaseChecks = releaseChecks.filter((item) => !item.done);
  const operationQueue = preseasonWaiting ? [
    {
      label: "Warten auf offiziellen Spielplan 2026/2027",
      detail: "OpenLigaDB bl1/2026 liefert noch keine importierbare Saisongrundlage.",
      severity: "pending",
      action: () => setActiveAdminView("import"),
      actionLabel: "Datenimport",
    },
    {
      label: participants.length ? `${participants.length} Zugang vorbereitet` : "Zugänge können vorbereitet werden",
      detail: `${inviteCodes.length} Codes · neue Teilnehmer bleiben für 2026/2027 erhalten`,
      severity: "ok",
      action: () => setActiveAdminView("participants"),
      actionLabel: "Teilnehmer",
    },
    {
      label: "Freigabe wartet auf Saisondaten",
      detail: "Spielplan, Teams, Logos und Regelprüfungen folgen nach dem Import.",
      severity: "pending",
      action: () => setActiveAdminView("diagnostics"),
      actionLabel: "Diagnose & Freigabe",
    },
  ] : [
    {
      label: topScorerRows.length > 0 && dataQuality.topScorerSource !== "match_goals_fallback"
        ? "Torschützen aktuell"
        : "Torschützen importieren",
      detail: `${dataQuality.topScorerCount ?? topScorerRows.length} Einträge · ${dataQuality.topScorerSource === "match_goals_fallback" ? "Fallback aktiv" : "OpenLigaDB"}`,
      severity: topScorerRows.length > 0 && dataQuality.topScorerSource !== "match_goals_fallback" ? "ok" : "warning",
      action: () => setActiveAdminView("import"),
      actionLabel: "Import öffnen",
    },
    {
      label: matchdaysWithoutCompleteResults.length ? `Spieltag ${matchdaysWithoutCompleteResults[0].matchday} Ergebnisse prüfen` : "Ergebnisse vollständig",
      detail: matchdaysWithoutCompleteResults.length
        ? `${matchdaysWithoutCompleteResults[0].missingResults} von ${matchdaysWithoutCompleteResults[0].matchCount} Ergebnissen fehlen`
        : `${importedThrough || 0} Spieltage gewertet`,
      severity: matchdaysWithoutCompleteResults.length ? "warning" : "ok",
      action: () => setActiveAdminView("results"),
      actionLabel: "Ergebnisse",
    },
    {
      label: participantsWithIncompleteBonus.length ? `${participantsWithIncompleteBonus.length} Teilnehmer ohne vollständigen Bonus` : "Bonus-Tipps vollständig",
      detail: participantsWithIncompleteBonus.slice(0, 3).map((row) => row.display_name).join(", ") || "keine offenen Bonus-Lücken",
      severity: participantsWithIncompleteBonus.length ? "warning" : "ok",
      action: () => setActiveAdminView("participants"),
      actionLabel: "Teilnehmer",
    },
    {
      label: criticalReleaseChecks.length ? `${criticalReleaseChecks.length} Release-Hinweise offen` : "Release-Check ohne Blocker",
      detail: criticalReleaseChecks.slice(0, 2).map((item) => item.label).join(" · ") || "Freigabe bleibt bewusst versteckt",
      severity: criticalReleaseChecks.length ? "warning" : "ok",
      action: () => setActiveAdminView("diagnostics"),
      actionLabel: "Diagnose & Freigabe",
    },
  ];
  const kpiRows = [
    { label: "Liga-Spiele", value: leagueMatches.length, detail: "Spielplan" },
    { label: "Teams", value: data?.teams?.length ?? 0, detail: preseasonWaiting ? "wartet auf Import" : logoIssueCount ? `${logoIssueCount} Logo-Hinweise` : "Logos ok" },
    { label: "Teilnehmer", value: participants.length, detail: `${inviteCodes.length} Codes` },
    { label: "Offene Tipps", value: matchdaysWithOpenParticipantTips.reduce((sum, row) => sum + row.openTips, 0), detail: "echte Teilnehmer" },
    { label: "Gewertet", value: importedThrough || 0, detail: "Spieltage" },
    { label: "Torschützen", value: dataQuality.topScorerCount ?? topScorerRows.length, detail: preseasonWaiting ? "nach Spielplan" : dataQuality.topScorerSource === "match_goals_fallback" ? "Fallback" : "OpenLigaDB" },
  ];
  const nextAdminSteps = preseasonWaiting
    ? [
        { label: "Offiziellen Spielplan abwarten", detail: "OpenLigaDB bl1/2026 prüfen, sobald Daten verfügbar sind.", status: "current" },
        { label: "Zugänge vorbereiten", detail: "Teilnehmer und Einladungscodes können bereits angelegt werden.", status: participants.length || inviteCodes.length ? "done" : "open" },
        { label: "Release prüfen", detail: "Probelauf und Freigabe starten erst nach dem Spielplanimport.", status: "waiting" },
      ]
    : [
        { label: "Offene Aufgaben bearbeiten", detail: operationQueue.find((item) => item.severity !== "ok")?.label ?? "Keine dringenden Aufgaben.", status: criticalReleaseChecks.length ? "current" : "done" },
        { label: "Teilnehmerbetrieb prüfen", detail: `${participants.length} Teilnehmer · ${matchdaysWithOpenParticipantTips.length} Spieltage mit offenen Tipps`, status: matchdaysWithOpenParticipantTips.length ? "open" : "done" },
        { label: "Freigabe kontrollieren", detail: releaseReady ? "Release-Gates erfüllt." : `${criticalReleaseChecks.length} Voraussetzung(en) offen.`, status: releaseReady ? "done" : "waiting" },
      ];

  function renderReleaseChecklist() {
    return (
      <section className="bundesliga-dark-panel bundesliga-release-checklist">
        <header>
          <h3>Release-Checkliste</h3>
          <span>{releaseChecks.filter((item) => item.done).length} / {releaseChecks.length}</span>
        </header>
        <div>
          {releaseChecks.map((item) => (
            <article key={item.label} className={item.done ? "done" : item.waiting ? "pending" : ""}>
              <span>{item.done ? "OK" : item.waiting ? "wartet" : "!"}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderReleaseProbe() {
    return (
      <section className="bundesliga-dark-panel bundesliga-release-probe">
        <header>
          <h3>Release-Probelauf</h3>
          <span>{releaseProbeChecks.filter((item) => item.done).length} / {releaseProbeChecks.length}</span>
        </header>
        <p>
          Ein kompletter Test wie später im Betrieb: Code erzeugen, Teilnehmer aktivieren,
          Spieltag tippen, Bonus speichern, Ergebnisse importieren und Rangliste prüfen.
        </p>
        <div className="bundesliga-probe-actions">
          <button type="button" onClick={runReleaseProbe} disabled={loading || preseasonWaiting}>
            Release-Probelauf vorbereiten
          </button>
          <small>Bereitet kontrollierte Testteilnehmer, Tipps und Auswertungen für die Releaseprüfung vor. Bereinigung und Rücksetzungen liegen gesammelt im Gefahrenbereich.</small>
          {preseasonWaiting && <small>Der Probelauf beginnt, sobald der offizielle Spielplan importiert werden kann.</small>}
        </div>
        {releaseProbeReport && (
          <div className="bundesliga-probe-report">
            <strong>Letzter Lauf</strong>
            <span>{releaseProbeReport.participants?.length ?? 0} Testteilnehmer</span>
            <span>{releaseProbeReport.savedTips ?? 0} Spieltag-1-Tipps</span>
            <span>{releaseProbeReport.bonusTips ?? 0} Bonus-Tipps</span>
            <span>{releaseProbeReport.importedResults ?? 0} Ergebnisse</span>
            <span>{releaseProbeReport.rankingRows ?? 0} Ranking-Zeilen</span>
            <span>{releaseProbeReport.competition?.publicEnabled ? "öffentlich aktiv" : "weiter versteckt"}</span>
          </div>
        )}
        {releaseProbeReport?.warnings?.length > 0 && (
          <div className="bundesliga-probe-warnings">
            <strong>Warnungen</strong>
            {releaseProbeReport.warnings.map((warning) => <span key={warning}>{warning}</span>)}
          </div>
        )}
        <div className="bundesliga-probe-grid">
          {releaseProbeChecks.map((item) => (
            <article key={item.label} className={item.done ? "done" : "pending"}>
              <span>{item.done ? "OK" : "offen"}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </article>
          ))}
        </div>
        <ol className="bundesliga-probe-steps">
          <li>OpenLigaDB-Daten, Logos und Torschützen im Admin prüfen.</li>
          <li>Code erzeugen und in der versteckten Teilnehmeransicht aktivieren.</li>
          <li>Spieltag {probeMatchday} tippen, ein offenes -:- stehen lassen und speichern.</li>
          <li>Bonus vollständig tippen und im Admin gegenprüfen.</li>
          <li>Ergebnisse bis Spieltag {probeMatchday} importieren und Rangliste/Live-Auswertung prüfen.</li>
        </ol>
      </section>
    );
  }

  function renderReleaseSettings() {
    return (
      <section className="bundesliga-dark-panel bundesliga-release-settings">
        <header>
          <h3>Release-Konfiguration</h3>
          <span>{data?.competition?.status ?? "admin_test"}</span>
        </header>
        <div className="bundesliga-release-settings-grid">
          <article>
            <span>Öffentlich</span>
            <strong>{data?.competition?.public_enabled ? "ja" : "nein"}</strong>
          </article>
          <article>
            <span>Slug</span>
            <strong>{data?.competition?.public_slug ?? "bundesliga-2026"}</strong>
          </article>
          <article>
            <span>Tipp-Sperre</span>
            <strong>{rulesSummary?.tipLockMode ?? data?.competition?.tip_lock_mode ?? "kickoff"}</strong>
          </article>
          <article>
            <span>Bonusfrist</span>
            <strong>{rulesSummary?.bonusDeadlineAt ? formatDateTime(rulesSummary.bonusDeadlineAt) : "Saisonstart"}</strong>
          </article>
          <article>
            <span>Auto-Import</span>
            <strong>{dataQuality.autoImportEnabled ? "aktiv" : "inaktiv"}</strong>
          </article>
          <article>
            <span>Push-Erinnerungen</span>
            <strong>{dataQuality.pushRemindersEnabled ? "aktiv" : "inaktiv"}</strong>
          </article>
          <article>
            <span>Letzter Ergebnisimport</span>
            <strong>{dataQuality.lastResultImportAt ? formatDateTime(dataQuality.lastResultImportAt) : "noch offen"}</strong>
          </article>
          <article>
            <span>Letzter Spielplanimport</span>
            <strong>{dataQuality.lastMatchImportAt ? formatDateTime(dataQuality.lastMatchImportAt) : "noch offen"}</strong>
          </article>
        </div>
        <div className="bundesliga-rule-list compact">
          <div><span>Exakt</span><b>{ruleSettings?.exact_score_points ?? 4} Punkte</b></div>
          <div><span>Differenz</span><b>{ruleSettings?.goal_diff_points ?? 3} Punkte</b></div>
          <div><span>Tendenz</span><b>{ruleSettings?.tendency_points ?? 2} Punkte</b></div>
          <div><span>Meister</span><b>{ruleSettings?.champion_bonus_points ?? 6} Punkte</b></div>
          <div><span>Torschützenkönig</span><b>{ruleSettings?.top_scorer_bonus_points ?? 6} Punkte</b></div>
          <div><span>Absteiger</span><b>{ruleSettings?.relegated_team_bonus_points ?? 4} je Verein</b></div>
        </div>
        <div className="bundesliga-release-editor">
          <label>
            Bonusfrist
            <input
              type="datetime-local"
              value={releaseSettingsDraft.bonusDeadlineAt}
              onChange={(event) => setReleaseSettingsDraft((current) => ({ ...current, bonusDeadlineAt: event.target.value }))}
            />
          </label>
          <label>
            Fremde Tipps sichtbar
            <select
              value={releaseSettingsDraft.foreignTipsVisibleFrom}
              onChange={(event) => setReleaseSettingsDraft((current) => ({ ...current, foreignTipsVisibleFrom: event.target.value }))}
            >
              <option value="kickoff">ab Anpfiff</option>
              <option value="match_finished">nach Abpfiff</option>
              <option value="never">nie</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => onSaveReleaseSettings({
              bonusDeadlineAt: releaseSettingsDraft.bonusDeadlineAt
                ? new Date(releaseSettingsDraft.bonusDeadlineAt).toISOString()
                : "",
              foreignTipsVisibleFrom: releaseSettingsDraft.foreignTipsVisibleFrom,
            })}
            disabled={loading || !releaseSettingsDraft.bonusDeadlineAt}
          >
            Release-Regeln speichern
          </button>
          <small>Die Tipp-Sperre bleibt für den Livegang fest auf Anpfiff.</small>
        </div>
      </section>
    );
  }

  function renderTeamLogoQuality() {
    return (
      <section className="bundesliga-dark-panel bundesliga-team-quality-panel">
        <header>
          <h3>Teams & Logos</h3>
          <span>{logoIssueCount === 0 ? "Logos vollständig" : `${logoIssueCount} Hinweise`}</span>
        </header>
        {normalizedLogoCount > 0 && (
          <p>{normalizedLogoCount} Wikimedia-Logo-URL{normalizedLogoCount === 1 ? "" : "s"} werden beim Laden auf robuste Thumbnail-Größen normalisiert.</p>
        )}
        <div className="bundesliga-team-quality-list">
          {teamRows.map((team) => {
            const hasLogo = Boolean(team.logo_url);
            return (
              <article key={team.id} className={hasLogo ? "ok" : "warning"}>
                <BundesligaLogo src={team.logo_url} name={team.name} />
                <strong>{team.name}</strong>
                <small>{hasLogo ? "Logo ok" : "Logo fehlt"}</small>
              </article>
            );
          })}
          {teamRows.length === 0 && <p>Noch keine Teams importiert.</p>}
        </div>
      </section>
    );
  }

  function renderQualityCheck() {
    if (preseasonWaiting) {
      return (
        <section className="bundesliga-dark-panel bundesliga-quality-check is-waiting">
          <header>
            <h3>Qualitätscheck</h3>
            <span>Vorsaison</span>
          </header>
          <p>Zugänge sind vorbereitet. Tipps, Bonus-Ergebnisse, Logos und Resultate werden nach dem offiziellen Spielplanimport geprüft.</p>
        </section>
      );
    }
    return (
      <section className="bundesliga-dark-panel bundesliga-quality-check">
        <header>
          <h3>Qualitätscheck</h3>
          <span>{participants.length} Teilnehmer · {matchdayOptions.length} Spieltage</span>
        </header>
        <div className="bundesliga-quality-grid">
          <article className={participantsWithoutTips.length === 0 ? "ok" : "warning"}>
            <strong>{participantsWithoutTips.length}</strong>
            <span>Teilnehmer ohne Tipps</span>
            <small>{participantsWithoutTips.slice(0, 3).map((row) => row.display_name).join(", ") || "alles sauber"}</small>
          </article>
          <article className={participantsWithIncompleteBonus.length === 0 ? "ok" : "warning"}>
            <strong>{participantsWithIncompleteBonus.length}</strong>
            <span>Bonus unvollständig</span>
            <small>{participantsWithIncompleteBonus.slice(0, 3).map((row) => row.display_name).join(", ") || "alles sauber"}</small>
          </article>
          <article className={matchdaysWithoutCompleteResults.length === 0 ? "ok" : "warning"}>
            <strong>{matchdaysWithoutCompleteResults.length}</strong>
            <span>Spieltage ohne komplette Ergebnisse</span>
            <small>{matchdaysWithoutCompleteResults.slice(0, 4).map((row) => `ST ${row.matchday}: ${row.missingResults}`).join(" · ") || "alles importiert"}</small>
          </article>
          <article className={matchdaysWithOpenParticipantTips.length === 0 ? "ok" : "warning"}>
            <strong>{matchdaysWithOpenParticipantTips.length}</strong>
            <span>Spieltage mit offenen Tipps</span>
            <small>{matchdaysWithOpenParticipantTips.slice(0, 4).map((row) => `ST ${row.matchday}: ${row.openTips}`).join(" · ") || "alle Tipps vollständig"}</small>
          </article>
        </div>
      </section>
    );
  }

  function renderStandingsTable() {
    return (
      <section className="bundesliga-table-panel">
        <header>
          <h3>Bundesliga Tabelle</h3>
          <span>nach importierten Ergebnissen</span>
        </header>
        <div className="bundesliga-table-scroll">
          <table className="bundesliga-standings-table">
            <thead>
              <tr>
                <th>Pl.</th>
                <th aria-label="Trend"></th>
                <th>Team</th>
                <th>SP.</th>
                <th>S</th>
                <th>U</th>
                <th>N</th>
                <th>Tore</th>
                <th>Diff.</th>
                <th>Punkte</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => {
                const position = index + 1;
                const diff = row.goalsFor - row.goalsAgainst;
                return (
                  <tr key={row.teamId} className={[
                    position <= 4 ? "zone-champions" : "",
                    position >= 5 && position <= 6 ? "zone-europa" : "",
                    position === 16 ? "zone-relegation" : "",
                    position >= 17 ? "zone-down" : "",
                  ].filter(Boolean).join(" ")}>
                    <td>{position}</td>
                    <td>{position <= 4 ? "—" : position >= 17 ? "↓" : "–"}</td>
                    <td>
                      <span className="bundesliga-club">
                        <BundesligaLogo src={row.logoUrl} name={row.team} className="bundesliga-club-logo" />
                        <strong>{row.team}</strong>
                      </span>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor}:{row.goalsAgainst}</td>
                    <td>{diff}</td>
                    <td>{row.points}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <footer className="bundesliga-table-legend">
          <span><i className="champions" /> Champions League</span>
          <span><i className="europa" /> Europa League</span>
          <span><i className="relegation" /> Relegation</span>
          <span><i className="down" /> Abstieg</span>
        </footer>
      </section>
    );
  }

  function renderResultsPanel({ compact = false } = {}) {
    return (
      <section className={`bundesliga-dark-panel${compact ? "" : " bundesliga-view-panel"}`}>
        <header>
          <h3>Spieltag {activeMatchday} - Ergebnisse</h3>
          <select value={activeMatchday} onChange={(event) => setSelectedMatchday(Number(event.target.value))}>
            {(matchdayOptions.length ? matchdayOptions : Array.from({ length: maxMatchday }, (_, index) => index + 1)).map((matchday) => (
              <option key={matchday} value={matchday}>Spieltag {matchday}</option>
            ))}
          </select>
        </header>
        <div className="bundesliga-result-list">
          {visibleMatches.map((match) => (
            <div key={match.id}>
              <small>{formatDateTime(match.kickoff_at)}</small>
              <strong>{match.team_a_name}</strong>
              <b>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</b>
              <strong>{match.team_b_name}</strong>
              <span className={match.result ? "imported" : ""}>
                {match.result ? "Importiert" : "Offen"}
              </span>
            </div>
          ))}
          {visibleMatches.length === 0 && <p>Noch keine Spiele für diesen Spieltag importiert.</p>}
        </div>
      </section>
    );
  }

  function renderResultsWorkflow() {
    return (
      <section className="bundesliga-dark-panel bundesliga-results-workflow">
        <header>
          <h3>Ergebnisimport</h3>
          <span>{preseasonWaiting ? "wartet auf Spielplan" : "OpenLigaDB aktualisieren"}</span>
        </header>
        <p>
          {preseasonWaiting
            ? "Ergebnisse können nach dem ersten offiziellen Spielplanimport aktualisiert werden."
            : "Importiere fertige Resultate und kontrolliere danach die Teilnehmerauswertung darunter."}
        </p>
        <div className="bundesliga-results-actions">
          <label>
            Bis Spieltag
            <input
              type="number"
              min="1"
              max={maxMatchday}
              value={nextMatchday}
              onChange={(event) => setThroughMatchday(Number(event.target.value))}
              disabled={preseasonWaiting}
            />
          </label>
          <button type="button" onClick={() => onImportResults(nextMatchday)} disabled={loading || preseasonWaiting}>
            Bis Spieltag {nextMatchday} aktualisieren
          </button>
          <button type="button" className="secondary-button" onClick={() => onImportResults(maxMatchday)} disabled={loading || preseasonWaiting}>
            Alle Ergebnisse prüfen
          </button>
        </div>
      </section>
    );
  }

  function renderTipEvaluation({ compact = false } = {}) {
    return (
      <section className={`bundesliga-dark-panel${compact ? "" : " bundesliga-view-panel"}`}>
        <header>
          <h3>Demo-Tipp Auswertung</h3>
          <span>Spieltag {activeMatchday} · {matchdayTipCount} Tipps</span>
          <select value={activeMatchday} onChange={(event) => setSelectedMatchday(Number(event.target.value))}>
            {(matchdayOptions.length ? matchdayOptions : Array.from({ length: maxMatchday }, (_, index) => index + 1)).map((matchday) => (
              <option key={matchday} value={matchday}>Spieltag {matchday}</option>
            ))}
          </select>
        </header>
        <div className="bundesliga-tip-match-list">
          {visibleMatches.map((match) => (
            <div key={match.id} className="bundesliga-tip-match-card">
              <div className="bundesliga-tip-match-head">
                <small>{formatDateTime(match.kickoff_at)}</small>
                <strong>{match.team_a_name}</strong>
                <b>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</b>
                <strong>{match.team_b_name}</strong>
              </div>
              <div className="bundesliga-tip-evaluation">
                {(match.demoTips ?? []).map((tip) => (
                  <div key={tip.id}>
                    <strong>{tip.participantName}</strong>
                    <span>{tip.score_a}:{tip.score_b}</span>
                    <span>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</span>
                    <b className={tip.points > 0 ? "positive" : ""}>{tip.hasResult ? tip.points : "offen"}</b>
                  </div>
                ))}
                {(match.demoTips ?? []).length === 0 && <p>Noch keine Demo-Tipps für dieses Spiel.</p>}
              </div>
            </div>
          ))}
          {visibleMatches.length === 0 && <p>Noch keine Spiele für diesen Spieltag importiert.</p>}
        </div>
      </section>
    );
  }

  function renderParticipantEvaluation() {
    const matchdayParticipantTipCount = visibleMatches.reduce((sum, match) => sum + (match.participantTips?.length ?? 0), 0);
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Echte Teilnehmer-Tipps</h3>
          <span>Spieltag {activeMatchday} · {matchdayParticipantTipCount} Tipps</span>
          <select value={activeMatchday} onChange={(event) => setSelectedMatchday(Number(event.target.value))}>
            {(matchdayOptions.length ? matchdayOptions : Array.from({ length: maxMatchday }, (_, index) => index + 1)).map((matchday) => (
              <option key={matchday} value={matchday}>Spieltag {matchday}</option>
            ))}
          </select>
        </header>
        <div className="bundesliga-tip-match-list">
          {visibleMatches.map((match) => (
            <div key={match.id} className="bundesliga-tip-match-card">
              <div className="bundesliga-tip-match-head">
                <small>{formatDateTime(match.kickoff_at)}</small>
                <strong>{match.team_a_name}</strong>
                <b>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</b>
                <strong>{match.team_b_name}</strong>
              </div>
              <div className="bundesliga-tip-evaluation">
                {(match.participantTips ?? []).map((tip) => {
                  const visible = match.result?.status === "final" || (match.kickoff_at && new Date(match.kickoff_at) <= new Date());
                  return (
                    <div key={tip.id}>
                      <strong>{tip.participantName}</strong>
                      <span>{visible ? `${tip.score_a}:${tip.score_b}` : "versteckt bis Anpfiff"}</span>
                      <span>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</span>
                      <b className={tip.points > 0 ? "positive" : ""}>{tip.hasResult && visible ? tip.points : "offen"}</b>
                    </div>
                  );
                })}
                {(match.participantTips ?? []).length === 0 && <p>Noch keine echten Tipps für dieses Spiel.</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderParticipants() {
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Bundesliga Teilnehmer</h3>
          <span>{participants.length} echte Teilnehmer</span>
          <div className="bundesliga-matchday-admin-controls" aria-label="Spieltag für Tipp-Nachtrag">
            <button type="button" onClick={() => moveAdminMatchday(-1)} disabled={selectedMatchdayIndex <= 0}>
              <ChevronRight aria-hidden="true" className="flip-icon" size={16} />
              Zurück
            </button>
            <select value={activeMatchday} onChange={(event) => setSelectedMatchday(Number(event.target.value))}>
              {adminMatchdayOptions.map((matchday) => (
                <option key={matchday} value={matchday}>Spieltag {matchday}</option>
              ))}
            </select>
            <button type="button" onClick={() => moveAdminMatchday(1)} disabled={selectedMatchdayIndex >= adminMatchdayOptions.length - 1}>
              Weiter
              <ChevronRight aria-hidden="true" size={16} />
            </button>
          </div>
        </header>
        <section className="bundesliga-admin-create">
          <label>
            Neuen Teilnehmer anlegen
            <input
              value={newParticipantName}
              onChange={(event) => setNewParticipantName(event.target.value)}
              placeholder="Name des Teilnehmers"
            />
          </label>
          <button
            type="button"
            onClick={createParticipant}
            disabled={loading || newParticipantName.trim().length < 2}
          >
            Teilnehmer + Code erzeugen
          </button>
        </section>
        <div className="bundesliga-participant-admin-list">
          {participants.map((participant) => {
            const linkedCode = inviteCodes.find((code) => code.participant_id === participant.id || code.id === participant.invite_code_id);
            const tipCount = participantTips.filter((tip) => tip.participant_id === participant.id).length;
            const bonusDraft = participantBonusDraft(participant.id);
            const isExpanded = expandedParticipantId === participant.id;
            const bonusComplete = Boolean(
              bonusDraft.championTeamId &&
              (bonusDraft.topScorerId || bonusDraft.topScorer) &&
              bonusDraft.relegatedTeamIds.length >= 3,
            );
            return (
              <article key={participant.id} className={isExpanded ? "is-expanded" : "is-collapsed"}>
                <div className="bundesliga-participant-summary">
                  <button
                    type="button"
                    className="bundesliga-participant-summary-main"
                    onClick={() => setExpandedParticipantId(isExpanded ? null : participant.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? <ChevronDown aria-hidden="true" size={18} /> : <ChevronRight aria-hidden="true" size={18} />}
                    <span>
                      <strong>{participant.display_name}</strong>
                      <small>{linkedCode?.code ?? "ohne Code"}</small>
                    </span>
                  </button>
                  <span>{tipCount} / {leagueMatches.length} Tipps</span>
                  <span className={bonusComplete ? "ok" : "warning"}>{bonusComplete ? "Bonus komplett" : "Bonus offen"}</span>
                  <div className="bundesliga-participant-qr">
                    {linkedCode?.code ? (
                      <QrCodeImage value={getBundesligaInviteUrl(linkedCode.code)} />
                    ) : (
                      <small>kein QR</small>
                    )}
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setExpandedParticipantId(isExpanded ? null : participant.id)}
                  >
                    {isExpanded ? "Schließen" : "Bearbeiten"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="bundesliga-participant-editor">
                    <h4>Zugang &amp; Name</h4>
                    <div className="bundesliga-participant-admin-head">
                      <label>
                        Name
                        <input
                          value={participantNameDraft(participant)}
                          onChange={(event) => setParticipantNameDrafts((current) => ({ ...current, [participant.id]: event.target.value }))}
                        />
                      </label>
                      <span>{linkedCode?.code ?? "ohne Code"}</span>
                      <b>{tipCount} / {leagueMatches.length} Tipps</b>
                      <button type="button" onClick={() => onRenameParticipant(participant.id, participantNameDraft(participant))} disabled={participantNameDraft(participant).trim().length < 2}>
                        Name speichern
                      </button>
                      <small className="bundesliga-protected-note">Löschen ist ausschließlich unter Diagnose &amp; Freigabe möglich.</small>
                    </div>
                    <h4>Tipps für Spieltag {activeMatchday}</h4>
                    <div className="bundesliga-participant-tip-editor">
                      {visibleMatches.map((match) => {
                        const draft = participantTipDraft(participant.id, match.id);
                        return (
                          <div key={match.id}>
                            <span>ST {match.matchday}</span>
                            <strong>{match.team_a_name} - {match.team_b_name}</strong>
                            <input
                              type="number"
                              min="0"
                              max="12"
                              placeholder="-"
                              value={Number.isInteger(draft.scoreA) ? draft.scoreA : ""}
                              onChange={(event) => updateParticipantTipDraft(participant.id, match.id, { scoreA: event.target.value === "" ? null : Number(event.target.value) })}
                            />
                            <input
                              type="number"
                              min="0"
                              max="12"
                              placeholder="-"
                              value={Number.isInteger(draft.scoreB) ? draft.scoreB : ""}
                              onChange={(event) => updateParticipantTipDraft(participant.id, match.id, { scoreB: event.target.value === "" ? null : Number(event.target.value) })}
                            />
                            <button type="button" onClick={() => onSaveParticipantTip(participant.id, match.id, draft.scoreA, draft.scoreB)} disabled={!isCompleteTip(draft)}>
                              Tipp speichern
                            </button>
                          </div>
                        );
                      })}
                      {visibleMatches.length === 0 && <p>Noch keine Spiele für diesen Spieltag importiert.</p>}
                    </div>
                    <h4>Bonus-Nachtrag</h4>
                    <div className="bundesliga-participant-bonus-editor">
                      <select value={bonusDraft.championTeamId} onChange={(event) => updateParticipantBonusDraft(participant.id, { championTeamId: event.target.value })}>
                        <option value="">Meister offen</option>
                        {data?.teams?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                      </select>
                      <select value={bonusDraft.topScorerId} onChange={(event) => updateParticipantBonusDraft(participant.id, { topScorerId: event.target.value })}>
                        <option value="">Torschütze offen</option>
                        {topScorerRows.filter((row) => row.id).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                      </select>
                      <span>Absteiger: {bonusDraft.relegatedTeamIds.length} / 3</span>
                      <div className="bundesliga-mini-choice-row">
                        {data?.teams?.map((team) => (
                          <button
                            key={team.id}
                            type="button"
                            className={bonusDraft.relegatedTeamIds.includes(team.id) ? "selected" : ""}
                            onClick={() => updateParticipantBonusDraft(participant.id, { relegatedTeamIds: toggleId(bonusDraft.relegatedTeamIds, team.id, 3) })}
                          >
                            {team.short_name || team.name}
                          </button>
                        ))}
                      </div>
                      <button type="button" onClick={() => saveParticipantBonus(participant.id)}>Bonus speichern</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {participants.length === 0 && <p>Noch keine echten Bundesliga-Teilnehmer.</p>}
        </div>
      </section>
    );
  }

  function renderCodes() {
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Bundesliga Codes</h3>
          <button type="button" onClick={onCreateInviteCodes} disabled={loading}>10 Codes erzeugen</button>
        </header>
        <div className="bundesliga-code-list expanded">
          {inviteCodes.map((item) => (
            <div key={item.id}>
              <strong>{item.code}</strong>
              <span>{item.participant_id ? "verknüpft" : item.status === "free" ? "frei" : item.status}</span>
              <small>{getBundesligaInviteUrl(item.code)}</small>
              <button
                type="button"
                className="danger-button code-delete"
                onClick={() => onDeleteInviteCode(item.id, item.code)}
                disabled={item.status !== "free" || Boolean(item.participant_id)}
                title={item.status === "free" && !item.participant_id ? "Bundesliga-Code löschen" : "Nur freie Bundesliga-Codes können gelöscht werden"}
              >
                Code löschen
              </button>
            </div>
          ))}
          {inviteCodes.length === 0 && <p>Noch keine Bundesliga-Codes erzeugt.</p>}
        </div>
      </section>
    );
  }

  function renderBonusResults() {
    if (preseasonWaiting) {
      return (
        <section className="bundesliga-dark-panel bundesliga-view-panel is-waiting">
          <header>
            <h3>Offizielle Bonus-Ergebnisse</h3>
            <span>wartet auf Teams</span>
          </header>
          <p>Meister, Torschützenkönig und Absteiger können gepflegt werden, sobald die Teams der Saison 2026/2027 importiert sind.</p>
        </section>
      );
    }
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Offizielle Bonus-Ergebnisse</h3>
          <button type="button" onClick={saveOfficialBonusResults}>Bonus-Ergebnisse speichern</button>
        </header>
        <div className="bundesliga-bonus-result-editor">
          <label>
            Meister
            <select value={bonusResultDraft.championTeamId} onChange={(event) => setBonusResultDraft((current) => ({ ...current, championTeamId: event.target.value }))}>
              <option value="">offen</option>
              {data?.teams?.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <section>
            <h4>Torschützenkönige</h4>
            <div className="bundesliga-choice-grid compact">
              {topScorerRows.filter((row) => row.id).slice(0, 20).map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={bonusResultDraft.topScorers.includes(row.name) ? "selected" : ""}
                  onClick={() => setBonusResultDraft((current) => ({ ...current, topScorers: toggleId(current.topScorers, row.name, 10) }))}
                >
                  <strong>{row.name}</strong>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h4>Absteiger</h4>
            <div className="bundesliga-choice-grid compact">
              {data?.teams?.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  className={bonusResultDraft.relegatedTeamIds.includes(team.id) ? "selected" : ""}
                  onClick={() => setBonusResultDraft((current) => ({ ...current, relegatedTeamIds: toggleId(current.relegatedTeamIds, team.id, 3) }))}
                >
                  <BundesligaLogo src={team.logo_url} name={team.name} />
                  <strong>{team.name}</strong>
                </button>
              ))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  function renderRules() {
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Bundesliga Regeln</h3>
          <span>Release-v1 Punktelogik</span>
        </header>
        <div className="bundesliga-rule-grid">
          {bundesligaRuleRows.map(([label, value]) => (
            <div key={label}>
              <strong>{label}</strong>
              <b>{value}</b>
            </div>
          ))}
        </div>
      </section>
    );
  }

  function renderReleaseControl() {
    return (
      <section className="bundesliga-dark-panel bundesliga-release-control">
        <header>
          <h3>Öffentliche Freigabe</h3>
          <span className={data?.competition?.public_enabled ? "is-public" : ""}>
            {data?.competition?.public_enabled ? "Öffentlich" : "Versteckt"}
          </span>
        </header>
        <p>
          {data?.competition?.public_enabled
            ? "Die Bundesliga-Teilnehmeransicht ist öffentlich erreichbar."
            : "Die Teilnehmeransicht bleibt verborgen, bis alle Release-Voraussetzungen erfüllt und bewusst freigegeben sind."}
        </p>
        {!data?.competition?.public_enabled && criticalReleaseChecks.length > 0 && (
          <div className="bundesliga-release-blockers">
            <strong>Noch offen</strong>
            {criticalReleaseChecks.slice(0, 4).map((item) => <span key={item.label}>{item.label}</span>)}
          </div>
        )}
        <div className="bundesliga-status-editor">
          <button type="button" onClick={() => onSetCompetitionStatus("admin_test", false)}>Versteckt lassen</button>
          {!data?.competition?.public_enabled && (
            <button type="button" className="primary-action" onClick={() => onSetCompetitionStatus("public", true)} disabled={loading || !releaseReady}>
              Öffentlich freigeben
            </button>
          )}
        </div>
      </section>
    );
  }

  function renderDangerZone() {
    return (
      <section className="bundesliga-dark-panel bundesliga-danger-zone">
        <header>
          <h3>Gefahrenbereich</h3>
          <span>Bestätigung erforderlich</span>
        </header>
        <p>Diese Werkzeuge löschen oder verändern Prüf- und Saisondaten. Sie gehören nicht zum normalen Tagesbetrieb.</p>
        <div className="bundesliga-danger-actions">
          <article>
            <strong>Ergebnisdaten zurücksetzen</strong>
            <small>Entfernt importierte Ergebnisse; ausgewertete Spieltage werden wieder offen.</small>
            <button type="button" className="danger-button" onClick={onResetResults} disabled={loading || resultCount === 0}>Ergebnisse zurücksetzen</button>
          </article>
          <article>
            <strong>Release-Testdaten bereinigen</strong>
            <small>Entfernt nur Release-Testteilnehmer samt Tipps, Bonus und Codes.</small>
            <button type="button" className="danger-button" onClick={resetReleaseProbe} disabled={loading}>Release-Testdaten löschen</button>
          </article>
          <article>
            <strong>Diagnosedaten bereinigen</strong>
            <small>Entfernt Demo-, Ergebnis- und Goal-Event-Daten; echte Zugänge bleiben erhalten.</small>
            <button type="button" className="danger-button" onClick={resetTestlabData} disabled={loading}>Diagnose-Daten löschen</button>
          </article>
          <article>
            <strong>Saisongrundlage entfernen</strong>
            <small>Entfernt Spielplan, Teams, Logos, Ergebnisse, Tore und Torschützen für 2026/2027.</small>
            <button type="button" className="danger-button" onClick={onResetSeasonFoundation} disabled={loading}>26/27-Grunddaten löschen</button>
          </article>
        </div>
        {participants.length > 0 && (
          <div className="bundesliga-danger-participants">
            <strong>Einzelne Teilnehmer löschen</strong>
            {participants.map((participant) => (
              <div key={participant.id}>
                <span>{participant.display_name}</span>
                <button type="button" className="danger-button" onClick={() => onDeleteParticipant(participant.id, participant.display_name)} disabled={loading}>Teilnehmer löschen</button>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  function renderTopScorers({ compact = false, allowImport = true } = {}) {
    return (
      <section className={`bundesliga-dark-panel${compact ? "" : " bundesliga-view-panel"}`}>
        <header>
          <h3>Torschützen - Top {compact ? 5 : 20}</h3>
          {!compact && allowImport && <button type="button" onClick={onImportTopScorers} disabled={loading}>OpenLigaDB importieren</button>}
        </header>
        <div className={compact ? "bundesliga-scorer-board" : "bundesliga-scorer-editor"}>
          {topScorerRows.slice(0, compact ? 5 : 20).map((row, index) => {
            const draft = scorerDraftFor(row);
            if (!compact && !row.id) {
              return (
                <div key={row.name}>
                  <span>{index + 1}</span>
                  <strong>{row.name}</strong>
                  <strong>{row.goals} Tore</strong>
                  <small>Fallback aus Match-Toren</small>
                </div>
              );
            }
            return compact ? (
              <div key={row.id ?? row.name}>
                <span>{index + 1}</span>
                <strong>{row.name}</strong>
                <b>{row.goals} Tore</b>
              </div>
            ) : (
              <div key={row.id ?? row.name}>
                <span>{index + 1}</span>
                <label>
                  Name
                  <input
                    value={draft.displayName}
                    onChange={(event) => updateScorerDraft(row, { displayName: event.target.value })}
                  />
                </label>
                <label>
                  Team
                  <input
                    value={draft.teamName}
                    onChange={(event) => updateScorerDraft(row, { teamName: event.target.value })}
                    placeholder="optional"
                  />
                </label>
                <strong>{row.goals} Tore</strong>
                <small>{row.manualOverride ? "manuell korrigiert" : row.sourceName || "OpenLigaDB"}</small>
                <button type="button" onClick={() => saveScorer(row)} disabled={loading || draft.displayName.trim().length < 2}>
                  Speichern
                </button>
              </div>
            );
          })}
          {topScorerRows.length === 0 && <p>Noch keine Torschützen importiert.</p>}
        </div>
      </section>
    );
  }

  function renderRanking() {
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Ranglisten</h3>
          <span>{participantRankingRows.length} Teilnehmer · {rankingRows.length} Test-Tipper</span>
        </header>
        <h4>Echte Teilnehmer</h4>
        <div className="bundesliga-ranking-table-scroll">
          <table className="bundesliga-ranking-table">
            <thead>
              <tr>
                <th>Pl.</th>
                <th>Name</th>
                <th>Punkte</th>
                <th>Siege</th>
                <th>Spielpunkte</th>
                <th>Bonus</th>
                <th>Tipps</th>
                <th>Schnitt</th>
              </tr>
            </thead>
            <tbody>
              {participantRankingRows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.points}</td>
                  <td>{row.matchdayWins ?? 0}</td>
                  <td>{row.matchPoints}</td>
                  <td>{row.bonusPoints}</td>
                  <td>{row.tipCount}</td>
                  <td>{row.averagePoints.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {participantRankingRows.length === 0 && <p>Noch keine echte Bundesliga-Rangliste vorhanden.</p>}
        </div>
        <h4>Demo-Rangliste</h4>
        <div className="bundesliga-ranking-table-scroll">
          <table className="bundesliga-ranking-table">
            <thead>
              <tr>
                <th>Pl.</th>
                <th>Name</th>
                <th>Punkte</th>
                <th>Siege</th>
                <th>Spielpunkte</th>
                <th>gewertet</th>
                <th>Tipps</th>
                <th>Schnitt</th>
              </tr>
            </thead>
            <tbody>
              {rankingRows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.points}</td>
                  <td>{row.matchdayWins ?? 0}</td>
                  <td>{row.matchPoints}</td>
                  <td>{row.scoredTipCount}</td>
                  <td>{row.tipCount}</td>
                  <td>{row.averagePoints.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rankingRows.length === 0 && <p>Noch keine Demo-Rangliste vorhanden.</p>}
        </div>
      </section>
    );
  }

  function renderSchedule() {
    return (
      <section className="bundesliga-dark-panel bundesliga-view-panel">
        <header>
          <h3>Bundesliga Spielplan</h3>
          <span>{leagueMatches.length} Liga-Spiele</span>
        </header>
        <div className="bundesliga-schedule-list">
          {leagueMatches.slice(0, 90).map((match) => (
            <div key={match.id}>
              <small>ST {match.matchday}</small>
              <span>{formatDateTime(match.kickoff_at)}</span>
              <strong>{match.team_a_name}</strong>
              <b>{match.result ? `${match.result.score_a}:${match.result.score_b}` : "-:-"}</b>
              <strong>{match.team_b_name}</strong>
            </div>
          ))}
          {leagueMatches.length === 0 && <p>Noch kein Spielplan importiert.</p>}
        </div>
      </section>
    );
  }

  function renderOperationsQueue() {
    return (
      <section className="bundesliga-dark-panel bundesliga-operations-queue">
        <header>
          <h3>Operations-Queue</h3>
          <span>{operationQueue.filter((item) => item.severity !== "ok").length} offen</span>
        </header>
        <div>
          {operationQueue.map((item) => (
            <article key={item.label} className={item.severity}>
              <span>{item.severity === "ok" ? "erledigt" : item.severity === "pending" ? "wartet" : "offen"}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </div>
              <button type="button" onClick={item.action}>{item.actionLabel}</button>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderKpis() {
    return (
      <section className="bundesliga-admin-kpis" aria-label="Bundesliga Admin Kennzahlen">
        {kpiRows.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </article>
        ))}
      </section>
    );
  }

  function renderOverview() {
    return (
      <div className="bundesliga-admin-overview">
        <div className="bundesliga-admin-guidance">
          <main>
            <section className={`bundesliga-admin-season-lead ${preseasonWaiting ? "is-waiting" : ""}`}>
              <small>{preseasonWaiting ? "Vorsaison" : "Aktueller Betrieb"}</small>
              <h3>{preseasonWaiting ? "Saison wird vorbereitet" : "Spielbetrieb im Blick"}</h3>
              <strong>{preseasonWaiting ? "Warten auf offiziellen Spielplan 2026/2027" : operationQueue[0]?.label}</strong>
              <p>{preseasonWaiting
                ? "Zugänge können bereits vorbereitet werden. Spielplan, Ergebnisarbeit und Releaseprüfung beginnen mit den offiziellen OpenLigaDB-Daten."
                : "Bearbeite die offenen Aufgaben und kontrolliere anschließend die Release-Voraussetzungen."}</p>
              <button type="button" onClick={() => setActiveAdminView(preseasonWaiting ? "import" : operationQueue[0]?.severity === "ok" ? "diagnostics" : "results")}>
                {preseasonWaiting ? "Spielplan-Verfügbarkeit prüfen" : "Nächste Aufgabe öffnen"}
              </button>
            </section>
            <section className="bundesliga-admin-prepared">
              <header>
                <h3>Bereits vorbereitet</h3>
                <span>für 2026/2027</span>
              </header>
              <div>
                <article><strong>{participants.length}</strong><span>Teilnehmer</span></article>
                <article><strong>{inviteCodes.length}</strong><span>Einladungscodes</span></article>
              </div>
              <footer>
                <button type="button" onClick={() => setActiveAdminView("participants")}>Teilnehmer verwalten</button>
                <button type="button" onClick={() => setActiveAdminView("codes")}>Code erzeugen</button>
              </footer>
            </section>
          </main>
          <section className="bundesliga-admin-next-steps">
            <header>
              <h3>Nächste Schritte</h3>
            </header>
            <ol>
              {nextAdminSteps.map((item) => (
                <li key={item.label} className={item.status}>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </li>
              ))}
            </ol>
          </section>
        </div>
        {preseasonWaiting && (
          <section className="bundesliga-admin-preseason-banner" aria-label="Vorsaisonstatus">
            <div>
              <strong>Kein Fehler: Die Saisonquelle ist noch nicht verfügbar.</strong>
              <p>Diese Übersicht bleibt ruhig, bis OpenLigaDB den offiziellen Spielplan für bl1/2026 bereitstellt.</p>
            </div>
          </section>
        )}
        {renderKpis()}
        {renderOperationsQueue()}
      </div>
    );
  }

  function renderDataImport() {
    return (
      <div className="bundesliga-release-grid">
        <section className="bundesliga-dark-panel bundesliga-import-panel">
          <header>
            <h3>Datenimport</h3>
            <span>OpenLigaDB · bl1/2026</span>
          </header>
          {leagueMatches.length === 0 && (
            <p className="bundesliga-lab-message">
              Spielplan für 2026/27 noch nicht verfügbar. Die Live-Freigabe bleibt bis zum echten Import gesperrt.
            </p>
          )}
          <div className="bundesliga-command-grid">
            <button type="button" onClick={() => onImport(includeRelegation)} disabled={loading}>
              <Download size={23} />
              <span><strong>{preseasonWaiting ? "Spielplan-Verfügbarkeit prüfen" : "Spielplan importieren"}</strong><small>Teams, Spielplan, Logos, Tore</small></span>
            </button>
            <button type="button" onClick={onImportTopScorers} disabled={loading}>
              <Goal size={23} />
              <span><strong>Torschützen aktualisieren</strong><small>OpenLigaDB Goalgetters</small></span>
            </button>
          </div>
          <div className="bundesliga-admin-inline-controls">
            <label>
              <input
                type="checkbox"
                checked={includeRelegation}
                onChange={(event) => setIncludeRelegation(event.target.checked)}
              />
              Relegation beim Spielplanimport mitladen
            </label>
            <button type="button" onClick={onRefresh} disabled={loading}>Daten aktualisieren</button>
          </div>
        </section>
        {renderTopScorers()}
        {renderTeamLogoQuality()}
      </div>
    );
  }

  function renderBonusAdmin() {
    return (
      <div className="bundesliga-release-grid">
        {renderBonusResults()}
        {renderTopScorers({ allowImport: false })}
        {renderRules()}
      </div>
    );
  }

  function renderDiagnostics() {
    return (
      <div className="bundesliga-release-grid">
        {renderReleaseChecklist()}
        {renderReleaseControl()}
        {renderReleaseSettings()}
        {renderReleaseProbe()}
        <section className="bundesliga-dark-panel bundesliga-live-update-control">
          <header>
            <h3>Live-Aktualisierung</h3>
            <span>{data?.competition?.live_updates_paused ? "pausiert" : "aktiv"}</span>
          </header>
          <p>Automatische Zwischenstände und Torereignisse für importierte Liga- und Relegationsspiele der Saison 2026/2027.</p>
          <div className="bundesliga-live-update-actions">
            <button type="button" onClick={onRefreshLiveNow} disabled={loading}>Jetzt aktualisieren</button>
            <button type="button" onClick={() => onSetLiveUpdatesPaused(!data?.competition?.live_updates_paused)} disabled={loading}>
              {data?.competition?.live_updates_paused ? "Live-Aktualisierung fortsetzen" : "Live-Aktualisierung pausieren"}
            </button>
          </div>
        </section>
        {renderLiveSourceCheck()}
        {renderTeamLogoQuality()}
        {renderQualityCheck()}
        <section className="bundesliga-dark-panel">
          <header>
            <h3>Demo-Daten</h3>
            <span>{data?.demoParticipants?.length ?? 0} Demo-Tipper</span>
          </header>
          <div className="bundesliga-command-grid">
            <button type="button" onClick={onGenerateDemoTips} disabled={loading || leagueMatches.length === 0}>
              <UsersRound size={23} />
              <span><strong>Demo-Tipps füllen</strong><small>alle Spiele für Demo-Tipper</small></span>
            </button>
          </div>
          <section className="bundesliga-demo-create">
            <label>
              Demo-Tipper
              <input
                value={demoName}
                onChange={(event) => setDemoName(event.target.value)}
                placeholder="Name des Test-Tippers"
              />
            </label>
            <button type="button" onClick={createDemoParticipant} disabled={loading || demoName.trim().length < 2}>
              Speichern
            </button>
          </section>
        </section>
        {renderDangerZone()}
      </div>
    );
  }

  function renderLiveSourceCheck() {
    const sourceStatusLabels = {
      nicht_konfiguriert: "nicht konfiguriert",
      stimmt_ueberein: "stimmt überein",
      fallback_aktiv: "Fallback aktiv",
      abweichend: "abweichend",
      wartet: "wartet auf Bestätigung",
    };
    const checks = data?.liveSources?.checks ?? [];
    const configured = Boolean(data?.liveSources?.footballDataConfigured);
    return (
      <section className="bundesliga-dark-panel bundesliga-live-source-check">
        <header>
          <div>
            <h3>Live-Quellenprüfung</h3>
            <p>OpenLigaDB bleibt Hauptquelle; football-data füllt nur fehlende laufende Zwischenstände.</p>
          </div>
          <span className={configured ? "is-active" : ""}>{configured ? "Vergleich aktiv" : "nicht konfiguriert"}</span>
        </header>
        {!configured && <p className="bundesliga-source-empty">Football-data Vergleich nicht konfiguriert. OpenLigaDB arbeitet unverändert allein.</p>}
        {configured && checks.length === 0 && <p className="bundesliga-source-empty">Noch keine Live-Beobachtungen für Saisonspiele gespeichert.</p>}
        {checks.length > 0 && (
          <div className="bundesliga-source-rows">
            {checks.map((check) => (
              <article key={check.matchId} className={`status-${check.status}`}>
                <strong>{check.label}</strong>
                <span>OpenLigaDB: {check.openligadb ? `${check.openligadb.score_a}:${check.openligadb.score_b} · ${check.openligadb.status}` : "kein Stand"}</span>
                <span>football-data: {check.footballData ? `${check.footballData.score_a}:${check.footballData.score_b} · ${check.footballData.status}` : "kein Stand"}</span>
                <b>{sourceStatusLabels[check.status] ?? check.status}</b>
              </article>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="bundesliga-admin-setup">
      <aside className="bundesliga-lab-rail">
        <div className="bundesliga-mark">
          <BundesligaBrandLogo decorative variant="icon" />
          <strong>Admin</strong>
        </div>
        {adminNavGroups.map((group) => (
          <nav key={group.label} className="bundesliga-admin-nav-group" aria-label={group.label}>
            <span>{group.label}</span>
            {group.items.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={activeAdminView === id ? "active" : ""}
                onClick={() => setActiveAdminView(id)}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
        ))}
        <div className="bundesliga-rail-meta">
          <small>Wettbewerb</small>
          <strong>Bundesliga</strong>
          <span>2026/2027</span>
          <small>Status</small>
          <b>{data?.competition?.public_enabled ? "öffentlich" : "versteckt"}</b>
          <em>OpenLigaDB · bl1/2026</em>
        </div>
      </aside>

      <div className="bundesliga-lab-main">
        <label className="bundesliga-admin-mobile-nav">
          Bereich
          <select value={activeAdminView} onChange={(event) => setActiveAdminView(event.target.value)}>
            {adminNavGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <header className="bundesliga-lab-header">
          <div>
            <h2>Bundesliga Admin</h2>
          <p>Saison 2026/2027 · {data?.competition?.public_enabled ? "Öffentlich" : "Versteckt"}</p>
          </div>
          <span>Status: <strong>{data?.competition?.public_enabled ? "Öffentlich" : "Versteckt"}</strong></span>
          <button type="button" onClick={onBackToWorldCup}>Zur WM-2026 Version</button>
        </header>

        <section className="bundesliga-lab-stats bundesliga-admin-utility" aria-label="Admin-Schnellzugriff">
          <span><strong>2026/2027 aktiv</strong> Zugänge vorbereiten</span>
          <button type="button" onClick={onRefresh} disabled={loading}>Aktualisieren</button>
          <button type="button" onClick={() => openBundesligaPreview(BUNDESLIGA_ARCHIVE_COMPETITION_ID)}>Archivvorschau 25/26 öffnen</button>
          <button type="button" onClick={() => openBundesligaPreview(BUNDESLIGA_DEFAULT_COMPETITION_ID)}>Teilnehmeransicht 26/27 öffnen</button>
        </section>

        {message && <p className="bundesliga-lab-message">{message}</p>}
        {activeAdminView === "diagnostics" && !preseasonWaiting && dataQuality.topScorerSource === "match_goals_fallback" && (
          <p className="bundesliga-lab-message">
            Torschützen laufen noch im Fallback aus Match-Toren. Bitte OpenLigaDB-Torschützen importieren.
          </p>
        )}
        {activeAdminView === "diagnostics" && !preseasonWaiting && dataQuality.incompleteTopScorers > 0 && (
          <p className="bundesliga-lab-message">
            {dataQuality.incompleteTopScorers} Torschützen wirken abgekürzt oder unvollständig und können unten korrigiert werden.
          </p>
        )}
        {activeAdminView === "diagnostics" && normalizedLogoCount > 0 && (
          <p className="bundesliga-lab-message">
            {normalizedLogoCount} Team-Logo-URL{normalizedLogoCount === 1 ? "" : "s"} wurden für die Anzeige automatisch auf robuste Wikimedia-Größen korrigiert.
          </p>
        )}
        {activeAdminView === "diagnostics" && logoIssueCount > 0 && (
          <p className="bundesliga-lab-message">
            {logoIssueCount} Team-Logo{logoIssueCount === 1 ? "" : "s"} fehlen noch. In der App wird solange ein Kürzel angezeigt.
          </p>
        )}

        {activeAdminView === "overview" && renderOverview()}
        {activeAdminView === "participants" && (
          <div className="bundesliga-release-grid">
            {renderParticipants()}
            {renderParticipantEvaluation()}
          </div>
        )}
        {activeAdminView === "codes" && renderCodes()}
        {activeAdminView === "schedule" && (
          <div className="bundesliga-release-grid">
            {renderSchedule()}
            {renderStandingsTable()}
          </div>
        )}
        {activeAdminView === "results" && (
          <div className="bundesliga-release-grid">
            {renderResultsWorkflow()}
            {renderResultsPanel()}
            {renderParticipantEvaluation()}
            {renderTipEvaluation()}
          </div>
        )}
        {activeAdminView === "bonus" && renderBonusAdmin()}
        {activeAdminView === "ranking" && renderRanking()}
        {activeAdminView === "import" && renderDataImport()}
        {activeAdminView === "diagnostics" && renderDiagnostics()}
      </div>
    </section>
  );
}
