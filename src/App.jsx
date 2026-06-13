import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  Download,
  Goal,
  House,
  Info,
  ListFilter,
  LogOut,
  Medal,
  QrCode,
  Search,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  apiGet,
  apiPost,
  getAdminSession,
  loadDbMatches,
  loadResults,
  readApiPayload,
  signInAdmin,
  signOutAdmin,
} from "./api.js";
import {
  knockoutPreview,
  matches as bundledMatches,
  scheduleSource,
} from "./data.js";
import KnockoutSimulator from "./KnockoutSimulator.jsx";
import { displayTeamName } from "./teamNames.js";
import {
  chunkArray,
  clampScore,
  formatDate,
  formatDateTime,
  formatNumericDate,
  getGroupDeadline,
  getTournamentDeadline,
  isDeadlinePassed,
  isLockedForUsers,
} from "./lib/format.js";
import {
  areBonusTipsEqual,
  bonusPointsFor,
  getGroupLeaderSuggestions,
  isCompleteTip,
  normalizeText,
  pointsFor,
} from "./lib/scoring.js";
import { AUTO_SAVE_DELAY_MS } from "./lib/constants.js";
import { QrCodeImage, ScoreControl, createQrCodeDataUrl } from "./components/shared.jsx";
import { createInitialTips } from "./lib/tips.js";
import { findPlayerByText, normalizePlayerName, playerLabel } from "./lib/players.js";
import { PlayerSelect, RankingPanel } from "./components/wm.jsx";
import {
  BundesligaAdminArea,
  BundesligaParticipantApp,
  isBundesligaRoute,
} from "./bundesliga.jsx";

const STORAGE_KEY = "wm-tippspiel-participant";
const ANDROID_APK_URL = "/downloads/wmtippspiel-latest.apk";

function getInviteUrl(code) {
  const url = new URL(window.location.origin);
  url.searchParams.set("code", code);
  url.hash = "start";
  return url.toString();
}
const tabs = [
  { id: "start", label: "Start", icon: House },
  { id: "tippen", label: "Tippen", icon: Goal },
  { id: "rangliste", label: "Rangliste", icon: Trophy },
  { id: "simulation", label: "Simulation", icon: Trophy },
  { id: "info", label: "Info", icon: Info },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];
const tabIds = new Set(tabs.map((tab) => tab.id));
const groupFilters = ["alle", "deutschland", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const codeStatusLabels = {
  free: "frei",
  claimed: "vergeben",
  disabled: "ungültig",
};
const TEST_PARTICIPANT = {
  id: "test-participant",
  name: "Testkind",
  code: "TEST-MODUS",
};
const TEST_EXPECTED = {
  matchPoints: 11,
  bonusPoints: 22,
  totalPoints: 33,
  scoredTipCount: 5,
  savedTipCount: 8,
  averagePoints: 2.2,
};
const TEST_RANKING_ROWS = [
  {
    name: "Agapi",
    points: 20,
    matchPoints: 14,
    bonusPoints: 6,
    tipCount: 8,
    scoredTipCount: 5,
    averagePoints: 2.8,
  },
  {
    name: "Clemens",
    points: 12,
    matchPoints: 10,
    bonusPoints: 2,
    tipCount: 4,
    scoredTipCount: 3,
    averagePoints: 10 / 3,
  },
];
const TEST_SCENARIOS = [
  { label: "Exaktes Ergebnis", tipA: 2, tipB: 1, resultA: 2, resultB: 1, points: 4 },
  { label: "Tendenz + Tordifferenz", tipA: 2, tipB: 1, resultA: 3, resultB: 2, points: 3 },
  { label: "Richtige Tendenz", tipA: 1, tipB: 0, resultA: 2, resultB: 0, points: 2 },
  { label: "Falsche Tendenz", tipA: 0, tipB: 1, resultA: 2, resultB: 0, points: 0 },
  { label: "Remis-Tendenz", tipA: 1, tipB: 1, resultA: 2, resultB: 2, points: 2 },
];
const TEST_TREND_ROWS = [
  { score_a: 2, score_b: 1 },
  { score_a: 2, score_b: 1 },
  { score_a: 1, score_b: 0 },
  { score_a: 1, score_b: 1 },
  { score_a: 0, score_b: 2 },
];
const competitions = {
  wm2026: {
    id: "wm-2026",
    name: "WM 2026",
    adminLabel: "WM-Verwaltung",
    publicEnabled: true,
  },
  bundesliga: {
    id: "bundesliga",
    name: "Bundesliga",
    adminLabel: "Bundesliga-Version",
    publicEnabled: false,
  },
};
const tipSaveStatusLabels = {
  pending: "Wird gleich gespeichert...",
  saving: "Wird gespeichert...",
  saved: "Tipp gespeichert",
  error: "Speichern fehlgeschlagen",
};


function getIsTestMode() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("test") === "1" || params.get("mode") === "test";
  return import.meta.env.DEV && requested;
}

function getInitialCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code")?.trim() || "";
}

function getTabFromHash() {
  const tabId = window.location.hash.replace("#", "").trim();
  return tabIds.has(tabId) ? tabId : "start";
}



function loadSavedParticipant() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}





function mapDbMatch(row) {
  const teamA = displayTeamName(row.team_a);
  const teamB = displayTeamName(row.team_b);

  const isKo = KO_PHASES.includes(row.phase);

  return {
    id: row.id,
    matchNumber: row.match_number,
    phase: row.phase,
    group: row.group_key ? `Gruppe ${row.group_key}` : (isKo ? "K.o.-Phase" : ""),
    groupKey: row.group_key,
    date: row.match_date,
    time: row.match_time,
    kickoffAt: row.kickoff_at,
    teamA,
    teamB,
    flagCodeA: row.flag_code_a,
    flagCodeB: row.flag_code_b,
    venue: row.venue,
    city: row.city,
    status: row.status,
    teamKeyA: row.team_a,
    teamKeyB: row.team_b,
  };
}


function getGroups(matches) {
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

function getTeamMeta(matches) {
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

function getTeamOptions(matches) {
  return Array.from(getTeamMeta(matches).values())
    .sort((first, second) => first.name.localeCompare(second.name, "de"));
}

function getGroupFilterLabel(filter) {
  if (filter === "alle") return "Alle";
  if (filter === "deutschland") return "Deutschland";
  return `Gr. ${filter}`;
}

// Gruppenphase vs. K.o.-Phase. Spiele ohne phase gelten als Gruppenspiele,
// damit der gebundelte Fallback-Spielplan (ohne KO) unveraendert bleibt.
const KO_PHASES = ["r32", "r16", "quarter", "semi", "third", "final"];

function isGroupPhase(match) {
  return !match?.phase || match.phase === "group";
}

function isKnockoutPhase(match) {
  return KO_PHASES.includes(match?.phase);
}

const KO_PHASE_LABELS = {
  r32: "Sechzehntelfinale",
  r16: "Achtelfinale",
  quarter: "Viertelfinale",
  semi: "Halbfinale",
  third: "Spiel um Platz 3",
  final: "Finale",
};


function createInitialBonusTips(matches, savedBonusTip = null, players = []) {
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

function createTestTips(matches) {
  const tips = createInitialTips(matches);
  TEST_SCENARIOS.forEach((scenario, index) => {
    const match = matches[index];
    if (!match) return;
    tips[match.id] = {
      scoreA: scenario.tipA,
      scoreB: scenario.tipB,
      saved: true,
    };
  });
  matches.slice(TEST_SCENARIOS.length, TEST_EXPECTED.savedTipCount).forEach((match, index) => {
    tips[match.id] = {
      scoreA: index % 3,
      scoreB: 0,
      saved: true,
    };
  });
  return tips;
}

function buildTipTrend(rows) {
  const total = rows.length;
  const trend = {
    total,
    homeWin: 0,
    draw: 0,
    awayWin: 0,
    homeWinPercent: 0,
    drawPercent: 0,
    awayWinPercent: 0,
  };

  if (total === 0) return trend;

  rows.forEach((row) => {
    const scoreA = Number(row.score_a);
    const scoreB = Number(row.score_b);
    if (scoreA > scoreB) trend.homeWin += 1;
    if (scoreA === scoreB) trend.draw += 1;
    if (scoreA < scoreB) trend.awayWin += 1;
  });

  trend.homeWinPercent = Math.round((trend.homeWin / total) * 100);
  trend.drawPercent = Math.round((trend.draw / total) * 100);
  trend.awayWinPercent = Math.max(0, 100 - trend.homeWinPercent - trend.drawPercent);

  return trend;
}

function createTestTipTrends(matches) {
  const trends = {};
  matches.slice(0, 4).forEach((match, index) => {
    const rows = TEST_TREND_ROWS.map((row, rowIndex) => ({
      score_a: (row.score_a + index + rowIndex) % 4,
      score_b: row.score_b,
    }));
    trends[match.id] = buildTipTrend(rows);
  });
  return trends;
}

function createTestResults(matches) {
  return TEST_SCENARIOS.map((scenario, index) => {
    const match = matches[index];
    if (!match) return null;
    return {
      match_id: match.id,
      score_a: scenario.resultA,
      score_b: scenario.resultB,
      status: "final",
      updated_at: new Date().toISOString(),
    };
  }).filter(Boolean);
}

function createTestBonusTips(matches) {
  const bonusTips = createInitialBonusTips(matches);
  const groups = getGroups(matches);
  return {
    ...bonusTips,
    champion: "Deutschland",
    topScorer: "Jamal Musiala",
    groupWinners: {
      ...bonusTips.groupWinners,
      ...Object.fromEntries(groups.slice(0, 4).map((group) => [group.groupKey, group.teams[0]?.name ?? ""])),
    },
    saved: true,
  };
}

function createTestBonusResults(matches) {
  const bonusResults = createInitialBonusResults(matches);
  const groups = getGroups(matches);
  return {
    ...bonusResults,
    champion: "Deutschland",
    topScorer: "Jamal Musiala",
    groupWinners: {
      ...bonusResults.groupWinners,
      ...Object.fromEntries(groups.slice(0, 4).map((group) => [group.groupKey, group.teams[0]?.name ?? ""])),
    },
  };
}

function createInitialBonusResults(matches, savedBonusResults = null, players = []) {
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

function buildGroupTables(matches, resultsByMatch) {
  return getGroups(matches).map((group) => {
    const table = new Map(
      group.teams.map((team) => [
        team.name,
        { team: team.name, flagCode: team.flagCode, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
      ]),
    );

    matches
      .filter((match) => match.groupKey === group.groupKey)
      .forEach((match) => {
        const result = resultsByMatch.get(match.id);
        if (!result || result.status !== "final") return;

        const teamA = table.get(match.teamA);
        const teamB = table.get(match.teamB);
        if (!teamA || !teamB) return;

        teamA.played += 1;
        teamB.played += 1;
        teamA.goalsFor += result.score_a;
        teamA.goalsAgainst += result.score_b;
        teamB.goalsFor += result.score_b;
        teamB.goalsAgainst += result.score_a;

        if (result.score_a > result.score_b) {
          teamA.won += 1;
          teamA.points += 3;
          teamB.lost += 1;
        } else if (result.score_a < result.score_b) {
          teamB.won += 1;
          teamB.points += 3;
          teamA.lost += 1;
        } else {
          teamA.drawn += 1;
          teamB.drawn += 1;
          teamA.points += 1;
          teamB.points += 1;
        }
      });

    return {
      ...group,
      rows: Array.from(table.values()).sort((first, second) => {
        const goalDiffA = first.goalsFor - first.goalsAgainst;
        const goalDiffB = second.goalsFor - second.goalsAgainst;
        return (
          second.points - first.points ||
          goalDiffB - goalDiffA ||
          second.goalsFor - first.goalsFor ||
          first.team.localeCompare(second.team, "de")
        );
      }),
    };
  });
}


export default function App() {
  const isTestMode = useMemo(() => getIsTestMode(), []);
  const [showBundesligaApp, setShowBundesligaApp] = useState(isBundesligaRoute);
  const [scannedCode, setScannedCode] = useState(() => (isTestMode ? TEST_PARTICIPANT.code : getInitialCode()));
  const savedParticipant = useMemo(() => loadSavedParticipant(), []);
  const [activeTab, setActiveTabState] = useState(getTabFromHash);
  const initialParticipant = isTestMode ? TEST_PARTICIPANT : savedParticipant;
  const [participant, setParticipant] = useState(initialParticipant);
  const [name, setName] = useState(initialParticipant?.name ?? "");
  const [manualCode, setManualCode] = useState("");
  const [matches, setMatches] = useState(bundledMatches);
  const [results, setResults] = useState(() => (isTestMode ? createTestResults(bundledMatches) : []));
  const [tips, setTips] = useState(() => (isTestMode ? createTestTips(bundledMatches) : createInitialTips(bundledMatches)));
  const [bonusTips, setBonusTips] = useState(() => (isTestMode ? createTestBonusTips(bundledMatches) : createInitialBonusTips(bundledMatches)));
  const [bonusResults, setBonusResults] = useState(() => (isTestMode ? createTestBonusResults(bundledMatches) : createInitialBonusResults(bundledMatches)));
  const [players, setPlayers] = useState([]);
  const [bonusMessage, setBonusMessage] = useState("");
  const [bonusSaveStatus, setBonusSaveStatus] = useState("");
  const [ranking, setRanking] = useState(() => (isTestMode ? TEST_RANKING_ROWS : []));
  const [koVisible, setKoVisible] = useState(isTestMode);
  const [tipTrends, setTipTrends] = useState(() => (isTestMode ? createTestTipTrends(bundledMatches) : {}));
  const [lastSavedMatch, setLastSavedMatch] = useState("");
  const [tipSaveStatuses, setTipSaveStatuses] = useState({});
  const [groupFilter, setGroupFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [appStatus, setAppStatus] = useState(isTestMode ? "Testmodus aktiv" : "Spielplan wird geladen...");
  const [codeStatus, setCodeStatus] = useState(isTestMode ? "claimed" : scannedCode ? "checking" : "missing");
  const [adminSession, setAdminSession] = useState(null);
  const [adminData, setAdminData] = useState({ codes: [], participants: [], tips: [], tipCount: 0, bonusTips: [], bonusTipCount: 0, bonusResults: null, results: [], players: [] });
  const [wmTestData, setWmTestData] = useState(null);
  const [wmTestLoading, setWmTestLoading] = useState(false);
  const tipsRef = useRef(tips);
  const bonusTipsRef = useRef(bonusTips);
  const canViewRanking = Boolean(participant);

  useEffect(() => {
    function syncCompetitionRoute() {
      setShowBundesligaApp(isBundesligaRoute());
    }
    window.addEventListener("hashchange", syncCompetitionRoute);
    window.addEventListener("popstate", syncCompetitionRoute);
    return () => {
      window.removeEventListener("hashchange", syncCompetitionRoute);
      window.removeEventListener("popstate", syncCompetitionRoute);
    };
  }, []);

  useEffect(() => {
    tipsRef.current = tips;
  }, [tips]);

  useEffect(() => {
    bonusTipsRef.current = bonusTips;
  }, [bonusTips]);

  const setActiveTab = useCallback((tabId, { replace = false } = {}) => {
    if (isBundesligaRoute()) return;
    if (!tabIds.has(tabId)) return;
    if (tabId === "rangliste" && !canViewRanking) {
      setAppStatus("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
      tabId = "start";
      replace = true;
    }

    setActiveTabState(tabId);
    const nextUrl = `${window.location.pathname}${window.location.search}#${tabId}`;
    if (window.location.hash === `#${tabId}`) return;

    if (replace) {
      window.history.replaceState(null, "", nextUrl);
    } else {
      window.history.pushState(null, "", nextUrl);
    }
  }, [canViewRanking]);

  const activeCode = participant?.code || scannedCode || manualCode.trim();
  const featuredMatch =
    matches.find((match) => match.teamA === "Deutschland" || match.teamB === "Deutschland") ??
    matches[0];
  const resultsByMatch = useMemo(
    () => new Map(results.map((result) => [result.match_id, result])),
    [results],
  );

  const koMatches = useMemo(
    () =>
      matches
        .filter(isKnockoutPhase)
        .sort((first, second) => (first.matchNumber ?? 0) - (second.matchNumber ?? 0)),
    [matches],
  );

  // Spiele, die der aktuelle Nutzer tippen darf: immer Gruppenphase, K.o. nur wenn
  // freigeschaltet oder als Admin. Basis fuer Fortschritts-/Tippzaehler.
  const koTippable = koVisible || Boolean(adminSession);
  const groupMatchCount = useMemo(() => matches.filter(isGroupPhase).length, [matches]);
  const tippableMatches = useMemo(
    () => matches.filter((match) => isGroupPhase(match) || (koTippable && isKnockoutPhase(match))),
    [matches, koTippable],
  );
  const savedTipCount = tippableMatches.filter((match) => tips[match.id]?.saved).length;

  const filteredMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return matches.filter((match) => {
      if (!isGroupPhase(match)) return false;
      const groupMatch =
        groupFilter === "alle" ||
        (groupFilter === "deutschland" &&
          [match.teamA, match.teamB].includes("Deutschland")) ||
        match.groupKey === groupFilter;
      const queryMatch =
        !query ||
        [match.teamA, match.teamB, match.city, match.venue, match.group]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return groupMatch && queryMatch;
    });
  }, [matches, groupFilter, searchTerm]);

  const currentScoredTipCount = Object.entries(tips).filter(([matchId, tip]) => {
    return tip.saved && resultsByMatch.get(matchId)?.status === "final";
  }).length;
  const currentTipCount = Object.values(tips).filter((tip) => tip.saved).length;
  const currentMatchPoints = Object.entries(tips).reduce((sum, [matchId, tip]) => {
    if (!tip.saved) return sum;
    return sum + pointsFor(tip, resultsByMatch.get(matchId));
  }, 0);
  const currentBonusPoints = bonusPointsFor(bonusTips, bonusResults);
  const currentPoints = currentMatchPoints + currentBonusPoints;
  const currentAveragePoints = currentScoredTipCount > 0 ? currentMatchPoints / currentScoredTipCount : 0;

  const displayRanking = useMemo(() => {
    if (!participant) {
      return [...ranking].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
    }
    // Server-Rangliste (buildWmRanking) ist die autoritative Quelle fuer Punkte,
    // da sie alle Ergebnisse serverseitig auswertet. Lokale Werte greifen nur,
    // solange der Server den eigenen Eintrag noch nicht kennt – so verschwinden
    // Punkte fuer abgelaufene Spiele nicht, wenn die lokalen Ergebnisse fehlen.
    const serverRow = ranking.find((row) => row.name === participant.name);
    const currentRow = {
      name: participant.name,
      points: serverRow?.points ?? currentPoints,
      matchPoints: serverRow?.matchPoints ?? currentMatchPoints,
      bonusPoints: serverRow?.bonusPoints ?? currentBonusPoints,
      tipCount: Math.max(serverRow?.tipCount ?? 0, currentTipCount),
      scoredTipCount: serverRow?.scoredTipCount ?? currentScoredTipCount,
      averagePoints: serverRow?.averagePoints ?? currentAveragePoints,
      matchdayWins: serverRow?.matchdayWins ?? 0,
      isCurrent: true,
    };
    const rows = [...ranking.filter((row) => row.name !== participant.name), currentRow];
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [ranking, participant, currentPoints, currentMatchPoints, currentBonusPoints, currentTipCount, currentScoredTipCount, currentAveragePoints]);
  const teamOptions = useMemo(() => getTeamOptions(matches), [matches]);
  const groupTables = useMemo(() => buildGroupTables(matches, resultsByMatch), [matches, resultsByMatch]);

  useEffect(() => {
    function syncTabFromUrl() {
      const nextTab = getTabFromHash();
      setActiveTab(nextTab, { replace: nextTab === "rangliste" && !canViewRanking });
    }

    window.addEventListener("hashchange", syncTabFromUrl);
    window.addEventListener("popstate", syncTabFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncTabFromUrl);
      window.removeEventListener("popstate", syncTabFromUrl);
    };
  }, [canViewRanking, setActiveTab]);

  useEffect(() => {
    if (activeTab === "rangliste" && !canViewRanking) {
      setActiveTab("start", { replace: true });
    }
  }, [activeTab, canViewRanking, setActiveTab]);

  useEffect(() => {
    if (activeTab === "simulation" && !isTestMode && !adminSession) {
      setActiveTab("start", { replace: true });
    }
  }, [activeTab, isTestMode, adminSession, setActiveTab]);

  useEffect(() => {
    if (activeTab === "rangliste" && canViewRanking) {
      void refreshRanking();
      void refreshResults();
    }
  }, [activeTab, canViewRanking]);

  // Neue Ergebnisse einsammeln, sobald der Teilnehmer zur App zurueckkehrt oder
  // sie laengere Zeit offen laesst. So tauchen frisch eingetragene Ergebnisse und
  // die daraus berechneten Punkte ohne manuellen Reload im Dashboard auf.
  useEffect(() => {
    if (isTestMode || !participant?.id) return undefined;
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      void refreshResults();
      void refreshRanking();
    };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isTestMode, participant?.id, matches, players]);

  useEffect(() => {
    async function bootstrap() {
      if (isTestMode) {
        setMatches(bundledMatches);
        setResults(createTestResults(bundledMatches));
        setTips(createTestTips(bundledMatches));
        setBonusTips(createTestBonusTips(bundledMatches));
        setBonusResults(createTestBonusResults(bundledMatches));
        setRanking(TEST_RANKING_ROWS);
        setTipTrends(createTestTipTrends(bundledMatches));
        setCodeStatus("claimed");
        setAppStatus("Testmodus aktiv");
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(TEST_PARTICIPANT));
        setActiveTab(getTabFromHash(), { replace: true });
        return;
      }

      try {
        // Jeder Aufruf einzeln absichern: schlaegt z. B. bei wackliger
        // Mobilverbindung loadDbMatches/loadResults fehl, darf das nicht den
        // gesamten Start kippen (sonst bleibt matches auf den 72 gebuendelten
        // Gruppenspielen ohne K.o.-Phase haengen).
        const [dbMatches, dbResults, rankPayload, bonusPayload, playerPayload, trendPayload, settingsPayload, session] = await Promise.all([
          loadDbMatches().catch(() => null),
          loadResults().catch(() => null),
          apiGet("/api/ranking").catch(() => ({ ranking: [] })),
          apiGet("/api/bonus-results").catch(() => ({ bonusResults: null })),
          apiGet("/api/players").catch(() => ({ players: [] })),
          apiGet("/api/tip-trends").catch(() => ({ trends: {} })),
          apiGet("/api/settings").catch(() => ({ settings: {} })),
          getAdminSession().catch(() => null),
        ]);

        const loadedMatches = Array.isArray(dbMatches) ? dbMatches : [];
        const nextMatches = loadedMatches.length ? loadedMatches.map(mapDbMatch) : bundledMatches;
        const nextPlayers = playerPayload.players ?? [];
        setMatches(nextMatches);
        if (Array.isArray(dbResults)) setResults(dbResults);
        setPlayers(nextPlayers);
        setRanking(rankPayload.ranking ?? []);
        setTipTrends(trendPayload.trends ?? {});
        setKoVisible(Boolean(settingsPayload.settings?.ko_visible));
        setAdminSession(session);
        setTips(createInitialTips(nextMatches));
        setTipSaveStatuses({});
        setBonusTips(createInitialBonusTips(nextMatches, null, nextPlayers));
        setBonusResults(createInitialBonusResults(nextMatches, bonusPayload.bonusResults, nextPlayers));
        setAppStatus(loadedMatches.length ? "Spielplan bereit" : "Spielplan wird vorbereitet");
      } catch (error) {
        setAppStatus("Spielplan wird vorbereitet");
      }
    }

    bootstrap();
  }, [isTestMode, setActiveTab]);

  // Kam der Spielplan beim Start nicht aus der DB (kurzer Netzfehler auf dem
  // Handy o. ae.), im Hintergrund erneut versuchen, damit nicht dauerhaft nur
  // die gebuendelten Gruppenspiele ohne K.o.-Phase angezeigt werden.
  useEffect(() => {
    if (isTestMode || appStatus !== "Spielplan wird vorbereitet") return undefined;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const dbMatches = await loadDbMatches().catch(() => []);
      if (cancelled || !dbMatches.length) return;
      setMatches(dbMatches.map(mapDbMatch));
      setAppStatus("Spielplan bereit");
    }, 4000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isTestMode, appStatus]);

  useEffect(() => {
    async function resolveParticipant() {
      if (isTestMode) {
        setCodeStatus("claimed");
        return;
      }

      // Wird ein anderer QR-/Anmeldecode gescannt als der aktuell eingeloggte,
      // loggt der alte sich aus und der neue wird aktiv (Geraet-teilen-Fall).
      const incomingScan = scannedCode.trim();
      const isSwitching = Boolean(participant?.id && incomingScan && incomingScan !== participant.code);

      if (participant?.id && !isSwitching) {
        setCodeStatus("claimed");
        return;
      }

      const codeToResolve = isSwitching ? incomingScan : activeCode;
      if (!codeToResolve) {
        setCodeStatus("missing");
        return;
      }

      setCodeStatus("checking");
      try {
        const payload = await apiGet(`/api/participant?code=${encodeURIComponent(codeToResolve)}`);
        setCodeStatus(payload.codeStatus);
        if (payload.participant) {
          const saved = {
            id: payload.participant.id,
            name: payload.participant.display_name,
            code: codeToResolve,
          };
          setParticipant(saved);
          setName(saved.name);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          setActiveTab("start", { replace: true });
        } else if (isSwitching && payload.codeStatus === "free") {
          // Neuer Code ist gueltig, aber noch frei: alten Login beenden und den
          // neuen Code zum Eintragen des Namens anbieten.
          window.localStorage.removeItem(STORAGE_KEY);
          setParticipant(null);
          setName("");
          setActiveTab("start", { replace: true });
        }
        // Unbekannter/ungueltiger neuer Code: bestehenden Login unangetastet lassen.
      } catch {
        setCodeStatus("unknown");
      }
    }

    resolveParticipant();
  }, [activeCode, scannedCode, participant?.id, isTestMode]);

  useEffect(() => {
    async function loadParticipantTips() {
      if (isTestMode) return;
      if (!participant?.id) return;
      try {
        const [tipPayload, bonusPayload] = await Promise.all([
          apiGet(`/api/tips?participantId=${encodeURIComponent(participant.id)}`),
          apiGet(`/api/bonus-tips?participantId=${encodeURIComponent(participant.id)}`).catch(() => ({ bonusTip: null })),
        ]);
        setTips(createInitialTips(matches, tipPayload.tips ?? []));
        setTipSaveStatuses({});
        setBonusTips(createInitialBonusTips(matches, bonusPayload.bonusTip, players));
        // Beim Login auf einem frischen Geraet (z. B. Smartphone) sind Ergebnisse
        // und Rangliste evtl. noch nicht (oder beim Start ueber eine wacklige
        // Mobilverbindung gar nicht) geladen. Ohne diesen Nachzug zeigt das
        // Dashboard "0 Punkte" und keine abgelaufenen/ausgewerteten Spiele, bis
        // der 60-Sekunden-Refresh greift. Darum direkt nach dem Login holen.
        void refreshResults();
        void refreshRanking();
      } catch (error) {
        setAppStatus("Tipps konnten gerade nicht geladen werden");
      }
    }

    loadParticipantTips();
  }, [participant?.id, matches, isTestMode]);

  async function saveParticipant(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !activeCode) return;

    if (isTestMode) {
      const saved = { ...TEST_PARTICIPANT, name: cleanName };
      setParticipant(saved);
      setName(saved.name);
      setCodeStatus("claimed");
      setAppStatus("Testmodus aktiv");
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setActiveTab("start", { replace: true });
      return;
    }

    try {
      const payload = await apiPost("/api/claim-code", {
        code: activeCode,
        name: cleanName,
      });
      const saved = {
        id: payload.participant.id,
        name: payload.participant.display_name,
        code: activeCode,
      };
      setParticipant(saved);
      setName(saved.name);
      setCodeStatus("claimed");
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setActiveTab("start", { replace: true });
    } catch (error) {
      setAppStatus(error.message);
    }
  }

  function resetDevice() {
    if (isTestMode) {
      setScannedCode(TEST_PARTICIPANT.code);
      setParticipant(TEST_PARTICIPANT);
      setName(TEST_PARTICIPANT.name);
      setManualCode("");
      setLastSavedMatch("");
      setTips(createTestTips(matches));
      setTipSaveStatuses({});
      setBonusTips(createTestBonusTips(matches));
      setBonusMessage("");
      setGroupFilter("alle");
      setSearchTerm("");
      setCodeStatus("claimed");
      setAppStatus("Testmodus zurückgesetzt.");
      setActiveTab("start");
      return;
    }

    window.localStorage.removeItem(STORAGE_KEY);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete("code");
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash || "#start"}`);
    setScannedCode("");
    setParticipant(null);
    setName("");
    setManualCode("");
    setLastSavedMatch("");
    setTips(createInitialTips(matches));
    setTipSaveStatuses({});
    setBonusTips(createInitialBonusTips(matches, null, players));
    setBonusMessage("");
    setGroupFilter("alle");
    setSearchTerm("");
    setActiveTab("start");
  }

  function changeScore(matchId, side, delta) {
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
    setTipSaveStatuses((current) => ({
      ...current,
      [matchId]: "pending",
    }));
  }

  function updateBonusTips(updater) {
    setBonusTips((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...next, saved: false };
    });
    setBonusSaveStatus("pending");
    setBonusMessage("Bonus-Tipps werden automatisch gespeichert...");
  }

  async function saveTip(matchId) {
    await saveTipRows([matchId], tipsRef.current);
    setLastSavedMatch(matchId);
  }

  async function saveVisibleTips() {
    await saveTipRows(filteredMatches.map((match) => match.id), tipsRef.current);
    setLastSavedMatch(filteredMatches[0]?.id ?? "");
  }

  async function saveBonusTips(sourceBonusTips = bonusTipsRef.current, { auto = false } = {}) {
    if (!participant?.id) {
      setBonusMessage("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
      return;
    }

    setBonusSaveStatus("saving");
    if (isTestMode) {
      const latestMatchesSubmitted = areBonusTipsEqual(bonusTipsRef.current, sourceBonusTips);
      if (latestMatchesSubmitted) {
        setBonusTips((current) => ({ ...current, saved: true }));
        setBonusSaveStatus("saved");
        setBonusMessage(auto ? "Test-Bonus automatisch gespeichert." : "Test-Bonus gespeichert. Rangliste bleibt lokal berechnet.");
      } else {
        setBonusSaveStatus("pending");
        setBonusMessage("Bonus-Tipps werden automatisch gespeichert...");
      }
      await refreshRanking();
      return;
    }

    try {
      const payload = await apiPost("/api/save-bonus-tips", {
        participantId: participant.id,
        champion: sourceBonusTips.champion,
        topScorer: sourceBonusTips.topScorer,
        topScorerPlayerId: sourceBonusTips.topScorerPlayerId,
        groupWinners: sourceBonusTips.groupWinners,
      });
      const latestMatchesSubmitted = areBonusTipsEqual(bonusTipsRef.current, sourceBonusTips);
      if (latestMatchesSubmitted) {
        setBonusTips(createInitialBonusTips(matches, payload.bonusTip, players));
        setBonusSaveStatus("saved");
        setBonusMessage(auto ? "Bonus-Tipps automatisch gespeichert." : "Bonus-Tipps gespeichert.");
      } else {
        setBonusSaveStatus("pending");
        setBonusMessage("Bonus-Tipps werden automatisch gespeichert...");
      }
      await refreshRanking();
    } catch (error) {
      setBonusSaveStatus("error");
      setBonusMessage(error.message);
    }
  }

  async function refreshRanking() {
    if (isTestMode) {
      setRanking(TEST_RANKING_ROWS);
      return;
    }

    const payload = await apiGet("/api/ranking").catch(() => ({ ranking: [] }));
    setRanking(payload.ranking ?? []);
  }

  // Holt neue Spielergebnisse und Bonus-Auswertungen nach. Ohne diesen Nachzug
  // bleiben die beim Start geladenen `results` haengen, sodass neu eingetragene
  // Ergebnisse (und damit die eigenen Punkte im Dashboard) nie aktualisiert werden.
  async function refreshResults() {
    if (isTestMode) return;
    const [dbResults, bonusPayload] = await Promise.all([
      loadResults().catch(() => null),
      apiGet("/api/bonus-results").catch(() => ({ bonusResults: null })),
    ]);
    if (Array.isArray(dbResults)) setResults(dbResults);
    setBonusResults(createInitialBonusResults(matches, bonusPayload?.bonusResults, players));
  }

  async function refreshTipTrends() {
    if (isTestMode) {
      setTipTrends(createTestTipTrends(matches));
      return;
    }

    const payload = await apiGet("/api/tip-trends").catch(() => ({ trends: {} }));
    setTipTrends(payload.trends ?? {});
  }

  useEffect(() => {
    const pendingIds = Object.entries(tipSaveStatuses)
      .filter(([, status]) => status === "pending")
      .map(([matchId]) => matchId)
      .filter((matchId) =>
        participant?.id &&
        !isLockedForUsers(matches.find((match) => match.id === matchId)) &&
        isCompleteTip(tipsRef.current[matchId])
      );

    if (pendingIds.length === 0) return undefined;

    const timers = pendingIds.map((matchId) =>
      window.setTimeout(() => {
        void saveTipRows([matchId], tipsRef.current);
      }, AUTO_SAVE_DELAY_MS),
    );

    return () => {
      timers.forEach(window.clearTimeout);
    };
  }, [tipSaveStatuses, participant?.id, matches]);

  useEffect(() => {
    if (bonusSaveStatus !== "pending" || !participant?.id) return undefined;

    const timer = window.setTimeout(() => {
      void saveBonusTips(bonusTipsRef.current, { auto: true });
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bonusSaveStatus, participant?.id]);

  async function saveTipRows(matchIds, sourceTips = tipsRef.current) {
    if (!participant?.id) {
      setAppStatus("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
      return;
    }

    const unlockedMatchIds = matchIds.filter((matchId) => {
      const match = matches.find((item) => item.id === matchId);
      return match && !isLockedForUsers(match) && isCompleteTip(sourceTips[matchId]);
    });
    if (unlockedMatchIds.length === 0) {
      setAppStatus("Bitte erst beide Torzahlen auswählen. Neue Tipps starten mit -:-.");
      return;
    }

    const submittedTips = Object.fromEntries(
      unlockedMatchIds.map((matchId) => [matchId, { ...sourceTips[matchId] }]),
    );
    setTipSaveStatuses((current) => ({
      ...current,
      ...Object.fromEntries(unlockedMatchIds.map((matchId) => [matchId, "saving"])),
    }));

    if (isTestMode) {
      setTips((current) => {
        const next = { ...current };
        unlockedMatchIds.forEach((matchId) => {
          next[matchId] = { ...next[matchId], saved: true };
        });
        return next;
      });
      setTipSaveStatuses((current) => ({
        ...current,
        ...Object.fromEntries(unlockedMatchIds.map((matchId) => [matchId, "saved"])),
      }));
      setAppStatus("Test-Tipp gespeichert. Punkte werden lokal neu berechnet.");
      await refreshRanking();
      await refreshTipTrends();
      return;
    }

    try {
      const payload = await apiPost("/api/save-tips", {
        participantId: participant.id,
        tips: unlockedMatchIds.map((matchId) => ({
          matchId,
          scoreA: submittedTips[matchId].scoreA,
          scoreB: submittedTips[matchId].scoreB,
        })),
      });

      const savedIds = new Set((payload.tips ?? []).map((tip) => tip.match_id));
      setTips((current) => {
        const next = { ...current };
        savedIds.forEach((matchId) => {
          const submitted = submittedTips[matchId];
          const latest = current[matchId];
          if (latest?.scoreA === submitted?.scoreA && latest?.scoreB === submitted?.scoreB) {
            next[matchId] = { ...latest, saved: true };
          }
        });
        return next;
      });
      setTipSaveStatuses((current) => {
        const next = { ...current };
        savedIds.forEach((matchId) => {
          const submitted = submittedTips[matchId];
          const latest = tipsRef.current[matchId];
          next[matchId] =
            latest?.scoreA === submitted?.scoreA && latest?.scoreB === submitted?.scoreB
              ? "saved"
              : "pending";
        });
        return next;
      });
      setAppStatus("Tipp gespeichert.");
      await refreshRanking();
      await refreshTipTrends();
    } catch (error) {
      setTipSaveStatuses((current) => ({
        ...current,
        ...Object.fromEntries(unlockedMatchIds.map((matchId) => [matchId, "error"])),
      }));
      setAppStatus(error.message);
    }
  }

  async function refreshAdminData(session = adminSession) {
    if (!session?.access_token) return;
    const payload = await apiGetWithAuth("/api/admin-data", session.access_token);
    setAdminData(payload);
    setPlayers((payload.players ?? []).filter((player) => player.active));
    setBonusResults(createInitialBonusResults(matches, payload.bonusResults, payload.players ?? []));
  }

  async function handleAdminLogin(email, password) {
    const session = await signInAdmin(email, password);
    setAdminSession(session);
    await refreshAdminData(session);
    // Spielplan sicherheitshalber frisch laden: war der Start auf den
    // gebuendelten Fallback (nur Gruppenphase) gefallen, holt der Admin so die
    // vollstaendigen DB-Spiele inkl. K.o.-Phase nach.
    const dbMatches = await loadDbMatches().catch(() => []);
    if (dbMatches.length) setMatches(dbMatches.map(mapDbMatch));
  }

  async function handleAdminLogout() {
    // UI zuerst zuruecksetzen, damit das Abmelden auch bei wackliger
    // Mobilverbindung sofort greift und nicht auf den Netzwerk-Roundtrip von
    // supabase.auth.signOut() wartet (sonst blieb man bis zum Reload "drin").
    setAdminSession(null);
    setAdminData({ codes: [], participants: [], tips: [], tipCount: 0, bonusTips: [], bonusTipCount: 0, bonusResults: null, results: [], players: [] });
    setWmTestData(null);
    try {
      await signOutAdmin();
    } catch {
      // Lokal sind wir bereits abgemeldet; Netzfehler darf den Logout nicht blockieren.
    }
  }

  async function handleCreateCodes(count) {
    const payload = await apiPost("/api/admin-create-codes", { count }, adminSession?.access_token);
    setAdminData((current) => ({
      ...current,
      codes: [...(payload.codes ?? []), ...current.codes],
    }));
  }

  async function handleSaveResult(matchId, scoreA, scoreB, winner = null) {
    const payload = await apiPost(
      "/api/admin-save-result",
      { matchId, scoreA, scoreB, status: "final", winner },
      adminSession?.access_token,
    );
    setResults((current) => [
      payload.result,
      ...current.filter((result) => result.match_id !== matchId),
    ]);
    setAdminData((current) => ({
      ...current,
      results: [
        payload.result,
        ...current.results.filter((result) => result.match_id !== matchId),
      ],
    }));
    await refreshRanking();
  }

  async function handleToggleKoVisible(nextValue) {
    const payload = await apiPost(
      "/api/admin-save-setting",
      { key: "ko_visible", value: Boolean(nextValue) },
      adminSession?.access_token,
    );
    setKoVisible(Boolean(payload.setting?.value));
    return payload;
  }

  async function handleResolveKnockout(manualPairings = {}) {
    const payload = await apiPost(
      "/api/admin-resolve-knockout",
      { manualPairings },
      adminSession?.access_token,
    );
    // Aufgeloeste Teams stehen jetzt in den matches-Zeilen -> neu laden.
    const dbMatches = await loadDbMatches();
    if (dbMatches.length) setMatches(dbMatches.map(mapDbMatch));
    return payload;
  }

  async function refreshWmTestData(session = adminSession) {
    if (!session?.access_token) return null;
    setWmTestLoading(true);
    try {
      const payload = await apiGetWithAuth("/api/admin-wm-test-data", session.access_token);
      setWmTestData(payload);
      return payload;
    } finally {
      setWmTestLoading(false);
    }
  }

  async function handleSaveWmTestResult(matchId, scoreA, scoreB, winner = null) {
    await apiPost(
      "/api/admin-save-wm-test-result",
      { matchId, scoreA, scoreB, status: "final", winner },
      adminSession?.access_token,
    );
    return refreshWmTestData();
  }

  async function handleSaveWmTestBonusResults(testBonusResults) {
    await apiPost(
      "/api/admin-save-wm-test-bonus-results",
      testBonusResults,
      adminSession?.access_token,
    );
    return refreshWmTestData();
  }

  async function handleResetWmTest() {
    await apiPost("/api/admin-reset-wm-test", {}, adminSession?.access_token);
    return refreshWmTestData();
  }

  async function handleGenerateWmTestResults() {
    await apiPost("/api/admin-generate-wm-test-results", {}, adminSession?.access_token);
    return refreshWmTestData();
  }

  async function handlePreviewOfficialResults() {
    return apiGetWithAuth("/api/admin-official-results", adminSession?.access_token);
  }

  async function handleImportOfficialResults(matchIds) {
    const payload = await apiPost(
      "/api/admin-official-results",
      { matchIds },
      adminSession?.access_token,
    );
    const imported = payload.imported ?? [];
    if (imported.length) {
      setResults((current) => [
        ...imported,
        ...current.filter((result) => !imported.some((item) => item.match_id === result.match_id)),
      ]);
      setAdminData((current) => ({
        ...current,
        results: [
          ...imported,
          ...current.results.filter((result) => !imported.some((item) => item.match_id === result.match_id)),
        ],
      }));
      await refreshRanking();
    }
    return payload;
  }

  if (showBundesligaApp) {
    return <BundesligaParticipantApp isTestMode={isTestMode} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => setActiveTab("start")}>
          <span className="brand-logo">
            <img src="/oesterfeld-logo-round.jpg" alt="WM-Tippspiel Österfeld-Edition" />
          </span>
          <span>
            <strong>WM-Tippspiel Österfeld-Edition</strong>
            <small>WM 2026</small>
          </span>
        </button>

        <nav className="main-nav" aria-label="Hauptnavigation">
          {tabs
            .filter((tab) => (tab.id !== "rangliste" || canViewRanking) && (tab.id !== "simulation" || isTestMode || Boolean(adminSession)))
            .map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-button ${activeTab === id ? "active" : ""}`}
              onClick={() => {
                setActiveTab(id);
                if (id === "rangliste") void refreshRanking();
              }}
            >
              <Icon size={21} strokeWidth={2.2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="user-chip">
          <CircleUserRound size={26} />
          <span>
            <small>{adminSession ? "Admin angemeldet" : "Angemeldet als"}</small>
            <strong>{adminSession?.user?.email || participant?.name || "Gast"}</strong>
          </span>
          <ChevronDown size={18} />
        </div>

        <button
          type="button"
          className="icon-button"
          onClick={adminSession ? handleAdminLogout : resetDevice}
          aria-label={adminSession ? "Admin abmelden" : "Dieses Gerät zurücksetzen"}
          title={adminSession ? "Admin abmelden" : "Dieses Gerät zurücksetzen"}
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="stadium">
        <section className="scoreboard-strip" aria-label="Turnierübersicht">
          <span>WM 2026 · {groupMatchCount} Gruppenspiele</span>
          <strong>{savedTipCount} von {tippableMatches.length} Tipps gespeichert</strong>
          <span>{appStatus}</span>
        </section>

        <section className="app-download-strip" aria-label="Android-App herunterladen">
          <div>
            <Download size={20} />
            <span>
              <strong>Android-App verfügbar</strong>
              <small>Tipps direkt auf dem Handy abgeben und Updates bequem in der App laden.</small>
            </span>
          </div>
          <a className="app-download-button" href={ANDROID_APK_URL} download>
            Android-App herunterladen
          </a>
        </section>

        <div className={`content-grid active-${activeTab} ${participant ? "participant-active" : ""}`}>
          <aside className="join-panel panel">
            <StartPanel
              activeCode={activeCode}
              codeStatus={codeStatus}
              hasScannedCode={Boolean(scannedCode)}
              manualCode={manualCode}
              name={name}
              participant={participant}
              savedTipCount={savedTipCount}
              setManualCode={setManualCode}
              setName={setName}
              saveParticipant={saveParticipant}
              setActiveTab={setActiveTab}
            />
          </aside>

          <section className="center-stage">
            {activeTab === "start" && (
              participant ? (
                <>
                  <ParticipantLanding
                    participant={participant}
                    matches={tippableMatches}
                    tips={tips}
                    resultsByMatch={resultsByMatch}
                    bonusTips={bonusTips}
                    groupTables={groupTables}
                    ranking={displayRanking}
                    setActiveTab={setActiveTab}
                  />
                  {isTestMode && (
                    <TestModePanel
                      matches={matches}
                      tips={tips}
                      resultsByMatch={resultsByMatch}
                      bonusPoints={currentBonusPoints}
                      totalPoints={currentPoints}
                      averagePoints={currentAveragePoints}
                    />
                  )}
                </>
              ) : (
                <>
                  <ScheduleSummary />
                  <MatchCard
                    match={featuredMatch}
                    tip={tips[featuredMatch.id]}
                    result={resultsByMatch.get(featuredMatch.id)}
                    trend={tipTrends[featuredMatch.id]}
                    changeScore={changeScore}
                    saveTip={saveTip}
                    lastSavedMatch={lastSavedMatch}
                    saveStatus={tipSaveStatuses[featuredMatch.id]}
                    locked
                    featured
                  />
                  <InfoBanner />
                </>
              )
            )}

            {activeTab === "tippen" && (
              <TipScreen
                filteredMatches={filteredMatches}
                koMatches={koMatches}
                isAdmin={Boolean(adminSession)}
                koVisible={koVisible}
                groupFilter={groupFilter}
                searchTerm={searchTerm}
                setGroupFilter={setGroupFilter}
                setSearchTerm={setSearchTerm}
                tips={tips}
                resultsByMatch={resultsByMatch}
                matches={matches}
                teamOptions={teamOptions}
                players={players}
                groupTables={groupTables}
                bonusTips={bonusTips}
                setBonusTips={updateBonusTips}
                saveBonusTips={saveBonusTips}
                bonusMessage={bonusMessage}
                bonusSaveStatus={bonusSaveStatus}
                changeScore={changeScore}
                saveTip={saveTip}
                saveVisibleTips={saveVisibleTips}
                lastSavedMatch={lastSavedMatch}
                tipSaveStatuses={tipSaveStatuses}
                tipTrends={tipTrends}
                locked={!participant}
              />
            )}

            {activeTab === "rangliste" && (
              canViewRanking ? (
                <RankingPanel ranking={displayRanking} expanded />
              ) : (
                <ScheduleSummary />
              )
            )}

            {activeTab === "info" && (
              <InfoScreen />
            )}

            {activeTab === "simulation" && (isTestMode || adminSession) && (
              <KnockoutSimulator />
            )}

            {activeTab === "admin" && (
              <AdminPanel
                session={adminSession}
                adminData={adminData}
                matches={matches}
                teamOptions={teamOptions}
                players={players}
                groupTables={groupTables}
                bonusResults={bonusResults}
                resultsByMatch={resultsByMatch}
                wmTestData={wmTestData}
                wmTestLoading={wmTestLoading}
                onLogin={handleAdminLogin}
                onLogout={handleAdminLogout}
                onRefresh={() => refreshAdminData()}
                onRefreshWmTestData={() => refreshWmTestData()}
                onSaveWmTestResult={handleSaveWmTestResult}
                onSaveWmTestBonusResults={handleSaveWmTestBonusResults}
                onResetWmTest={handleResetWmTest}
                onGenerateWmTestResults={handleGenerateWmTestResults}
                onCreateCodes={handleCreateCodes}
                onCreateParticipant={async (displayName) => {
                  const payload = await apiPost(
                    "/api/admin-create-participant",
                    { name: displayName },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    codes: [payload.code, ...current.codes],
                    participants: [payload.participant, ...current.participants],
                  }));
                  return payload;
                }}
                onDeleteParticipant={async (participantId) => {
                  const payload = await apiPost(
                    "/api/admin-delete-participant",
                    { participantId },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    participants: current.participants.filter(
                      (participant) => participant.id !== payload.deletedParticipantId,
                    ),
                    tips: current.tips.filter(
                      (tip) => tip.participant_id !== payload.deletedParticipantId,
                    ),
                    codes: current.codes.filter(
                      (code) => code.id !== payload.deletedCodeId,
                    ),
                  }));
                  await refreshTipTrends();
                  return payload;
                }}
                onRenameParticipant={async (participantId, displayName) => {
                  const payload = await apiPost(
                    "/api/admin-rename-participant",
                    { participantId, displayName },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    participants: current.participants.map((participant) =>
                      participant.id === payload.participant.id ? payload.participant : participant,
                    ),
                    codes: current.codes.map((code) =>
                      code.participant?.id === payload.participant.id
                        ? {
                            ...code,
                            participant: {
                              ...code.participant,
                              display_name: payload.participant.display_name,
                            },
                          }
                        : code,
                    ),
                  }));
                  return payload;
                }}
                onDeleteCode={async (codeId) => {
                  const payload = await apiPost(
                    "/api/admin-delete-code",
                    { codeId },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    codes: current.codes.filter((code) => code.id !== payload.deletedCodeId),
                  }));
                  return payload;
                }}
                onSaveParticipantTips={async (participantId, participantTips) => {
                  const payload = await apiPost(
                    "/api/admin-save-participant-tips",
                    { participantId, tips: participantTips },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    tips: [
                      ...(payload.tips ?? []),
                      ...current.tips.filter(
                        (tip) =>
                          tip.participant_id !== participantId ||
                          !(payload.tips ?? []).some((saved) => saved.match_id === tip.match_id),
                      ),
                    ],
                  }));
                  await refreshRanking();
                  await refreshTipTrends();
                  return payload;
                }}
                onSaveParticipantBonusTips={async (participantId, participantBonusTips) => {
                  const payload = await apiPost(
                    "/api/admin-save-participant-bonus-tips",
                    { participantId, ...participantBonusTips },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    bonusTips: [
                      payload.bonusTip,
                      ...(current.bonusTips ?? []).filter((tip) => tip.participant_id !== participantId),
                    ],
                  }));
                  await refreshRanking();
                  return payload;
                }}
                onSaveBonusResults={async (officialBonusResults) => {
                  const payload = await apiPost(
                    "/api/admin-save-bonus-results",
                    officialBonusResults,
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    bonusResults: payload.bonusResults,
                  }));
                  setBonusResults(createInitialBonusResults(matches, payload.bonusResults, players));
                  await refreshRanking();
                  return payload;
                }}
                onSavePlayer={async (playerDraft) => {
                  const payload = await apiPost(
                    "/api/admin-save-player",
                    playerDraft,
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    players: [
                      payload.player,
                      ...(current.players ?? []).filter((player) => player.id !== payload.player.id),
                    ].sort((first, second) => first.display_name.localeCompare(second.display_name, "de")),
                  }));
                  setPlayers((current) => [
                    payload.player,
                    ...current.filter((player) => player.id !== payload.player.id),
                  ].filter((player) => player.active).sort((first, second) => first.display_name.localeCompare(second.display_name, "de")));
                  return payload;
                }}
                onMapTopScorer={async (topScorerText, playerId) => {
                  const payload = await apiPost(
                    "/api/admin-map-top-scorer",
                    { topScorerText, playerId },
                    adminSession?.access_token,
                  );
                  setAdminData((current) => ({
                    ...current,
                    bonusTips: [
                      ...(payload.bonusTips ?? []),
                      ...(current.bonusTips ?? []).filter((tip) =>
                        !(payload.bonusTips ?? []).some((saved) => saved.participant_id === tip.participant_id),
                      ),
                    ],
                  }));
                  await refreshRanking();
                  return payload;
                }}
                onSaveResult={handleSaveResult}
                onResolveKnockout={handleResolveKnockout}
                koVisible={koVisible}
                onToggleKoVisible={handleToggleKoVisible}
                onPreviewOfficialResults={handlePreviewOfficialResults}
                onImportOfficialResults={handleImportOfficialResults}
              />
            )}
          </section>

          <aside className="side-stack">
            {canViewRanking && <RankingPanel ranking={displayRanking} setActiveTab={setActiveTab} />}
            <UpcomingPanel matches={matches} setActiveTab={setActiveTab} />
            <KnockoutPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}

async function apiGetWithAuth(path, token) {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await readApiPayload(response);
  if (!response.ok) throw new Error(payload.error || "Serverfehler");
  return payload;
}

function StartPanel({
  activeCode,
  codeStatus,
  hasScannedCode,
  manualCode,
  name,
  participant,
  savedTipCount,
  setManualCode,
  setName,
  saveParticipant,
  setActiveTab,
}) {
  const canJoin = activeCode && ["free", "claimed"].includes(codeStatus);
  const label =
    codeStatus === "claimed"
      ? "Code aktiviert"
      : codeStatus === "free"
        ? "Freier Einladungscode"
        : codeStatus === "checking"
          ? "Code wird geprüft"
          : activeCode
            ? "Code nicht gefunden"
            : "Code vom QR-Zettel eingeben";

  return (
    <>
      <div className="panel-heading">
        <UsersRound size={42} />
        <div>
          <h1>Jetzt mitmachen</h1>
          <p>QR-Code scannen und am WM-Tippspiel teilnehmen.</p>
        </div>
      </div>

      <div className={`code-status ${canJoin || participant ? "ok" : "bad"}`}>
        <Check size={20} />
        <strong>{label}</strong>
      </div>

      <div className="code-box">
        <QrCode size={28} />
          <span>{activeCode || "Noch kein Code"}</span>
      </div>

      {!participant && !hasScannedCode && (
        <label className="manual-code">
          Code vom QR-Zettel oder Admin eingeben
          <input
            value={manualCode}
            onChange={(event) => setManualCode(event.target.value.toUpperCase())}
            placeholder="z. B. WM-7K2QD-9X4LA"
          />
        </label>
      )}

      {participant ? (
        <div className="saved-user">
          <CircleUserRound size={34} />
          <div>
            <small>Name gespeichert · {savedTipCount} Tipps</small>
            <strong>{participant.name}</strong>
          </div>
          <button type="button" onClick={() => setActiveTab("tippen")}>Zum WM-Plan</button>
        </div>
      ) : (
        <form onSubmit={saveParticipant} className="join-form">
          <label htmlFor="name">Name eintragen</label>
          <div className="input-row">
            <input
              id="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Max Mustermann"
              disabled={!canJoin}
            />
            <Check size={20} />
          </div>
          <button className="primary-button" disabled={!name.trim() || !canJoin}>
            Freischalten
            <ChevronRight size={19} />
          </button>
        </form>
      )}

      <p className="fine-print">
        Den Code bekommst du als QR-Code oder Nummer vom Admin. Er wird nicht
        geraten oder selbst erzeugt. Danach kannst du deine Tipps speichern.
      </p>

      <div className="goal-illustration" aria-hidden="true">
        <div className="net"></div>
        <span>⚽</span>
      </div>
    </>
  );
}

function ScheduleSummary() {
  return (
    <section className="schedule-summary panel">
      <header>
        <CalendarDays size={25} />
        <div>
          <h2>WM-Tippspiel Österfeld-Edition</h2>
          <p>{scheduleSource.label}</p>
        </div>
      </header>
      <figure className="edition-logo-card">
        <img src="/oesterfeld-logo-round.jpg" alt="Logo WM-Tippspiel Österfeld-Edition" />
      </figure>
      <div className="summary-stats">
        <strong>72<span>Gruppenspiele</span></strong>
        <strong>12<span>Gruppen</span></strong>
        <strong>11.06.-27.06.<span>Gruppenphase</span></strong>
      </div>
    </section>
  );
}

function ParticipantLanding({
  participant,
  matches,
  tips,
  resultsByMatch,
  bonusTips,
  groupTables,
  ranking,
  setActiveTab,
}) {
  const savedTipCount = matches.filter((match) => tips[match.id]?.saved).length;
  const openTipCount = Math.max(0, matches.length - savedTipCount);
  const progress = matches.length ? Math.round((savedTipCount / matches.length) * 100) : 0;
  const groupWinnerCount = countGroupWinnerDrafts(bonusTips);
  const bonusTotal = 2 + groupTables.length;
  const bonusDone =
    (bonusTips.champion ? 1 : 0) +
    (bonusTips.topScorer ? 1 : 0) +
    groupWinnerCount;
  const currentRank = ranking.find((row) => row.isCurrent || row.name === participant.name);
  const nextOpenMatches = matches
    .filter((match) => !tips[match.id]?.saved)
    .slice(0, 4);

  const evaluatedMatches = matches
    .map((match) => ({ match, result: resultsByMatch?.get(match.id), tip: tips[match.id] }))
    .filter((row) => row.result?.status === "final")
    .sort((first, second) => (second.match.matchNumber ?? 0) - (first.match.matchNumber ?? 0))
    .slice(0, 5);

  return (
    <section className="participant-landing panel">
      <header className="landing-hero">
        <div>
          <span>Willkommen zurück</span>
          <h2>{participant.name}</h2>
          <p>Hier siehst du, was schon erledigt ist und was als nächstes ansteht.</p>
        </div>
        <img src="/oesterfeld-logo-round.jpg" alt="" aria-hidden="true" />
      </header>

      <div className="landing-progress">
        <div>
          <strong>{savedTipCount} von {matches.length}</strong>
          <span>Spieltipps gespeichert</span>
        </div>
        <div className="progress-track" aria-label={`${progress} Prozent der Tipps gespeichert`}>
          <span style={{ width: `${progress}%` }}></span>
        </div>
        <small>{openTipCount === 0 ? "Alle Gruppenspiele sind getippt." : `${openTipCount} Spieltipps sind noch offen.`}</small>
      </div>

      <div className="landing-stats">
        <strong>{currentRank?.points ?? 0}<span>Punkte</span></strong>
        <strong>{currentRank?.averagePoints?.toFixed?.(2) ?? "0.00"}<span>Schnitt</span></strong>
        <strong>{bonusDone} / {bonusTotal}<span>Bonus-Tipps</span></strong>
      </div>

      <div className="next-steps">
        <button type="button" className="primary-button compact" onClick={() => setActiveTab("tippen")}>
          Offene Tipps bearbeiten
          <ChevronRight size={18} />
        </button>
        <button type="button" className="ghost-action" onClick={() => setActiveTab("rangliste")}>
          Rangliste ansehen
        </button>
        <button type="button" className="ghost-action" onClick={() => setActiveTab("info")}>
          Regeln lesen
        </button>
      </div>

      <section className="next-open-panel">
        <h3>Nächste offene Tipps</h3>
        {nextOpenMatches.length === 0 ? (
          <p>Für die Gruppenphase ist gerade nichts mehr offen.</p>
        ) : (
          <div className="next-open-list">
            {nextOpenMatches.map((match) => (
              <div key={match.id}>
                <span>Spiel {match.matchNumber}</span>
                <strong>{match.teamA} - {match.teamB}</strong>
                <small>{formatDate(match.date)} · {match.time} Uhr</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="evaluated-results-panel">
        <h3>Zuletzt ausgewertet</h3>
        {evaluatedMatches.length === 0 ? (
          <p>Sobald Spiele ausgewertet sind, siehst du hier dein Tipp-Ergebnis.</p>
        ) : (
          <div className="evaluated-results-list">
            {evaluatedMatches.map(({ match, result, tip }) => {
              const hasTip = isCompleteTip(tip);
              const earned = hasTip ? pointsFor(tip, result) : 0;
              return (
                <div key={match.id} className={earned > 0 ? "scored" : "missed"}>
                  <span>Spiel {match.matchNumber}</span>
                  <strong>{match.teamA} {result.score_a}:{result.score_b} {match.teamB}</strong>
                  <small>
                    {hasTip
                      ? `Dein Tipp: ${tip.scoreA}:${tip.scoreB}`
                      : "Kein Tipp abgegeben"}
                  </small>
                  <b>{earned > 0 ? `+${earned} Punkte` : "0 Punkte"}</b>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

function TestModePanel({ matches, tips, resultsByMatch, bonusPoints, totalPoints, averagePoints }) {
  const scenarioRows = TEST_SCENARIOS.map((scenario, index) => {
    const match = matches[index];
    const tip = match ? tips[match.id] : null;
    const result = match ? resultsByMatch.get(match.id) : null;
    return {
      ...scenario,
      matchLabel: match ? `Spiel ${match.matchNumber}` : `Fall ${index + 1}`,
      actualPoints: tip ? pointsFor(tip, result) : 0,
    };
  });
  const matchPoints = scenarioRows.reduce((sum, row) => sum + row.actualPoints, 0);
  const allChecksOk =
    matchPoints === TEST_EXPECTED.matchPoints &&
    bonusPoints === TEST_EXPECTED.bonusPoints &&
    totalPoints === TEST_EXPECTED.totalPoints &&
    Number(averagePoints.toFixed(2)) === TEST_EXPECTED.averagePoints;

  return (
    <section className="test-mode-panel panel" aria-label="Testmodus Auswertung">
      <header>
        <ShieldCheck size={24} />
        <div>
          <h2>Testmodus aktiv</h2>
          <p>Dieser Durchlauf prüft Ergebniswertung, Bonuspunkte, Schnitt und Rangliste ohne echte Datenbank-Änderungen.</p>
        </div>
        <strong className={allChecksOk ? "ok" : "warning"}>{allChecksOk ? "Alles greift" : "Bitte prüfen"}</strong>
      </header>

      <div className="test-score-grid">
        <strong>{matchPoints}<span>Spielpunkte</span></strong>
        <strong>{bonusPoints}<span>Bonuspunkte</span></strong>
        <strong>{totalPoints}<span>Gesamtpunkte</span></strong>
        <strong>{averagePoints.toFixed(2)}<span>Schnitt</span></strong>
      </div>

      <div className="test-case-list">
        {scenarioRows.map((row) => (
          <div key={row.matchLabel}>
            <span>{row.matchLabel}</span>
            <strong>{row.label}</strong>
            <small>
              Tipp {row.tipA}:{row.tipB}, Ergebnis {row.resultA}:{row.resultB}
            </small>
            <b>{row.actualPoints} Pkt.</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function koWinnerSide(result) {
  if (!result || result.status !== "final") return null;
  if (result.score_a > result.score_b) return "A";
  if (result.score_b > result.score_a) return "B";
  return result.winner === "A" || result.winner === "B" ? result.winner : null;
}

function BracketMatch({ match, result }) {
  const winnerSide = koWinnerSide(result);
  const decided = result?.status === "final";
  const penalties = decided && result.score_a === result.score_b && (result.winner === "A" || result.winner === "B");
  const rows = [
    { side: "A", name: match.teamA, flagCode: match.flagCodeA, score: decided ? result.score_a : null },
    { side: "B", name: match.teamB, flagCode: match.flagCodeB, score: decided ? result.score_b : null },
  ];
  return (
    <div className="bracket-match">
      {rows.map((row) => (
        <div key={row.side} className={`bracket-team ${winnerSide === row.side ? "is-winner" : ""}`}>
          <span className="bracket-flag" aria-hidden="true">
            {row.flagCode ? <img src={`https://flagcdn.com/w40/${row.flagCode}.png`} alt="" /> : null}
          </span>
          <span className="bracket-name">{row.name}</span>
          <span className="bracket-score">{row.score ?? "–"}</span>
        </div>
      ))}
      {penalties && <span className="bracket-note">i.E.</span>}
    </div>
  );
}

function KnockoutBracket({ koMatches, resultsByMatch }) {
  const [open, setOpen] = useState(false);
  const columns = useMemo(() => {
    return ["r32", "r16", "quarter", "semi", "final"]
      .map((phase) => ({
        phase,
        label: KO_PHASE_LABELS[phase] ?? phase,
        matches: koMatches.filter((match) => match.phase === phase),
      }))
      .filter((column) => column.matches.length > 0);
  }, [koMatches]);
  const thirdMatch = koMatches.find((match) => match.phase === "third");

  if (!columns.length) return null;

  return (
    <section className="bracket-panel panel">
      <button
        type="button"
        className="bracket-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Trophy size={18} />
        Turnierbaum {open ? "einklappen" : "anzeigen"}
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="bracket-scroll" role="group" aria-label="Turnierbaum">
          {columns.map((column) => (
            <div className="bracket-column" key={column.phase}>
              <h4>{column.label}</h4>
              {column.matches.map((match) => (
                <BracketMatch key={match.id} match={match} result={resultsByMatch.get(match.id)} />
              ))}
              {column.phase === "final" && thirdMatch && (
                <>
                  <h4 className="bracket-third-title">Spiel um Platz 3</h4>
                  <BracketMatch match={thirdMatch} result={resultsByMatch.get(thirdMatch.id)} />
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function KnockoutTipBlock({
  koMatches,
  adminOnly = false,
  tips,
  resultsByMatch,
  changeScore,
  saveTip,
  lastSavedMatch,
  tipSaveStatuses,
  tipTrends,
  locked,
}) {
  const phaseGroups = useMemo(() => {
    return KO_PHASES.map((phase) => ({
      phase,
      label: KO_PHASE_LABELS[phase] ?? phase,
      matches: koMatches.filter((match) => match.phase === phase),
    })).filter((group) => group.matches.length > 0);
  }, [koMatches]);

  return (
    <section className="ko-tip-block panel">
      <div className="ko-tip-block-head">
        <Trophy size={22} />
        <div>
          <h2>K.o.-Phase</h2>
          <p>
            {adminOnly
              ? "Nur für Admins sichtbar. Paarungen zeigen Platzhalter, bis sie aus den Gruppentabellen aufgelöst werden."
              : "Tippe die Spiele der K.o.-Runde. Solange die Paarungen noch nicht feststehen, zeigen die Karten Platzhalter."}
          </p>
        </div>
      </div>

      {phaseGroups.map((group) => (
        <div key={group.phase} className="ko-tip-phase">
          <h3 className="ko-tip-phase-title">{group.label}</h3>
          <div className="match-stack">
            {group.matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                tip={tips[match.id]}
                result={resultsByMatch.get(match.id)}
                changeScore={changeScore}
                saveTip={saveTip}
                lastSavedMatch={lastSavedMatch}
                saveStatus={tipSaveStatuses[match.id]}
                trend={tipTrends[match.id]}
                locked={locked}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function TipScreen({
  filteredMatches,
  koMatches = [],
  isAdmin = false,
  koVisible = false,
  groupFilter,
  searchTerm,
  setGroupFilter,
  setSearchTerm,
  tips,
  resultsByMatch,
  matches,
  teamOptions,
  players,
  groupTables,
  bonusTips,
  setBonusTips,
  saveBonusTips,
  bonusMessage,
  bonusSaveStatus,
  changeScore,
  saveTip,
  saveVisibleTips,
  lastSavedMatch,
  tipSaveStatuses,
  tipTrends,
  locked,
}) {
  const [tipView, setTipView] = useState("spiele");
  const filterStats = useMemo(() => {
    const matchesForFilter = (filter) => matches.filter((match) => {
      if (!isGroupPhase(match)) return false;
      if (filter === "alle") return true;
      if (filter === "deutschland") return [match.teamA, match.teamB].includes("Deutschland");
      return match.groupKey === filter;
    });

    return Object.fromEntries(groupFilters.map((filter) => {
      const filterMatches = matchesForFilter(filter);
      const saved = filterMatches.filter((match) => tips[match.id]?.saved).length;
      const pending = filterMatches.filter((match) => {
        const tip = tips[match.id];
        const status = tipSaveStatuses[match.id];
        return isCompleteTip(tip) && (!tip?.saved || status === "pending" || status === "saving");
      }).length;
      const total = filterMatches.length;

      return [
        filter,
        {
          total,
          saved,
          pending,
          open: Math.max(0, total - saved),
          complete: total > 0 && saved === total,
        },
      ];
    }));
  }, [matches, tips, tipSaveStatuses]);

  return (
    <div className="tip-screen">
      <section className="tip-toolbar panel">
        <div className="toolbar-title">
          <ListFilter size={24} />
          <div>
            <h2>WM-Plan tippen</h2>
            <p>{filteredMatches.length} Spiele sichtbar · Ergebnis-Tipp mit Torzahlen</p>
          </div>
        </div>

        <div className="view-tabs" aria-label="Tippansicht">
          <button
            type="button"
            className={tipView === "spiele" ? "active" : ""}
            onClick={() => setTipView("spiele")}
          >
            Spiele
          </button>
          <button
            type="button"
            className={tipView === "gruppen" ? "active" : ""}
            onClick={() => setTipView("gruppen")}
          >
            Gruppen & Bonus
          </button>
        </div>

        {tipView === "spiele" ? (
          <>
            <label className="search-field">
              <Search size={18} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Team, Gruppe oder Stadt suchen"
              />
            </label>

            <div className="filter-row" aria-label="Gruppenfilter">
              {groupFilters.map((filter) => {
                const stat = filterStats[filter] ?? { total: 0, saved: 0, pending: 0, open: 0, complete: false };
                const isActive = groupFilter === filter;
                const statusClass = stat.complete ? "complete" : stat.pending > 0 ? "pending" : "open";
                const label = getGroupFilterLabel(filter);
                const statusLabel = stat.complete
                  ? "vollständig"
                  : stat.pending > 0
                    ? `${stat.pending} Tipp${stat.pending === 1 ? "" : "s"} warten auf Speicherung`
                    : `${stat.open} offen`;

                return (
                  <button
                    type="button"
                    key={filter}
                    className={[
                      isActive ? "active" : "",
                      `status-${statusClass}`,
                    ].filter(Boolean).join(" ")}
                    onClick={() => setGroupFilter(filter)}
                    aria-label={`${label}: ${stat.saved} von ${stat.total} Tipps gespeichert, ${statusLabel}`}
                    title={`${label}: ${stat.saved}/${stat.total} gespeichert · ${statusLabel}`}
                  >
                    <span className="filter-button-label">{label}</span>
                    <span className="filter-button-count">{stat.saved}/{stat.total}</span>
                    {stat.complete && <Check className="filter-button-icon" size={15} strokeWidth={3} aria-hidden="true" />}
                    {!stat.complete && stat.pending > 0 && <span className="filter-button-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="primary-button compact"
              disabled={locked || filteredMatches.length === 0}
              onClick={saveVisibleTips}
            >
              Sichtbare Tipps speichern
              <Check size={18} />
            </button>
          </>
        ) : (
        <p className="fine-print">
            Bonus-Tipps haben eigene Fristen. Weltmeister und Torschützenkönig
            schließen zum Turnierstart, Gruppensieger zum ersten Spiel der jeweiligen Gruppe.
        </p>
        )}
      </section>

      {tipView === "spiele" ? (
        <>
          <div className="match-stack">
            {filteredMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                tip={tips[match.id]}
                result={resultsByMatch.get(match.id)}
                changeScore={changeScore}
                saveTip={saveTip}
                lastSavedMatch={lastSavedMatch}
                saveStatus={tipSaveStatuses[match.id]}
                trend={tipTrends[match.id]}
                locked={locked}
              />
            ))}
          </div>
          {(isAdmin || koVisible) && koMatches.length > 0 && (
            <>
              <KnockoutTipBlock
                koMatches={koMatches}
                adminOnly={isAdmin && !koVisible}
                tips={tips}
                resultsByMatch={resultsByMatch}
                changeScore={changeScore}
                saveTip={saveTip}
                lastSavedMatch={lastSavedMatch}
                tipSaveStatuses={tipSaveStatuses}
                tipTrends={tipTrends}
                locked={locked}
              />
              <KnockoutBracket koMatches={koMatches} resultsByMatch={resultsByMatch} />
            </>
          )}
        </>
      ) : (
        <>
          <BonusTipsPanel
            matches={matches}
            teamOptions={teamOptions}
            players={players}
            groupTables={groupTables}
            bonusTips={bonusTips}
            setBonusTips={setBonusTips}
            saveBonusTips={saveBonusTips}
            bonusMessage={bonusMessage}
            bonusSaveStatus={bonusSaveStatus}
            locked={locked}
          />
          <GroupsOverview groupTables={groupTables} />
        </>
      )}
    </div>
  );
}


function BonusTipsPanel({
  matches,
  teamOptions,
  players,
  groupTables,
  bonusTips,
  setBonusTips,
  saveBonusTips,
  bonusMessage,
  bonusSaveStatus,
  locked,
}) {
  const tournamentDeadline = getTournamentDeadline(matches);
  const mainBonusLocked = locked || isDeadlinePassed(tournamentDeadline);
  const lockedGroupCount = groupTables.filter((group) => isDeadlinePassed(getGroupDeadline(matches, group.groupKey))).length;
  const allGroupsLocked = lockedGroupCount === groupTables.length;
  const allBonusLocked = mainBonusLocked && allGroupsLocked;

  function updateGroupWinner(groupKey, value) {
    setBonusTips((current) => ({
      ...current,
      groupWinners: {
        ...current.groupWinners,
        [groupKey]: value,
      },
      saved: false,
    }));
  }

  return (
    <section className="bonus-panel panel">
      <header className="section-title">
        <Medal size={24} />
        <h2>Bonus-Tipps</h2>
        <span>{bonusTips.saved ? "gespeichert" : "offen"}</span>
      </header>
      <p className="bonus-deadline-note">
        Weltmeister und Torschützenkönig sind bis Turnierstart tippbar
        {tournamentDeadline ? ` (${formatDateTime(tournamentDeadline)} Uhr).` : "."}
        {" "}Gruppensieger sind bis zum ersten Spiel der jeweiligen Gruppe tippbar.
      </p>

      <div className="bonus-main-grid">
        <label className={mainBonusLocked ? "locked" : ""}>
          Weltmeister
          <select
            value={bonusTips.champion}
            disabled={mainBonusLocked}
            onChange={(event) =>
              setBonusTips((current) => ({ ...current, champion: event.target.value, saved: false }))
            }
          >
            <option value="">Bitte wählen</option>
            {teamOptions.map((team) => (
              <option key={team.name} value={team.name}>{team.name}</option>
            ))}
          </select>
          {mainBonusLocked && <small>Gesperrt: Turnierstart erreicht.</small>}
        </label>

        <label className={mainBonusLocked ? "locked" : ""}>
          Torschützenkönig
          <PlayerSelect
            players={players}
            value={bonusTips.topScorerPlayerId}
            fallbackText={bonusTips.topScorer}
            disabled={mainBonusLocked}
            onChange={(playerId, player) =>
              setBonusTips((current) => ({
                ...current,
                topScorerPlayerId: playerId,
                topScorer: player?.display_name ?? current.topScorer,
                saved: false,
              }))
            }
          />
          {mainBonusLocked && <small>Gesperrt: Turnierstart erreicht.</small>}
        </label>
      </div>

      <h3>Gruppensieger</h3>
      <div className="group-winner-grid">
        {groupTables.map((group) => {
          const groupDeadline = getGroupDeadline(matches, group.groupKey);
          const groupLocked = locked || isDeadlinePassed(groupDeadline);

          return (
            <label key={group.groupKey} className={groupLocked ? "locked" : ""}>
              Gruppe {group.groupKey}
              <select
                value={bonusTips.groupWinners[group.groupKey] ?? ""}
                disabled={groupLocked}
                onChange={(event) => updateGroupWinner(group.groupKey, event.target.value)}
              >
                <option value="">Bitte wählen</option>
                {group.teams.map((team) => (
                  <option key={team.name} value={team.name}>{team.name}</option>
                ))}
              </select>
              <small>
                {groupLocked ? "Gesperrt seit" : "Tippbar bis"} {formatDateTime(groupDeadline)} Uhr
              </small>
            </label>
          );
        })}
      </div>

      <div className="bonus-actions">
        <button type="button" className="primary-button compact" disabled={allBonusLocked || bonusSaveStatus === "saving"} onClick={() => saveBonusTips()}>
          Bonus-Tipps speichern
          <Check size={18} />
        </button>
        {bonusMessage && <span>{bonusMessage}</span>}
      </div>
    </section>
  );
}

function GroupsOverview({ groupTables }) {
  return (
    <section className="groups-overview">
      {groupTables.map((group) => (
        <article className="group-table panel" key={group.groupKey}>
          <header className="section-title">
            <Trophy size={22} />
            <h2>Gruppe {group.groupKey}</h2>
          </header>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Sp</th>
                  <th>S</th>
                  <th>U</th>
                  <th>N</th>
                  <th>TD</th>
                  <th>Pt</th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={row.team}>
                    <td>
                      <span className="table-team">
                        {row.flagCode && (
                          <img src={`https://flagcdn.com/w40/${row.flagCode}.png`} alt={`Flagge ${row.team}`} />
                        )}
                        <span>{row.team}</span>
                      </span>
                    </td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor - row.goalsAgainst}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </section>
  );
}

function countGroupWinnerTips(bonusTip) {
  return Object.values(bonusTip?.group_winners ?? {}).filter(Boolean).length;
}

function countGroupWinnerDrafts(bonusTips) {
  return Object.values(bonusTips?.groupWinners ?? {}).filter(Boolean).length;
}

function isBonusTipStarted(bonusTip) {
  return Boolean(bonusTip?.champion || bonusTip?.top_scorer || countGroupWinnerTips(bonusTip) > 0);
}

function AdminBonusSummary({ bonusTip }) {
  if (!bonusTip || !isBonusTipStarted(bonusTip)) {
    return <p className="fine-print">Noch keine Bonus-Tipps gespeichert.</p>;
  }

  return (
    <section className="admin-bonus-summary">
      <h3>Bonus-Tipps</h3>
      <div className="bonus-summary-grid">
        <div>
          <span>Weltmeister</span>
          <strong>{bonusTip.champion || "offen"}</strong>
        </div>
        <div>
          <span>Torschützenkönig</span>
          <strong>{bonusTip.top_scorer || "offen"}</strong>
        </div>
        <div>
          <span>Gruppensieger</span>
          <strong>{countGroupWinnerTips(bonusTip)} / 12</strong>
        </div>
      </div>
    </section>
  );
}

function MatchCard({
  match,
  tip,
  result,
  changeScore,
  saveTip,
  lastSavedMatch,
  saveStatus,
  trend,
  locked,
  featured,
}) {
  const [showTrend, setShowTrend] = useState(false);
  if (!match || !tip) return null;
  const lockedByKickoff = isLockedForUsers(match);
  const isLocked = locked || lockedByKickoff;
  const hasTrend = (trend?.total ?? 0) > 0;
  const isEvaluated = result?.status === "final" && isCompleteTip(tip) && tip.saved;
  const earnedPoints = isEvaluated ? pointsFor(tip, result) : null;
  const statusLabel = saveStatus === "error"
    ? tipSaveStatusLabels.error
    : tipSaveStatusLabels[saveStatus];

  return (
    <article className={`match-card panel ${featured ? "featured" : ""}`}>
      <header className="match-header">
        <div>
          <strong>Spiel {match.matchNumber}</strong>
          <span>{match.status} · {match.group}</span>
        </div>
        <span className="match-time">
          <CalendarDays size={17} />
          {formatDate(match.date)} · {match.time} Uhr
        </span>
      </header>

      <div className="venue-line">
        {match.city} · {match.venue}
        {result ? ` · Ergebnis: ${result.score_a}:${result.score_b}` : ""}
      </div>

      <div className="match-body">
        <TeamBlock flagCode={match.flagCodeA} name={match.teamA} />
        <ScoreControl
          value={tip.scoreA}
          onIncrease={() => changeScore(match.id, "scoreA", 1)}
          onDecrease={() => changeScore(match.id, "scoreA", -1)}
          disabled={isLocked}
        />
        <span className="score-separator">:</span>
        <ScoreControl
          value={tip.scoreB}
          onIncrease={() => changeScore(match.id, "scoreB", 1)}
          onDecrease={() => changeScore(match.id, "scoreB", -1)}
          disabled={isLocked}
        />
        <TeamBlock flagCode={match.flagCodeB} name={match.teamB} />
      </div>

      {isEvaluated && (
        <div className={`match-points ${earnedPoints > 0 ? "scored" : "missed"}`}>
          <span>Dein Tipp {tip.scoreA}:{tip.scoreB} · Ergebnis {result.score_a}:{result.score_b}</span>
          <strong>{earnedPoints > 0 ? `+${earnedPoints} Punkte` : "0 Punkte"}</strong>
        </div>
      )}

      <footer className="match-actions">
        <button
          className="save-tip"
          onClick={() => saveTip(match.id)}
          disabled={isLocked || !isCompleteTip(tip)}
        >
          <ShieldCheck size={17} />
          Tipp speichern
        </button>
        <span className={[
          tip.saved || lastSavedMatch === match.id || saveStatus === "saved" ? "saved" : "",
          saveStatus === "pending" || saveStatus === "saving" ? "saving" : "",
          saveStatus === "error" ? "error" : "",
        ].filter(Boolean).join(" ")}>
          {locked
            ? "Erst QR-Code aktivieren"
            : lockedByKickoff
              ? "Tipp gesperrt: Spiel gestartet"
            : statusLabel
              ? statusLabel
            : tip.saved || lastSavedMatch === match.id
              ? tipSaveStatusLabels.saved
              : "Noch nicht gespeichert"}
        </span>
        <button
          type="button"
          className="trend-toggle"
          onClick={() => setShowTrend((current) => !current)}
        >
          Community-Trend {showTrend ? "ausblenden" : "anzeigen"}
        </button>
      </footer>

      {showTrend && (
        <section className="tip-trend" aria-label={`Community-Trend für ${match.teamA} gegen ${match.teamB}`}>
          {hasTrend ? (
            <>
              <div className="trend-bars">
                <span style={{ "--value": `${trend.homeWinPercent}%` }}>
                  {match.teamA} <b>{trend.homeWinPercent}%</b>
                </span>
                <span style={{ "--value": `${trend.drawPercent}%` }}>
                  Remis <b>{trend.drawPercent}%</b>
                </span>
                <span style={{ "--value": `${trend.awayWinPercent}%` }}>
                  {match.teamB} <b>{trend.awayWinPercent}%</b>
                </span>
              </div>
            </>
          ) : (
            <p>Noch keine Prozent-Tendenz für dieses Spiel verfügbar.</p>
          )}
        </section>
      )}
    </article>
  );
}

function TeamBlock({ flagCode, name }) {
  const flagSrc = flagCode ? `https://flagcdn.com/w160/${flagCode}.png` : "";

  return (
    <div className="team-block">
      <span className="flag">
        {flagSrc ? (
          <img src={flagSrc} alt={`Flagge ${name}`} />
        ) : (
          <span aria-hidden="true">⚽</span>
        )}
      </span>
      <strong>{name}</strong>
    </div>
  );
}



function InfoScreen() {
  return (
    <section className="info-screen panel">
      <header className="info-hero">
        <Info size={34} />
        <div>
          <h2>Regeln & Punkte</h2>
          <p>So werden die Tipps im WM-Tippspiel bewertet.</p>
        </div>
      </header>

      <div className="rules-grid">
        <article>
          <h3>Spieltipps</h3>
          <dl>
            <div>
              <dt>4 Punkte</dt>
              <dd>Exaktes Ergebnis richtig, zum Beispiel Tipp 2:1 und Ergebnis 2:1.</dd>
            </div>
            <div>
              <dt>3 Punkte</dt>
              <dd>Richtige Tendenz und richtige Tordifferenz, zum Beispiel Tipp 2:1 und Ergebnis 3:2.</dd>
            </div>
            <div>
              <dt>2 Punkte</dt>
              <dd>Richtige Tendenz, also Sieg, Niederlage oder Unentschieden richtig.</dd>
            </div>
            <div>
              <dt>0 Punkte</dt>
              <dd>Falsche Tendenz.</dd>
            </div>
            <div>
              <dt>K.o.-Phase</dt>
              <dd>
                Gewertet wird das Ergebnis nach 90 Minuten. Steht es dann unentschieden
                und fällt die Entscheidung im Elfmeterschießen, zählt für die Tendenz, wer
                weiterkommt: Wer den Sieger richtig getippt hat, bekommt 2 Punkte.
              </dd>
            </div>
          </dl>
        </article>

        <article>
          <h3>Bonus-Tipps</h3>
          <dl>
            <div>
              <dt>8 Punkte</dt>
              <dd>Weltmeister richtig getippt.</dd>
            </div>
            <div>
              <dt>6 Punkte</dt>
              <dd>Torschützenkönig richtig getippt.</dd>
            </div>
            <div>
              <dt>2 Punkte</dt>
              <dd>Pro richtigem Gruppensieger.</dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="rules-notes">
        <div>
          <ShieldCheck size={22} />
          <span>Spieltipps sind ab dem hinterlegten Spielstart gesperrt. Danach kann nur noch der Admin nachtragen oder korrigieren.</span>
        </div>
        <div>
          <Medal size={22} />
          <span>Weltmeister und Torschützenkönig schließen zum Turnierstart. Gruppensieger schließen mit dem ersten Spiel der jeweiligen Gruppe.</span>
        </div>
        <div>
          <Trophy size={22} />
          <span>Die Rangliste zählt Spielpunkte und Bonuspunkte zusammen. In der großen Rangliste sieht man beides getrennt.</span>
        </div>
        <div>
          <QrCode size={22} />
          <span>Mitmachen geht über einen QR-Code oder Anmeldecode vom Admin. Jeder Code gehört zu genau einem Teilnehmer.</span>
        </div>
      </div>
    </section>
  );
}

function UpcomingPanel({ matches, setActiveTab }) {
  return (
    <section className="upcoming-panel panel">
      <header className="section-title">
        <CalendarDays size={24} />
        <h2>Erste WM-Spiele</h2>
      </header>
      {matches.slice(0, 5).map((match) => (
        <div className="fixture-row" key={match.id}>
          <span>{formatDate(match.date)}</span>
          <strong>{match.teamA}</strong>
          <b>{match.time}</b>
          <strong>{match.teamB}</strong>
        </div>
      ))}
      <button type="button" className="ghost-button" onClick={() => setActiveTab?.("tippen")}>
        Alle Spiele im Tippbereich
      </button>
    </section>
  );
}

function KnockoutPanel() {
  return (
    <section className="knockout-panel panel">
      <header className="section-title">
        <Medal size={24} />
        <h2>K.-o.-Runde</h2>
      </header>
      <div className="knockout-list">
        {knockoutPreview.map((item) => (
          <div key={`${item.date}-${item.round}`}>
            <strong>{item.round}</strong>
            <span>{formatDate(item.date)} · {item.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBanner() {
  return (
    <aside className="info-banner">
      <Medal size={42} />
      <div>
        <strong>Alles bereit für eure Tipprunde.</strong>
        <span>Codes, Tipps, Ergebnisse und Rangliste werden zentral gespeichert.</span>
      </div>
    </aside>
  );
}

function AdminPanel({
  session,
  adminData,
  matches,
  teamOptions,
  players,
  groupTables,
  bonusResults,
  resultsByMatch,
  wmTestData,
  wmTestLoading,
  onLogin,
  onLogout,
  onRefresh,
  onRefreshWmTestData,
  onSaveWmTestResult,
  onSaveWmTestBonusResults,
  onResetWmTest,
  onGenerateWmTestResults,
  onCreateCodes,
  onCreateParticipant,
  onDeleteParticipant,
  onRenameParticipant,
  onDeleteCode,
  onSaveParticipantTips,
  onSaveParticipantBonusTips,
  onSaveBonusResults,
  onSavePlayer,
  onMapTopScorer,
  onSaveResult,
  onResolveKnockout,
  koVisible = false,
  onToggleKoVisible,
  onPreviewOfficialResults,
  onImportOfficialResults,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [codeCount, setCodeCount] = useState(10);
  const [newParticipantName, setNewParticipantName] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [resultDrafts, setResultDrafts] = useState({});
  const [resultFilter, setResultFilter] = useState("open");
  const [knockoutOverrides, setKnockoutOverrides] = useState({});
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [participantTipDrafts, setParticipantTipDrafts] = useState({});
  const [participantBonusDraft, setParticipantBonusDraft] = useState(createInitialBonusTips(matches));
  const [bonusResultDraft, setBonusResultDraft] = useState(createInitialBonusResults(matches, bonusResults));
  const [selectedCodeIds, setSelectedCodeIds] = useState([]);
  const [selectedTipSheetParticipantIds, setSelectedTipSheetParticipantIds] = useState([]);
  const [codesExpanded, setCodesExpanded] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState(null);
  const [participantNameDraft, setParticipantNameDraft] = useState("");
  const [printMode, setPrintMode] = useState("codes");
  const [printTipQrCodes, setPrintTipQrCodes] = useState({});
  const [officialPreview, setOfficialPreview] = useState(null);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [playerDraft, setPlayerDraft] = useState({ displayName: "", teamName: "", aliases: "", active: true });
  const [adminCompetition, setAdminCompetition] = useState(competitions.wm2026.id);
  const [wmAdminMode, setWmAdminMode] = useState("live");
  const [bundesligaData, setBundesligaData] = useState(null);
  const [bundesligaMessage, setBundesligaMessage] = useState("");
  const [bundesligaLoading, setBundesligaLoading] = useState(false);
  const [adminRanking, setAdminRanking] = useState([]);
  const [adminRankingStatus, setAdminRankingStatus] = useState("idle");
  const [wmAdminView, setWmAdminView] = useState("overview");
  const [participantSearch, setParticipantSearch] = useState("");
  const activePlayers = players.filter((player) => player.active !== false);
  const isBundesligaAdmin = adminCompetition === competitions.bundesliga.id;
  const isWmTestAdmin = !isBundesligaAdmin && wmAdminMode === "test";

  useEffect(() => {
    setBonusResultDraft(createInitialBonusResults(matches, bonusResults, players));
  }, [matches, bonusResults, players]);

  useEffect(() => {
    if (!isBundesligaAdmin || !session?.access_token) return;
    void loadBundesligaData();
  }, [isBundesligaAdmin, session?.access_token]);

  useEffect(() => {
    if (!isWmTestAdmin || !session?.access_token) return;
    void onRefreshWmTestData();
  }, [isWmTestAdmin, session?.access_token]);

  // Live-Rangliste der echten Teilnehmer fuer den Adminbereich nachladen. Wird
  // nach jedem Daten-Refresh aktualisiert, damit die Druckansicht aktuell ist.
  useEffect(() => {
    if (isBundesligaAdmin || isWmTestAdmin || !session?.access_token) return undefined;
    let cancelled = false;
    setAdminRankingStatus("loading");
    apiGet("/api/ranking")
      .then((payload) => {
        if (cancelled) return;
        setAdminRanking(payload.ranking ?? []);
        setAdminRankingStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setAdminRankingStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [isBundesligaAdmin, isWmTestAdmin, session?.access_token, adminData]);

  const sortedAdminRanking = useMemo(
    () =>
      [...adminRanking].sort(
        (first, second) =>
          (second.points ?? 0) - (first.points ?? 0) ||
          (second.matchdayWins ?? 0) - (first.matchdayWins ?? 0) ||
          String(first.name).localeCompare(String(second.name), "de"),
      ),
    [adminRanking],
  );

  const filteredAdminParticipants = useMemo(() => {
    const query = participantSearch.trim().toLowerCase();
    if (!query) return adminData.participants;
    return adminData.participants.filter((participant) => {
      const code = adminData.codes.find((item) => item.participant?.id === participant.id);
      return (
        String(participant.display_name ?? "").toLowerCase().includes(query) ||
        String(code?.code ?? "").toLowerCase().includes(query)
      );
    });
  }, [adminData.participants, adminData.codes, participantSearch]);

  const participantsWithoutTips = useMemo(() => {
    const withTips = new Set((adminData.tips ?? []).map((tip) => tip.participant_id));
    return adminData.participants.filter((participant) => !withTips.has(participant.id));
  }, [adminData.participants, adminData.tips]);

  function printRanking() {
    if (sortedAdminRanking.length === 0) {
      setAdminMessage("Noch keine Rangliste zum Drucken vorhanden.");
      return;
    }
    flushSync(() => setPrintMode("ranking"));
    window.print();
  }

  const unresolvedTopScorers = useMemo(() => {
    const rows = new Map();
    (adminData.bonusTips ?? []).forEach((tip) => {
      const text = String(tip.top_scorer || "").trim();
      if (!text || tip.top_scorer_player_id || findPlayerByText(adminData.players ?? [], text)) return;
      const current = rows.get(normalizePlayerName(text)) ?? { text, count: 0 };
      current.count += 1;
      rows.set(normalizePlayerName(text), current);
    });
    return [...rows.values()].sort((first, second) => second.count - first.count || first.text.localeCompare(second.text, "de"));
  }, [adminData.bonusTips, adminData.players]);

  const sortedResultMatches = useMemo(() => {
    const now = Date.now();

    return matches
      .map((match) => {
        const result = resultsByMatch.get(match.id);
        const kickoffTime = match.kickoffAt
          ? new Date(match.kickoffAt).getTime()
          : new Date(`${match.date}T${match.time}:00`).getTime();
        const isFinal = result?.status === "final";
        const hasStarted = kickoffTime <= now;

        return {
          ...match,
          result,
          kickoffTime,
          isFinal,
          hasStarted,
        };
      })
      .filter((match) => {
        if (resultFilter === "started") return match.hasStarted && !match.isFinal;
        if (resultFilter === "all") return true;
        return !match.isFinal;
      })
      .sort((first, second) => {
        const firstRank = first.isFinal ? 2 : first.hasStarted ? 0 : 1;
        const secondRank = second.isFinal ? 2 : second.hasStarted ? 0 : 1;

        if (firstRank !== secondRank) return firstRank - secondRank;
        return first.kickoffTime - second.kickoffTime || first.matchNumber - second.matchNumber;
      });
  }, [matches, resultsByMatch, resultFilter]);

  const koAdminMatches = useMemo(
    () =>
      matches
        .filter(isKnockoutPhase)
        .sort((first, second) => (first.matchNumber ?? 0) - (second.matchNumber ?? 0)),
    [matches],
  );

  async function submitLogin(event) {
    event.preventDefault();
    try {
      await onLogin(email, password);
      setAdminMessage("Admin angemeldet.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function createCodes() {
    try {
      await onCreateCodes(codeCount);
      setAdminMessage(`${codeCount} QR-Codes erstellt.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function createParticipant() {
    try {
      const payload = await onCreateParticipant(newParticipantName);
      setNewParticipantName("");
      setAdminMessage(`Nutzer ${payload.participant.display_name} erstellt: ${payload.code.code}`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function saveResult(matchId) {
    const draft = resultDrafts[matchId] ?? {};
    const current = resultsByMatch.get(matchId);
    const scoreA = draft.scoreA ?? current?.score_a ?? 0;
    const scoreB = draft.scoreB ?? current?.score_b ?? 0;
    const winner = draft.winner ?? current?.winner ?? null;
    try {
      await onSaveResult(matchId, scoreA, scoreB, scoreA === scoreB ? winner : null);
      setAdminMessage("Ergebnis gespeichert.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function resolveKnockout() {
    if (!onResolveKnockout) return;
    try {
      const payload = await onResolveKnockout(knockoutOverrides);
      setAdminMessage(
        `K.o.-Paarungen aufgelöst: ${payload?.resolved ?? 0} von ${payload?.updated ?? 0} Spielen mit echten Teams.`,
      );
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function toggleKoVisible() {
    if (!onToggleKoVisible) return;
    const next = !koVisible;
    if (next && !window.confirm("K.o.-Phase für ALLE Teilnehmer sichtbar und tippbar schalten?")) return;
    try {
      await onToggleKoVisible(next);
      setAdminMessage(next ? "K.o.-Phase ist jetzt für alle sichtbar." : "K.o.-Phase ist wieder nur für Admins sichtbar.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function deleteParticipant(participantId, displayName) {
    if (!window.confirm(`${displayName} wirklich löschen? Die Tipps und der QR-Code werden entfernt.`)) {
      return;
    }

    try {
      await onDeleteParticipant(participantId);
      setAdminMessage(`${displayName} wurde gelöscht.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function startRenameParticipant(participant) {
    setEditingParticipantId(participant.id);
    setParticipantNameDraft(participant.display_name);
  }

  async function saveParticipantName(participantId) {
    try {
      const payload = await onRenameParticipant(participantId, participantNameDraft);
      setEditingParticipantId(null);
      setParticipantNameDraft("");
      setAdminMessage(`Name geändert zu ${payload.participant.display_name}.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function deleteCode(codeId, code) {
    if (!window.confirm(`${code} wirklich löschen? Dieser QR-Code kann danach nicht mehr benutzt werden.`)) {
      return;
    }

    try {
      await onDeleteCode(codeId);
      setAdminMessage(`${code} wurde gelöscht.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  const visibleCodes = adminData.codes;
  const printableCodes = visibleCodes.filter((code) => selectedCodeIds.includes(code.id));
  const printableTipSheetParticipants = adminData.participants.filter((participant) =>
    selectedTipSheetParticipantIds.includes(participant.id),
  );

  function togglePrintCode(codeId) {
    setSelectedCodeIds((current) =>
      current.includes(codeId)
        ? current.filter((id) => id !== codeId)
        : [...current, codeId],
    );
  }

  function selectAllVisibleCodes() {
    setSelectedCodeIds(visibleCodes.map((code) => code.id));
  }

  function printSelectedCodes() {
    if (printableCodes.length === 0) {
      setAdminMessage("Bitte erst QR-Codes zum Drucken auswählen.");
      return;
    }
    flushSync(() => setPrintMode("codes"));
    window.print();
  }

  function toggleTipSheetParticipant(participantId) {
    setSelectedTipSheetParticipantIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId],
    );
  }

  function selectAllTipSheetParticipants() {
    setSelectedTipSheetParticipantIds(adminData.participants.map((participant) => participant.id));
  }

  async function printSelectedTipSheets() {
    if (printableTipSheetParticipants.length === 0) {
      setAdminMessage("Bitte erst Teilnehmer für Tippbögen auswählen.");
      return;
    }

    const qrEntries = await Promise.all(
      printableTipSheetParticipants.map(async (participant) => {
        const code = adminData.codes.find((item) => item.participant?.id === participant.id);
        if (!code?.code) return [participant.id, ""];
        return [participant.id, await createQrCodeDataUrl(getInviteUrl(code.code))];
      }),
    );

    flushSync(() => setPrintTipQrCodes(Object.fromEntries(qrEntries)));
    flushSync(() => setPrintMode("tip-sheets"));
    window.print();
  }

  function openParticipant(participant) {
    const existingTips = adminData.tips.filter((tip) => tip.participant_id === participant.id);
    const existingBonusTip = adminData.bonusTips?.find((tip) => tip.participant_id === participant.id);
    const drafts = Object.fromEntries(
      matches.map((match) => {
        const tip = existingTips.find((item) => item.match_id === match.id);
        return [
          match.id,
          {
            scoreA: Number.isInteger(tip?.score_a) ? tip.score_a : null,
            scoreB: Number.isInteger(tip?.score_b) ? tip.score_b : null,
            saved: Boolean(tip),
          },
        ];
      }),
    );
    setSelectedParticipant(participant);
    setParticipantTipDrafts(drafts);
    setParticipantBonusDraft(createInitialBonusTips(matches, existingBonusTip, players));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveSelectedParticipantTips(matchIds) {
    if (!selectedParticipant) return;
    const completeMatchIds = matchIds.filter((matchId) => isCompleteTip(participantTipDrafts[matchId]));
    if (completeMatchIds.length === 0) {
      setAdminMessage("Bitte erst beide Torzahlen eintragen. Leere Tipps bleiben -:-.");
      return;
    }
    try {
      const payload = await onSaveParticipantTips(
        selectedParticipant.id,
        completeMatchIds.map((matchId) => ({
          matchId,
          scoreA: participantTipDrafts[matchId].scoreA,
          scoreB: participantTipDrafts[matchId].scoreB,
        })),
      );
      const savedIds = new Set((payload.tips ?? []).map((tip) => tip.match_id));
      setParticipantTipDrafts((current) => {
        const next = { ...current };
        savedIds.forEach((matchId) => {
          next[matchId] = { ...next[matchId], saved: true };
        });
        return next;
      });
      setAdminMessage(`Tipps für ${selectedParticipant.display_name} gespeichert.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function saveSelectedParticipantBonusTips() {
    if (!selectedParticipant) return;
    try {
      const payload = await onSaveParticipantBonusTips(selectedParticipant.id, {
        champion: participantBonusDraft.champion,
        topScorer: participantBonusDraft.topScorer,
        topScorerPlayerId: participantBonusDraft.topScorerPlayerId,
        groupWinners: participantBonusDraft.groupWinners,
      });
      setParticipantBonusDraft(createInitialBonusTips(matches, payload.bonusTip, players));
      setAdminMessage(`Bonus-Tipps für ${selectedParticipant.display_name} gespeichert.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function saveOfficialBonusResults() {
    try {
      const payload = await onSaveBonusResults(bonusResultDraft);
      setBonusResultDraft(createInitialBonusResults(matches, payload.bonusResults, players));
      setAdminMessage("Offizielle Bonus-Ergebnisse gespeichert.");
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function previewOfficialResults() {
    setOfficialLoading(true);
    try {
      const payload = await onPreviewOfficialResults();
      setOfficialPreview(payload);
      setAdminMessage(
        payload.candidates.length
          ? `${payload.candidates.length} offizielle Ergebnisse gefunden. Bitte prüfen und übernehmen.`
          : "Keine fertigen offiziellen Ergebnisse gefunden.",
      );
    } catch (error) {
      setOfficialPreview(null);
      setAdminMessage(error.message);
    } finally {
      setOfficialLoading(false);
    }
  }

  async function importOfficialResults() {
    const candidates = officialPreview?.candidates?.filter((candidate) => !candidate.alreadySaved) ?? [];
    if (candidates.length === 0) {
      setAdminMessage("Es gibt gerade keine neuen Ergebnisse zum Übernehmen.");
      return;
    }

    setOfficialLoading(true);
    try {
      const payload = await onImportOfficialResults(candidates.map((candidate) => candidate.matchId));
      setOfficialPreview(payload);
      setAdminMessage(`${payload.imported?.length ?? 0} Ergebnisse übernommen.`);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setOfficialLoading(false);
    }
  }

  function useGroupLeaderSuggestions() {
    setBonusResultDraft((current) => ({
      ...current,
      groupWinners: {
        ...current.groupWinners,
        ...getGroupLeaderSuggestions(groupTables),
      },
    }));
  }

  async function savePlayerDraft() {
    try {
      const payload = await onSavePlayer(playerDraft);
      setPlayerDraft({ displayName: "", teamName: "", aliases: "", active: true });
      setAdminMessage(`Spieler ${payload.player.display_name} gespeichert.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function mapTopScorerText(text, playerId) {
    try {
      const payload = await onMapTopScorer(text, playerId);
      setAdminMessage(`${payload.bonusTips?.length ?? 0} Torschützen-Tipps zugeordnet.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function loadBundesligaData() {
    setBundesligaLoading(true);
    try {
      const payload = await apiGetWithAuth("/api/admin-bundesliga-data", session?.access_token);
      setBundesligaData(payload);
    } catch (error) {
      setBundesligaMessage(error.message);
    } finally {
      setBundesligaLoading(false);
    }
  }

  async function runBundesligaAction(action, body = {}) {
    setBundesligaLoading(true);
    try {
      const payload = await apiPost("/api/admin-bundesliga-test-actions", { action, ...body }, session?.access_token);
      await loadBundesligaData();
      return payload;
    } catch (error) {
      setBundesligaMessage(error.message);
      return null;
    } finally {
      setBundesligaLoading(false);
    }
  }

  async function importBundesliga(includeRelegation) {
    setBundesligaLoading(true);
    try {
      const payload = await apiPost("/api/admin-bundesliga-import", { includeRelegation }, session?.access_token);
      setBundesligaMessage(`${payload.importedMatches} Spiele, ${payload.importedTeams} Teams, ${payload.importedGoals} Tore und ${payload.importedTopScorers ?? 0} Torschützen importiert.`);
      await loadBundesligaData();
    } catch (error) {
      setBundesligaMessage(error.message);
    } finally {
      setBundesligaLoading(false);
    }
  }

  if (!session) {
    return (
      <section className="admin-panel panel">
        <header className="admin-hero">
          <ShieldCheck size={34} />
          <div>
            <h2>Admin-Login</h2>
            <p>Mit dem Admin-Zugang kannst du Codes, Teilnehmer, Tipps und Ergebnisse verwalten.</p>
          </div>
        </header>
        <form className="admin-login" onSubmit={submitLogin}>
          <label>
            E-Mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
          </label>
          <label>
            Passwort
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          <button className="primary-button">Einloggen</button>
        </form>
        {adminMessage && <p className="admin-message">{adminMessage}</p>}
      </section>
    );
  }

  const wmAdminTabs = [
    { id: "overview", label: "Übersicht", Icon: House },
    { id: "results", label: "Ergebnisse", Icon: ListFilter },
    { id: "participants", label: "Teilnehmer", Icon: UsersRound },
    { id: "codes", label: "Codes", Icon: QrCode },
    { id: "bonus", label: "Bonus & Spieler", Icon: ShieldCheck },
  ];

  return (
    <section className="admin-panel panel">
      <header className="admin-hero">
        <ShieldCheck size={34} />
        <div>
          <h2>{isBundesligaAdmin ? "Bundesliga-Admin" : "Adminbereich"}</h2>
          <p>
            {isBundesligaAdmin
              ? "Versteckte Bundesliga-Version vorbereiten, bevor sie öffentlich wird."
              : "QR-Codes erzeugen, Teilnehmer ansehen und Spielergebnisse eintragen."}
          </p>
        </div>
      </header>

      <section className="admin-competition-switch" aria-label="Admin-Version auswählen">
        <div>
          <span>Aktive Admin-Ansicht</span>
          <strong>{isBundesligaAdmin ? competitions.bundesliga.adminLabel : competitions.wm2026.adminLabel}</strong>
        </div>
        <div className="segmented-control">
          <button
            type="button"
            className={!isBundesligaAdmin ? "active" : ""}
            onClick={() => setAdminCompetition(competitions.wm2026.id)}
          >
            WM 2026
          </button>
          <button
            type="button"
            className={isBundesligaAdmin ? "active" : ""}
            onClick={() => setAdminCompetition(competitions.bundesliga.id)}
          >
            Bundesliga
          </button>
        </div>
      </section>

      {!isBundesligaAdmin && (
        <section className="admin-competition-switch" aria-label="WM-Betriebsmodus auswählen">
          <div>
            <span>WM-Betriebsmodus</span>
            <strong>{isWmTestAdmin ? "Testmodus" : "Livebetrieb"}</strong>
          </div>
          <div className="segmented-control">
            <button
              type="button"
              className={!isWmTestAdmin ? "active" : ""}
              onClick={() => setWmAdminMode("live")}
            >
              Livebetrieb
            </button>
            <button
              type="button"
              className={isWmTestAdmin ? "active" : ""}
              onClick={() => setWmAdminMode("test")}
            >
              Testmodus
            </button>
          </div>
        </section>
      )}

      {isBundesligaAdmin && (
        <BundesligaAdminArea
          data={bundesligaData}
          loading={bundesligaLoading}
          message={bundesligaMessage}
          onRefresh={loadBundesligaData}
          onImport={importBundesliga}
          onCreateDemoParticipant={async (displayName) => {
            const payload = await runBundesligaAction("create-demo-participant", { displayName });
            if (payload?.participant) setBundesligaMessage(`Demo-Tipper ${payload.participant.display_name} angelegt.`);
          }}
          onCreateInviteCodes={async () => {
            const payload = await runBundesligaAction("create-invite-codes", { count: 10 });
            if (payload) setBundesligaMessage(`${payload.codes?.length ?? 0} Bundesliga-Codes erzeugt.`);
          }}
          onCreateParticipant={async (displayName) => {
            const payload = await runBundesligaAction("create-participant", { displayName });
            if (payload?.participant && payload?.code) {
              setBundesligaMessage(`Teilnehmer ${payload.participant.display_name} erstellt: ${payload.code.code}`);
            }
            return payload;
          }}
          onDeleteInviteCode={async (codeId, code) => {
            if (!window.confirm(`${code} wirklich löschen? Dieser Bundesliga-Code kann danach nicht mehr benutzt werden.`)) return;
            const payload = await runBundesligaAction("delete-invite-code", { codeId });
            if (payload?.deletedCodeId) setBundesligaMessage(`${code} wurde gelöscht.`);
          }}
          onGenerateDemoTips={async () => {
            const payload = await runBundesligaAction("generate-demo-tips");
            if (payload) setBundesligaMessage(`${payload.tips?.length ?? 0} Demo-Tipps gespeichert.`);
          }}
          onRunReleaseProbe={async () => {
            const payload = await runBundesligaAction("run-release-probe");
            if (payload?.releaseProbe) {
              setBundesligaMessage(`Release-Probelauf vorbereitet: ${payload.releaseProbe.participants.length} Teilnehmer, ${payload.releaseProbe.savedTips} Tipps, ${payload.releaseProbe.importedResults} Ergebnisse.`);
            }
            return payload;
          }}
          onResetReleaseProbe={async () => {
            if (!window.confirm("Nur Release Test 1-3 samt Tipps, Bonus und Codes löschen? Spielplan, Ergebnisse und echte Teilnehmer bleiben erhalten.")) return null;
            const payload = await runBundesligaAction("reset-release-probe");
            if (payload?.resetReleaseProbe) {
              setBundesligaMessage(`Release-Testdaten gelöscht: ${payload.resetReleaseProbe.deletedParticipants} Teilnehmer, ${payload.resetReleaseProbe.deletedInviteCodes} Codes.`);
            }
            return payload;
          }}
          onResetTestlabData={async () => {
            if (!window.confirm("Diagnose- und Demo-Daten löschen? Entfernt Demo-Tipper, Demo-Tipps, Release-Testdaten, Ergebnisse, Goal-Events und Bonus-Ergebnisse. Spielplan, Teams/Logos, Torschützen, echte Teilnehmer und echte Codes bleiben erhalten.")) return null;
            const payload = await runBundesligaAction("reset-testlab-data");
            if (payload?.resetTestlabData) {
              const reset = payload.resetTestlabData;
              setBundesligaMessage(`Diagnose bereinigt: ${reset.deletedDemoParticipants} Demo-Tipper, ${reset.deletedDemoTips} Demo-Tipps, ${reset.deletedResults} Ergebnisse, ${reset.deletedGoals} Goal-Events gelöscht.`);
            }
            return payload;
          }}
          onResetSeasonFoundation={async () => {
            if (!window.confirm("Bundesliga-Grunddaten 2026/2027 wirklich löschen? Entfernt Spielplan, Teams/Logos, Ergebnisse, Goals, Torschützen und alle daran hängenden Bundesliga-Tipps/Bonuswerte. Echte Teilnehmer und Codes bleiben erhalten.")) return null;
            const payload = await runBundesligaAction("reset-season-foundation");
            if (payload?.resetSeasonFoundation) {
              const reset = payload.resetSeasonFoundation;
              setBundesligaMessage(`Bundesliga-Grunddaten gelöscht: ${reset.deletedMatches} Spiele, ${reset.deletedTeams} Teams, ${reset.deletedTopScorers} Torschützen, ${reset.deletedParticipantTips} Tipps.`);
            }
            return payload;
          }}
          onImportResults={async (throughMatchday) => {
            const payload = await runBundesligaAction("import-results", { throughMatchday });
            if (payload) setBundesligaMessage(`Ergebnisse bis Spieltag ${payload.throughMatchday} importiert.`);
          }}
          onResetResults={async () => {
            if (!window.confirm("Importierte Bundesliga-Ergebnisse wirklich zurücksetzen? Teilnehmer und Codes bleiben erhalten, ausgewertete Spieltage werden jedoch wieder offen.")) return null;
            const payload = await runBundesligaAction("reset-results");
            if (payload) setBundesligaMessage("Bundesliga-Test-Ergebnisse zurückgesetzt.");
          }}
          onImportTopScorers={async () => {
            const payload = await runBundesligaAction("import-top-scorers");
            if (payload) setBundesligaMessage(`${payload.topScorers?.length ?? 0} OpenLigaDB-Torschützen importiert.`);
          }}
          onSaveTopScorer={async (id, displayName, teamName) => {
            const payload = await runBundesligaAction("save-top-scorer", { id, displayName, teamName });
            if (payload?.topScorer) setBundesligaMessage(`Torschütze ${payload.topScorer.display_name} gespeichert.`);
          }}
          onRenameParticipant={async (participantId, displayName) => {
            const payload = await runBundesligaAction("rename-participant", { participantId, displayName });
            if (payload?.participant) setBundesligaMessage(`Teilnehmer ${payload.participant.display_name} gespeichert.`);
          }}
          onDeleteParticipant={async (participantId, displayName) => {
            if (!window.confirm(`${displayName} wirklich aus der Bundesliga löschen?`)) return;
            const payload = await runBundesligaAction("delete-participant", { participantId });
            if (payload) setBundesligaMessage(`${displayName} gelöscht.`);
          }}
          onSaveParticipantTip={async (participantId, matchId, scoreA, scoreB) => {
            const payload = await runBundesligaAction("save-participant-tip", { participantId, matchId, scoreA, scoreB });
            if (payload?.tip) setBundesligaMessage("Teilnehmer-Tipp gespeichert.");
          }}
          onSaveParticipantBonus={async (participantId, bonusTip) => {
            const payload = await runBundesligaAction("save-participant-bonus", { participantId, ...bonusTip });
            if (payload?.bonusTip) setBundesligaMessage("Teilnehmer-Bonus gespeichert.");
          }}
          onSaveBonusResults={async (bonusResults) => {
            const payload = await runBundesligaAction("save-bonus-results", bonusResults);
            if (payload?.bonusResults) setBundesligaMessage("Offizielle Bundesliga-Bonus-Ergebnisse gespeichert.");
          }}
          onSetCompetitionStatus={async (status, publicEnabled) => {
            if (publicEnabled && !window.confirm("Bundesliga 2026/2027 jetzt öffentlich freigeben? Danach ist die Teilnehmeransicht ohne Vorschauzugang sichtbar.")) return null;
            const payload = await runBundesligaAction("set-competition-status", { status, publicEnabled });
            if (payload?.competition) setBundesligaMessage("Bundesliga-Status gespeichert.");
          }}
          onSaveReleaseSettings={async (settings) => {
            const payload = await runBundesligaAction("save-release-settings", settings);
            if (payload?.competition) setBundesligaMessage("Release-Konfiguration gespeichert.");
          }}
          onSetLiveUpdatesPaused={async (paused) => {
            const payload = await runBundesligaAction("set-live-updates-paused", { paused });
            if (payload?.competition) setBundesligaMessage(paused ? "Live-Aktualisierung der Saison pausiert." : "Live-Aktualisierung der Saison fortgesetzt.");
          }}
          onRefreshLiveNow={async () => {
            const payload = await runBundesligaAction("refresh-live-now");
            if (payload?.update) setBundesligaMessage(payload.update.skipped ? payload.update.reason : "Saison-Livestände aktualisiert.");
          }}
          onBackToWorldCup={() => setAdminCompetition(competitions.wm2026.id)}
        />
      )}

      {isWmTestAdmin && (
        <WmTestAdminArea
          data={wmTestData}
          loading={wmTestLoading}
          matches={matches}
          teamOptions={teamOptions}
          players={players}
          groupTables={groupTables}
          onRefresh={onRefreshWmTestData}
          onSaveResult={onSaveWmTestResult}
          onSaveBonusResults={onSaveWmTestBonusResults}
          onGenerateResults={async () => {
            if (!window.confirm("Demo-Ergebnisse für ALLE Spiele erzeugen? Vorhandene Sandbox-Ergebnisse werden überschrieben.")) return null;
            return onGenerateWmTestResults();
          }}
          onReset={async () => {
            if (!window.confirm("WM-Testmodus wirklich zurücksetzen? Nur Sandbox-Ergebnisse und Sandbox-Bonuswerte werden gelöscht.")) return null;
            return onResetWmTest();
          }}
        />
      )}

      {!isBundesligaAdmin && !isWmTestAdmin && (
        <>
      <div className="admin-actions">
        <button type="button" className="ghost-button" onClick={onRefresh}>Daten aktualisieren</button>
        <button type="button" className="ghost-button" onClick={onLogout}>Admin abmelden</button>
      </div>

      {adminMessage && <p className="admin-message">{adminMessage}</p>}

      {!selectedParticipant && (
        <>
      <nav className="admin-tab-nav" aria-label="Adminbereiche">
        {wmAdminTabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={wmAdminView === id ? "active" : ""}
            onClick={() => setWmAdminView(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      {wmAdminView === "overview" && (
        <>
      <div className="admin-stats">
        <strong>{adminData.codes.length}<span>QR-Codes</span></strong>
        <strong>{adminData.participants.length}<span>Teilnehmer</span></strong>
        <strong>{adminData.tipCount ?? adminData.tips.length}<span>Tipps</span></strong>
      </div>

      <section className="admin-live-ranking">
        <div className="admin-ranking-head">
          <h3>Rangliste</h3>
          <button
            type="button"
            className="primary-button compact"
            onClick={printRanking}
            disabled={sortedAdminRanking.length === 0}
          >
            Rangliste drucken
          </button>
        </div>
        <p className="fine-print">
          Aktuelle Platzierung aller echten Teilnehmer. Über „Rangliste drucken" entsteht eine saubere A4-Druckansicht.
        </p>
        {adminRankingStatus === "error" && (
          <p className="fine-print">Rangliste konnte gerade nicht geladen werden. Bitte „Daten aktualisieren".</p>
        )}
        {sortedAdminRanking.length === 0 ? (
          <p className="fine-print">Sobald die ersten Ergebnisse ausgewertet sind, erscheint hier die Rangliste.</p>
        ) : (
          <RankingPanel ranking={sortedAdminRanking} expanded />
        )}
      </section>
        </>
      )}

      {wmAdminView === "bonus" && (
        <>
      <section className="admin-bonus-editor player-admin-panel">
        <h3>Torschützenkönig-Spieler</h3>
        <p className="fine-print">
          Diese Liste steuert die Auswahl im Bonusbereich. Aliasnamen helfen dabei, alte Freitext-Tipps zuzuordnen.
        </p>
        <div className="player-admin-form">
          <input
            value={playerDraft.displayName}
            onChange={(event) => setPlayerDraft((current) => ({ ...current, displayName: event.target.value }))}
            placeholder="Spielername"
          />
          <select
            value={playerDraft.teamName}
            onChange={(event) => setPlayerDraft((current) => ({ ...current, teamName: event.target.value }))}
          >
            <option value="">Team optional</option>
            {teamOptions.map((team) => (
              <option key={team.name} value={team.name}>{team.name}</option>
            ))}
          </select>
          <input
            value={playerDraft.aliases}
            onChange={(event) => setPlayerDraft((current) => ({ ...current, aliases: event.target.value }))}
            placeholder="Aliasnamen, getrennt mit Komma"
          />
          <label className="player-active-toggle">
            <input
              type="checkbox"
              checked={playerDraft.active}
              onChange={(event) => setPlayerDraft((current) => ({ ...current, active: event.target.checked }))}
            />
            Aktiv
          </label>
          <button type="button" className="primary-button compact" onClick={savePlayerDraft} disabled={playerDraft.displayName.trim().length < 2}>
            Spieler speichern
          </button>
        </div>
        <div className="player-chip-list">
          {(adminData.players ?? []).map((player) => (
            <button
              type="button"
              key={player.id}
              className={`player-chip ${player.active ? "" : "inactive"}`}
              onClick={() => setPlayerDraft({
                id: player.id,
                displayName: player.display_name,
                teamName: player.team_name ?? "",
                aliases: (player.aliases ?? []).join(", "),
                active: player.active,
              })}
            >
              {playerLabel(player)}
            </button>
          ))}
        </div>
        {unresolvedTopScorers.length > 0 && (
          <div className="unresolved-top-scorers">
            <strong>Nicht zugeordnete Freitext-Tipps</strong>
            {unresolvedTopScorers.map((row) => (
              <label key={row.text}>
                <span>{row.text} ({row.count}x)</span>
                <select defaultValue="" onChange={(event) => event.target.value && mapTopScorerText(row.text, event.target.value)}>
                  <option value="">Spieler zuordnen</option>
                  {activePlayers.map((player) => (
                    <option key={player.id} value={player.id}>{playerLabel(player)}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="admin-bonus-editor">
        <h3>Offizielle Bonus-Ergebnisse</h3>
        <p className="fine-print">
          Diese Werte werden für die Bonuspunkte in der Rangliste genutzt.
          Gruppensieger können aus den aktuellen Tabellen vorgeschlagen und danach geprüft werden.
        </p>
        <div className="bonus-select-grid">
          <label>
            Weltmeister
            <select
              value={bonusResultDraft.champion}
              onChange={(event) =>
                setBonusResultDraft((current) => ({ ...current, champion: event.target.value }))
              }
            >
              <option value="">Bitte wählen</option>
              {teamOptions.map((team) => (
                <option key={team.name} value={team.name}>{team.name}</option>
              ))}
            </select>
          </label>
          <label>
            Torschützenkönig
            <PlayerSelect
              players={activePlayers}
              value={bonusResultDraft.topScorerPlayerIds}
              fallbackText={bonusResultDraft.topScorer}
              multiple
              onChange={(playerIds, selectedPlayers) =>
                setBonusResultDraft((current) => ({
                  ...current,
                  topScorerPlayerIds: playerIds,
                  topScorer: selectedPlayers.map((player) => player.display_name).join(", "),
                }))
              }
            />
          </label>
        </div>
        <div className="group-winner-grid">
          {groupTables.map((group) => (
            <label key={group.groupKey}>
              Gruppe {group.groupKey}
              <select
                value={bonusResultDraft.groupWinners?.[group.groupKey] ?? ""}
                onChange={(event) =>
                  setBonusResultDraft((current) => ({
                    ...current,
                    groupWinners: {
                      ...current.groupWinners,
                      [group.groupKey]: event.target.value,
                    },
                  }))
                }
              >
                <option value="">Bitte wählen</option>
                {group.teams.map((team) => (
                  <option key={team.name} value={team.name}>{team.name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="admin-actions inline-actions">
          <button type="button" className="ghost-button" onClick={useGroupLeaderSuggestions}>
            Gruppensieger aus Tabellen übernehmen
          </button>
          <button type="button" className="primary-button compact" onClick={saveOfficialBonusResults}>
            Bonus-Ergebnisse speichern
          </button>
        </div>
      </section>
        </>
      )}

      {wmAdminView === "codes" && (
        <>
      <div className="admin-create">
        <label>
          Freie QR-/Anmeldecodes erzeugen
          <input
            type="number"
            min="1"
            max="100"
            value={codeCount}
            onChange={(event) => setCodeCount(Number(event.target.value))}
          />
        </label>
        <button type="button" className="primary-button compact" onClick={createCodes}>Codes erzeugen</button>
      </div>

      <h3>QR-Codes</h3>
      <p className="fine-print">
        Diese QR-Codes können mit der Handykamera gescannt werden. Die Nummer
        darunter kann am PC manuell eingegeben werden.
      </p>
      <button
        type="button"
        className="ghost-button qr-toggle"
        onClick={() => setCodesExpanded((current) => !current)}
      >
        {codesExpanded ? "QR-Codes einklappen" : `QR-Codes anzeigen (${visibleCodes.length})`}
      </button>
      {codesExpanded && <div className="print-actions">
        <button type="button" className="ghost-button" onClick={selectAllVisibleCodes}>
          Sichtbare auswählen
        </button>
        <button type="button" className="ghost-button" onClick={() => setSelectedCodeIds([])}>
          Auswahl leeren
        </button>
        <button type="button" className="primary-button compact" onClick={printSelectedCodes}>
          Ausgewählte QR-Codes drucken
        </button>
      </div>}
      {codesExpanded && <div className="admin-grid">
        {visibleCodes.map((row) => (
          <article key={row.id} className={`code-card ${row.status}`}>
            <label className="print-select">
              <input
                type="checkbox"
                checked={selectedCodeIds.includes(row.id)}
                onChange={() => togglePrintCode(row.id)}
              />
              Drucken
            </label>
            <QrCodeImage value={getInviteUrl(row.code)} />
            <strong>{row.code}</strong>
            <span>{row.participant?.display_name || codeStatusLabels[row.status] || row.status}</span>
            <small>{getInviteUrl(row.code)}</small>
            {row.status === "free" && !row.participant && (
              <button type="button" className="danger-button code-delete" onClick={() => deleteCode(row.id, row.code)}>
                Code löschen
              </button>
            )}
          </article>
        ))}
      </div>}
        </>
      )}

      <section className={`print-sheet ${printMode}`} aria-hidden="true">
        {printMode === "ranking" && (
          <article className="print-ranking">
            <header>
              <img src="/oesterfeld-logo-round.jpg" alt="" />
              <div>
                <span>WM-Tippspiel · Österfeld-Edition</span>
                <strong>Rangliste</strong>
                <small>Stand: {new Date().toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" })}</small>
              </div>
            </header>
            <table className="print-ranking-table">
              <thead>
                <tr>
                  <th>Pl.</th>
                  <th>Name</th>
                  <th>Tipps</th>
                  <th>Spielpunkte</th>
                  <th>Bonus</th>
                  <th>Gesamt</th>
                </tr>
              </thead>
              <tbody>
                {sortedAdminRanking.map((row, index) => (
                  <tr key={row.id ?? row.name}>
                    <td>{index + 1}</td>
                    <td>{row.name}</td>
                    <td>{row.tipCount ?? 0}</td>
                    <td>{row.matchPoints ?? row.points ?? 0}</td>
                    <td>{row.bonusPoints ?? 0}</td>
                    <td>{row.points ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer>{sortedAdminRanking.length} Teilnehmer · WM-Tippspiel Österfeld-Edition</footer>
          </article>
        )}
        {printMode === "codes" && printableCodes.map((row) => (
          <article className="print-code-card" key={row.id}>
            <header>
              <img src="/oesterfeld-logo-round.jpg" alt="" />
              <div>
                <span>WM-Tippspiel</span>
                <strong>Österfeld-Edition</strong>
              </div>
            </header>
            <img className="ticket-watermark" src="/oesterfeld-logo-round.jpg" alt="" />
            <QrCodeImage value={getInviteUrl(row.code)} />
            <div className="print-code-main">
              <span>{row.participant?.display_name || codeStatusLabels[row.status] || row.status}</span>
              <strong>{row.code}</strong>
              <small>{getInviteUrl(row.code)}</small>
            </div>
            <ol>
              <li>Handykamera öffnen und QR-Code scannen.</li>
              <li>Namen eintragen oder direkt loslegen.</li>
              <li>Am PC: wmtipp.netlify.app öffnen und diesen Code eingeben.</li>
            </ol>
          </article>
        ))}
        {printMode === "tip-sheets" && printableTipSheetParticipants.flatMap((participant) => {
          const code = adminData.codes.find((item) => item.participant?.id === participant.id);
          return chunkArray(matches, 24).map((pageMatches, pageIndex, pages) => (
            <article className="print-tip-sheet" key={`${participant.id}-${pageIndex}`}>
              <header>
                <img src="/oesterfeld-logo-round.jpg" alt="" />
                <div>
                  <span>WM-Tippspiel · Offline-Tippbogen</span>
                  <strong>{participant.display_name}</strong>
                  <small>Code: {code?.code || "ohne Code"} · Seite {pageIndex + 1} / {pages.length}</small>
                </div>
                {code?.code && printTipQrCodes[participant.id] && (
                  <div className="print-tip-qr">
                    <span className="qr-image">
                      <img
                        src={printTipQrCodes[participant.id]}
                        alt={`QR-Code für ${code.code}`}
                      />
                    </span>
                  </div>
                )}
              </header>

              {pageIndex === 0 && (
                <section className="print-bonus-box">
                  <h4>Bonus-Tipps</h4>
                  <div className="print-bonus-main">
                    <label>Weltmeister <span /></label>
                    <label>Torschützenkönig <span /></label>
                  </div>
                  <div className="print-group-winners">
                    {getGroups(matches).map((group) => (
                      <label key={group.groupKey}>Gr. {group.groupKey} <span /></label>
                    ))}
                  </div>
                </section>
              )}

              <section className="print-match-grid">
                {pageMatches.map((match) => (
                  <div className="print-match-row" key={match.id}>
                    <b>{match.matchNumber}</b>
                    <small>{formatNumericDate(match.date)} · {match.time}</small>
                    <span>{displayTeamName(match.teamA)}</span>
                    <i />
                    <em>:</em>
                    <i />
                    <span>{displayTeamName(match.teamB)}</span>
                  </div>
                ))}
              </section>

              <footer>
                Bitte gut lesbar eintragen. Die Tipps werden später im Adminbereich übertragen.
              </footer>
            </article>
          ));
        })}
      </section>

      {wmAdminView === "participants" && (
        <>
      <div className="admin-create participant-create">
        <label>
          Nutzer direkt mit eigenem Code anlegen
          <input
            value={newParticipantName}
            onChange={(event) => setNewParticipantName(event.target.value)}
            placeholder="Name des Kindes / Teilnehmers"
          />
        </label>
        <button
          type="button"
          className="primary-button compact"
          onClick={createParticipant}
          disabled={newParticipantName.trim().length < 2}
        >
          Nutzer + Code erzeugen
        </button>
      </div>

      <section className="admin-without-tips">
        <h3>Noch ohne Tipps ({participantsWithoutTips.length})</h3>
        {participantsWithoutTips.length === 0 ? (
          <p className="fine-print">
            {adminData.participants.length === 0
              ? "Noch keine Teilnehmer angelegt."
              : "Alle Teilnehmer haben mindestens einen Tipp abgegeben."}
          </p>
        ) : (
          <>
            <p className="fine-print">
              Diese Teilnehmer haben noch keinen Spieltipp gespeichert. Antippen, um stellvertretend Tipps einzutragen.
            </p>
            <div className="without-tips-list">
              {participantsWithoutTips.map((participant) => {
                const code = adminData.codes.find((item) => item.participant?.id === participant.id);
                return (
                  <button
                    type="button"
                    key={participant.id}
                    className="without-tips-chip"
                    onClick={() => openParticipant(participant)}
                  >
                    <strong>{participant.display_name}</strong>
                    <span>{code?.code || "ohne Code"}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <h3>Teilnehmer</h3>
      <p className="fine-print">
        Für Kinder ohne Handy kannst du personalisierte Tippbögen drucken und die Ergebnisse später im Adminbereich übertragen.
      </p>
      <div className="print-actions">
        <button type="button" className="ghost-button" onClick={selectAllTipSheetParticipants}>
          Alle Teilnehmer auswählen
        </button>
        <button type="button" className="ghost-button" onClick={() => setSelectedTipSheetParticipantIds([])}>
          Auswahl leeren
        </button>
        <button type="button" className="primary-button compact" onClick={printSelectedTipSheets}>
          Ausgewählte Tippbögen drucken
        </button>
      </div>
      <div className="participant-search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          value={participantSearch}
          onChange={(event) => setParticipantSearch(event.target.value)}
          placeholder="Teilnehmer oder Code suchen..."
          aria-label="Teilnehmer suchen"
        />
        {participantSearch && (
          <button type="button" className="ghost-button compact" onClick={() => setParticipantSearch("")}>
            Zurücksetzen
          </button>
        )}
      </div>
      <div className="participant-list">
        {adminData.participants.length === 0 && (
          <p className="fine-print">Noch keine Teilnehmer angelegt.</p>
        )}
        {filteredAdminParticipants.length === 0 && adminData.participants.length > 0 && (
          <p className="fine-print">Keine Treffer für „{participantSearch}".</p>
        )}
        {filteredAdminParticipants.map((participant) => {
          const code = adminData.codes.find((item) => item.participant?.id === participant.id);
          const bonusTip = adminData.bonusTips?.find((item) => item.participant_id === participant.id);
          const tipCount = new Set(
            adminData.tips
              .filter((tip) => tip.participant_id === participant.id)
              .map((tip) => tip.match_id),
          ).size;

          return (
            <div className="participant-row" key={participant.id}>
              <label className="tip-sheet-select">
                <input
                  type="checkbox"
                  checked={selectedTipSheetParticipantIds.includes(participant.id)}
                  onChange={() => toggleTipSheetParticipant(participant.id)}
                />
                Bogen
              </label>
              {editingParticipantId === participant.id ? (
                <div className="participant-name-editor">
                  <input
                    value={participantNameDraft}
                    onChange={(event) => setParticipantNameDraft(event.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => saveParticipantName(participant.id)}
                    disabled={participantNameDraft.trim().length < 2}
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    className="ghost-button compact"
                    onClick={() => setEditingParticipantId(null)}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <div className="participant-name-cell">
                  <button type="button" className="participant-open" onClick={() => openParticipant(participant)}>
                    {participant.display_name}
                  </button>
                  <button
                    type="button"
                    className="participant-rename"
                    onClick={() => startRenameParticipant(participant)}
                  >
                    Bearbeiten
                  </button>
                </div>
              )}
              <span>{code?.code || "ohne Code"}</span>
              <span className="participant-tip-count">
                {tipCount} / {matches.length} Tipps
              </span>
              <span className={`participant-bonus-count ${isBonusTipStarted(bonusTip) ? "done" : ""}`}>
                Bonus {isBonusTipStarted(bonusTip) ? "angefangen" : "offen"}
              </span>
              <button
                type="button"
                className="danger-button"
                onClick={() => deleteParticipant(participant.id, participant.display_name)}
              >
                Löschen
              </button>
            </div>
          );
        })}
      </div>
        </>
      )}

      {wmAdminView === "results" && (
        <>
      {koAdminMatches.length > 0 && (
        <section className="ko-admin-panel">
          <div className="ko-admin-head">
            <h3>K.o.-Phase</h3>
            <button type="button" className="primary-button compact" onClick={resolveKnockout}>
              Paarungen aus Gruppentabellen auflösen
            </button>
          </div>
          <div className={`ko-visible-toggle ${koVisible ? "on" : ""}`}>
            <div>
              <strong>Sichtbarkeit für Teilnehmer</strong>
              <p className="fine-print">
                {koVisible
                  ? "Die K.o.-Phase ist für alle Teilnehmer sichtbar und tippbar."
                  : "Die K.o.-Phase ist aktuell nur für Admins sichtbar."}
              </p>
            </div>
            <button type="button" className={koVisible ? "ghost-button" : "primary-button compact"} onClick={toggleKoVisible}>
              {koVisible ? "Wieder verstecken" : "Für alle freischalten"}
            </button>
          </div>
          <p className="fine-print">
            Berechnet die Teams aus den finalen Gruppenergebnissen (Sieger, Zweite, beste
            Dritte) und schreibt sie in die K.o.-Spiele. Optionale Korrekturen je Spiel
            unten überschreiben die automatische Zuordnung. Ergebnisse und Sieger bei Remis
            werden im Bereich „Ergebnisse" eingetragen.
          </p>
          <div className="ko-admin-list">
            {koAdminMatches.map((match) => {
              const override = knockoutOverrides[match.id] ?? {};
              return (
                <div className="ko-admin-row" key={match.id}>
                  <span className="ko-admin-tag">
                    {KO_PHASE_LABELS[match.phase] ?? "K.o."} · Spiel {match.matchNumber}
                  </span>
                  <strong>{match.teamA} – {match.teamB}</strong>
                  <div className="ko-admin-override">
                    <input
                      type="text"
                      placeholder="Team A überschreiben"
                      value={override.teamA ?? ""}
                      onChange={(event) =>
                        setKnockoutOverrides((current) => ({
                          ...current,
                          [match.id]: { ...current[match.id], teamA: event.target.value },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Team B überschreiben"
                      value={override.teamB ?? ""}
                      onChange={(event) =>
                        setKnockoutOverrides((current) => ({
                          ...current,
                          [match.id]: { ...current[match.id], teamB: event.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <h3>Ergebnisse</h3>
      <section className="official-results-panel">
        <div>
          <strong>Offizielle Ergebnisse abrufen</strong>
          <p className="fine-print">
            Die Ergebnisse werden erst als Vorschau geladen. Übernommen wird nur nach deiner Bestätigung.
          </p>
        </div>
        <div className="admin-actions inline-actions">
          <button type="button" className="ghost-button" onClick={previewOfficialResults} disabled={officialLoading}>
            Ergebnisse abrufen
          </button>
          <button
            type="button"
            className="primary-button compact"
            onClick={importOfficialResults}
            disabled={officialLoading || !officialPreview?.candidates?.some((candidate) => !candidate.alreadySaved)}
          >
            Gefundene übernehmen
          </button>
        </div>
        {officialPreview && (
          <div className="official-result-preview">
            <span>{officialPreview.source} · {new Date(officialPreview.fetchedAt).toLocaleString("de-DE")}</span>
            {officialPreview.candidates.length === 0 ? (
              <p className="fine-print">Keine fertigen Spiele gefunden, die zum lokalen WM-Plan passen.</p>
            ) : (
              officialPreview.candidates.slice(0, 8).map((candidate) => (
                <div key={candidate.matchId} className={candidate.wouldOverwrite ? "warning" : ""}>
                  <strong>Spiel {candidate.matchNumber}</strong>
                  <span>{displayTeamName(candidate.teamA)} - {displayTeamName(candidate.teamB)}</span>
                  <b>{candidate.scoreA}:{candidate.scoreB}</b>
                  <small>
                    {candidate.alreadySaved
                      ? "schon gespeichert"
                      : candidate.wouldOverwrite
                        ? "würde vorhandenes Ergebnis überschreiben"
                        : "neu"}
                  </small>
                </div>
              ))
            )}
            {officialPreview.unmatched?.length > 0 && (
              <p className="fine-print">
                {officialPreview.unmatched.length} externe Spiele konnten nicht automatisch zugeordnet werden.
              </p>
            )}
          </div>
        )}
      </section>
      <div className="result-toolbar">
        <span>{sortedResultMatches.length} Spiele angezeigt</span>
        <div className="segmented-control">
          <button
            type="button"
            className={resultFilter === "open" ? "active" : ""}
            onClick={() => setResultFilter("open")}
          >
            Offen
          </button>
          <button
            type="button"
            className={resultFilter === "started" ? "active" : ""}
            onClick={() => setResultFilter("started")}
          >
            Gestartet
          </button>
          <button
            type="button"
            className={resultFilter === "all" ? "active" : ""}
            onClick={() => setResultFilter("all")}
          >
            Alle
          </button>
        </div>
      </div>
      <div className="result-list">
        {sortedResultMatches.length === 0 && (
          <p className="fine-print">Aktuell gibt es in dieser Ansicht keine Spiele.</p>
        )}
        {sortedResultMatches.map((match) => {
          const result = resultsByMatch.get(match.id);
          const draft = resultDrafts[match.id] ?? {};
          const scoreA = draft.scoreA ?? result?.score_a ?? 0;
          const scoreB = draft.scoreB ?? result?.score_b ?? 0;
          const isKo = isKnockoutPhase(match);
          const isDraw = Number(scoreA) === Number(scoreB);
          const winner = draft.winner ?? result?.winner ?? null;
          return (
            <div className={`result-row${isKo ? " result-row-ko" : ""}`} key={match.id}>
              <span>Spiel {match.matchNumber}{isKo ? ` · ${KO_PHASE_LABELS[match.phase] ?? "K.o."}` : ""}</span>
              <strong>{match.teamA} - {match.teamB}</strong>
              <small>{formatDate(match.date)} · {match.time} Uhr</small>
              <input
                type="number"
                min="0"
                max="30"
                value={scoreA}
                onChange={(event) =>
                  setResultDrafts((current) => ({
                    ...current,
                    [match.id]: { ...current[match.id], scoreA: Number(event.target.value) },
                  }))
                }
              />
              <input
                type="number"
                min="0"
                max="30"
                value={scoreB}
                onChange={(event) =>
                  setResultDrafts((current) => ({
                    ...current,
                    [match.id]: { ...current[match.id], scoreB: Number(event.target.value) },
                  }))
                }
              />
              {isKo && isDraw && (
                <div className="ko-winner-select" role="group" aria-label="Weiterkommen bei Remis">
                  <button
                    type="button"
                    className={winner === "A" ? "active" : ""}
                    onClick={() =>
                      setResultDrafts((current) => ({
                        ...current,
                        [match.id]: { ...current[match.id], winner: "A" },
                      }))
                    }
                  >
                    {match.teamA} ✓
                  </button>
                  <button
                    type="button"
                    className={winner === "B" ? "active" : ""}
                    onClick={() =>
                      setResultDrafts((current) => ({
                        ...current,
                        [match.id]: { ...current[match.id], winner: "B" },
                      }))
                    }
                  >
                    {match.teamB} ✓
                  </button>
                </div>
              )}
              <button type="button" className="save-tip" onClick={() => saveResult(match.id)}>Speichern</button>
            </div>
          );
        })}
      </div>
        </>
      )}

        </>
      )}

      {selectedParticipant && (
        <section className="participant-editor-page">
          <div className="participant-editor-bar">
            <button type="button" className="ghost-button" onClick={() => setSelectedParticipant(null)}>
              ← Zurück zur Teilnehmerliste
            </button>
          </div>
          <section className="participant-modal participant-editor" role="region" aria-label={`Tipps von ${selectedParticipant.display_name}`}>
            <header>
              <div>
                <h2>{selectedParticipant.display_name}</h2>
                <p>Tipps ansehen oder stellvertretend eintragen.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedParticipant(null)}>
                ×
              </button>
            </header>

            <section className="admin-bonus-editor compact-editor">
              <h3>Bonus-Tipps</h3>
              <div className="bonus-select-grid">
                <label>
                  Weltmeister
                  <select
                    value={participantBonusDraft.champion}
                    onChange={(event) =>
                      setParticipantBonusDraft((current) => ({ ...current, champion: event.target.value, saved: false }))
                    }
                  >
                    <option value="">Bitte wählen</option>
                    {teamOptions.map((team) => (
                      <option key={team.name} value={team.name}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Torschützenkönig
                  <PlayerSelect
                    players={activePlayers}
                    value={participantBonusDraft.topScorerPlayerId}
                    fallbackText={participantBonusDraft.topScorer}
                    onChange={(playerId, player) =>
                      setParticipantBonusDraft((current) => ({
                        ...current,
                        topScorerPlayerId: playerId,
                        topScorer: player?.display_name ?? current.topScorer,
                        saved: false,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="group-winner-grid compact">
                {groupTables.map((group) => (
                  <label key={group.groupKey}>
                    Gruppe {group.groupKey}
                    <select
                      value={participantBonusDraft.groupWinners?.[group.groupKey] ?? ""}
                      onChange={(event) =>
                        setParticipantBonusDraft((current) => ({
                          ...current,
                          saved: false,
                          groupWinners: {
                            ...current.groupWinners,
                            [group.groupKey]: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">Bitte wählen</option>
                      {group.teams.map((team) => (
                        <option key={team.name} value={team.name}>{team.name}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" className="primary-button compact" onClick={saveSelectedParticipantBonusTips}>
                Bonus-Tipps speichern
              </button>
            </section>

            <div className="participant-tip-list">
              {matches.map((match) => {
                const draft = participantTipDrafts[match.id] ?? { scoreA: null, scoreB: null };
                return (
                  <div className="participant-tip-row" key={match.id}>
                    <span>Spiel {match.matchNumber}</span>
                    <strong>{match.teamA} - {match.teamB}</strong>
                    <input
                      type="number"
                      min="0"
                      max="12"
                      placeholder="-"
                      value={Number.isInteger(draft.scoreA) ? draft.scoreA : ""}
                      onChange={(event) =>
                        setParticipantTipDrafts((current) => ({
                          ...current,
                          [match.id]: {
                            ...current[match.id],
                            scoreA: event.target.value === "" ? null : Number(event.target.value),
                            saved: false,
                          },
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="12"
                      placeholder="-"
                      value={Number.isInteger(draft.scoreB) ? draft.scoreB : ""}
                      onChange={(event) =>
                        setParticipantTipDrafts((current) => ({
                          ...current,
                          [match.id]: {
                            ...current[match.id],
                            scoreB: event.target.value === "" ? null : Number(event.target.value),
                            saved: false,
                          },
                        }))
                      }
                    />
                    <button type="button" className="save-tip" onClick={() => saveSelectedParticipantTips([match.id])} disabled={!isCompleteTip(draft)}>
                      {draft.saved ? "Gespeichert" : "Speichern"}
                    </button>
                  </div>
                );
              })}
            </div>

            <footer>
              <button
                type="button"
                className="primary-button compact"
                onClick={() => saveSelectedParticipantTips(matches.map((match) => match.id))}
              >
                Alle Tipps speichern
              </button>
            </footer>
          </section>
        </section>
      )}
        </>
      )}
    </section>
  );
}

function WmTestAdminArea({
  data,
  loading,
  matches,
  teamOptions,
  players,
  groupTables,
  onRefresh,
  onSaveResult,
  onSaveBonusResults,
  onGenerateResults,
  onReset,
}) {
  const [message, setMessage] = useState("");
  const [resultDrafts, setResultDrafts] = useState({});
  const [bonusResultDraft, setBonusResultDraft] = useState(createInitialBonusResults(matches));
  const testResultsByMatch = useMemo(
    () => new Map((data?.testResults ?? []).map((result) => [result.match_id, result])),
    [data?.testResults],
  );
  const liveResultsByMatch = useMemo(
    () => new Map((data?.liveResults ?? []).map((result) => [result.match_id, result])),
    [data?.liveResults],
  );
  const activePlayers = players.filter((player) => player.active !== false);

  useEffect(() => {
    setBonusResultDraft(createInitialBonusResults(matches, data?.testBonusResults, players));
  }, [matches, data?.testBonusResults, players]);

  async function saveTestResult(matchId) {
    const draft = resultDrafts[matchId] ?? {};
    const current = testResultsByMatch.get(matchId);
    try {
      await onSaveResult(matchId, draft.scoreA ?? current?.score_a ?? 0, draft.scoreB ?? current?.score_b ?? 0);
      setMessage("Test-Ergebnis gespeichert. Live-Ergebnisse bleiben unverändert.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveTestBonusResults() {
    try {
      await onSaveBonusResults(bonusResultDraft);
      setMessage("Test-Bonus-Ergebnisse gespeichert. Live-Bonus bleibt unverändert.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function resetSandbox() {
    try {
      const payload = await onReset();
      if (payload !== null) {
        setResultDrafts({});
        setMessage("WM-Testmodus zurückgesetzt.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function generateResults() {
    try {
      const payload = await onGenerateResults();
      if (payload !== null) {
        setResultDrafts({});
        setMessage("Demo-Ergebnisse für alle Spiele erzeugt. Rangliste und Punkte sind jetzt befüllt.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <section className="wm-test-admin">
      <header className="admin-test-banner">
        <div>
          <span>Admin-Sandbox</span>
          <h3>WM-Testmodus</h3>
          <p>Die Rangliste nutzt echte Teilnehmer-Tipps, aber ausschließlich Test-Ergebnisse und Test-Bonuswerte.</p>
        </div>
        <div className="admin-actions inline-actions">
          <button type="button" className="ghost-button" onClick={onRefresh} disabled={loading}>Testdaten aktualisieren</button>
          <button type="button" className="primary-button" onClick={generateResults} disabled={loading}>Demo-Ergebnisse generieren</button>
          <button type="button" className="danger-button" onClick={resetSandbox} disabled={loading}>Testmodus zurücksetzen</button>
        </div>
      </header>

      {message && <p className="admin-message">{message}</p>}

      <div className="admin-stats">
        <strong>{data?.participants?.length ?? 0}<span>echte Teilnehmer</span></strong>
        <strong>{data?.tips?.length ?? 0}<span>echte Tipps</span></strong>
        <strong>{data?.testResults?.length ?? 0}<span>Test-Ergebnisse</span></strong>
      </div>

      <section className="admin-bonus-editor">
        <h3>Test-Bonus-Ergebnisse</h3>
        <p className="fine-print">Diese Werte zählen nur für die Test-Rangliste und schreiben nicht in die offiziellen Bonus-Ergebnisse.</p>
        <div className="bonus-select-grid">
          <label>
            Weltmeister
            <select
              value={bonusResultDraft.champion}
              onChange={(event) => setBonusResultDraft((current) => ({ ...current, champion: event.target.value }))}
            >
              <option value="">Bitte wählen</option>
              {teamOptions.map((team) => (
                <option key={team.name} value={team.name}>{team.name}</option>
              ))}
            </select>
          </label>
          <label>
            Torschützenkönig
            <PlayerSelect
              players={activePlayers}
              value={bonusResultDraft.topScorerPlayerIds}
              fallbackText={bonusResultDraft.topScorer}
              multiple
              onChange={(playerIds, selectedPlayers) =>
                setBonusResultDraft((current) => ({
                  ...current,
                  topScorerPlayerIds: playerIds,
                  topScorer: selectedPlayers.map((player) => player.display_name).join(", ") || current.topScorer,
                }))
              }
            />
          </label>
        </div>
        <div className="group-winner-grid compact">
          {groupTables.map((group) => (
            <label key={group.groupKey}>
              Gruppe {group.groupKey}
              <select
                value={bonusResultDraft.groupWinners?.[group.groupKey] ?? ""}
                onChange={(event) =>
                  setBonusResultDraft((current) => ({
                    ...current,
                    groupWinners: {
                      ...current.groupWinners,
                      [group.groupKey]: event.target.value,
                    },
                  }))
                }
              >
                <option value="">Bitte wählen</option>
                {group.teams.map((team) => (
                  <option key={team.name} value={team.name}>{team.name}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button type="button" className="primary-button compact" onClick={saveTestBonusResults} disabled={loading}>
          Test-Bonus speichern
        </button>
      </section>

      <section className="admin-test-ranking">
        <h3>Test-Rangliste</h3>
        <p className="fine-print">Diese Rangliste ist eine Simulation und wirkt sich nicht auf den Livebetrieb aus.</p>
        <RankingPanel ranking={data?.ranking ?? []} expanded />
      </section>

      <h3>Test-Ergebnisse</h3>
      <div className="result-list">
        {matches.map((match) => {
          const result = testResultsByMatch.get(match.id);
          const liveResult = liveResultsByMatch.get(match.id);
          const draft = resultDrafts[match.id] ?? {};
          return (
            <div className="result-row" key={match.id}>
              <span>Spiel {match.matchNumber}</span>
              <strong>{match.teamA} - {match.teamB}</strong>
              <small>
                Live: {liveResult?.status === "final" ? `${liveResult.score_a}:${liveResult.score_b}` : "offen"} · Testmodus
              </small>
              <input
                type="number"
                min="0"
                max="30"
                value={draft.scoreA ?? result?.score_a ?? 0}
                onChange={(event) =>
                  setResultDrafts((current) => ({
                    ...current,
                    [match.id]: { ...current[match.id], scoreA: Number(event.target.value) },
                  }))
                }
              />
              <input
                type="number"
                min="0"
                max="30"
                value={draft.scoreB ?? result?.score_b ?? 0}
                onChange={(event) =>
                  setResultDrafts((current) => ({
                    ...current,
                    [match.id]: { ...current[match.id], scoreB: Number(event.target.value) },
                  }))
                }
              />
              <button type="button" className="save-tip" onClick={() => saveTestResult(match.id)} disabled={loading}>
                Test speichern
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}


