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
  signInAdmin,
  signOutAdmin,
} from "./api.js";
import {
  knockoutPreview,
  matches as bundledMatches,
  scheduleSource,
} from "./data.js";
import { displayTeamName } from "./teamNames.js";

const STORAGE_KEY = "wm-tippspiel-participant";
const BUNDESLIGA_STORAGE_KEY = "bundesliga-tippspiel-participant";
const ANDROID_APK_URL = "/downloads/wmtippspiel-latest.apk";
const tabs = [
  { id: "start", label: "Start", icon: House },
  { id: "tippen", label: "Tippen", icon: Goal },
  { id: "rangliste", label: "Rangliste", icon: Trophy },
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
const bonusPointValues = {
  champion: 8,
  topScorer: 6,
  groupWinner: 2,
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
const AUTO_SAVE_DELAY_MS = 650;
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

function chunkArray(items, size) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );
}

function getIsTestMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("test") === "1" || params.get("mode") === "test";
}

function getInitialCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code")?.trim() || "";
}

function getTabFromHash() {
  const tabId = window.location.hash.replace("#", "").trim();
  return tabIds.has(tabId) ? tabId : "start";
}

const bundesligaTabIds = new Set(["bundesliga-start", "bundesliga-tippen", "bundesliga-bonus", "bundesliga-rangliste"]);

function getBundesligaTabFromHash() {
  const tabId = window.location.hash.replace("#", "").trim();
  return bundesligaTabIds.has(tabId) ? tabId : "bundesliga-start";
}

function isBundesligaRoute() {
  return window.location.hash.replace("#", "").startsWith("bundesliga-");
}

function getInviteUrl(code) {
  const url = new URL(window.location.origin);
  url.searchParams.set("code", code);
  url.hash = "start";
  return url.toString();
}

function getBundesligaInviteUrl(code) {
  const url = new URL(window.location.origin);
  url.searchParams.set("blCode", code);
  url.hash = "bundesliga-start";
  return url.toString();
}

function loadSavedParticipant() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadSavedBundesligaParticipant() {
  try {
    const raw = window.localStorage.getItem(BUNDESLIGA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function mapBundesligaMatch(row) {
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

function createBundesligaBonusTip(savedBonusTip = null) {
  return {
    championTeamId: savedBonusTip?.champion_team_id ?? "",
    topScorerId: savedBonusTip?.top_scorer_id ?? "",
    topScorer: savedBonusTip?.top_scorer ?? "",
    relegatedTeamIds: savedBonusTip?.relegated_team_ids ?? [],
    saved: Boolean(savedBonusTip),
  };
}

function createTestBundesligaData() {
  const teams = [
    { id: "bayern", name: "FC Bayern München", short_name: "Bayern", logo_url: "https://upload.wikimedia.org/wikipedia/commons/1/1f/Logo_FC_Bayern_M%C3%BCnchen_%282002%E2%80%932017%29.svg" },
    { id: "dortmund", name: "Borussia Dortmund", short_name: "BVB", logo_url: "https://upload.wikimedia.org/wikipedia/commons/6/67/Borussia_Dortmund_logo.svg" },
    { id: "leipzig", name: "RB Leipzig", short_name: "RBL", logo_url: "https://i.imgur.com/Rpwsjz1.png" },
    { id: "stuttgart", name: "VfB Stuttgart", short_name: "VfB", logo_url: "https://upload.wikimedia.org/wikipedia/commons/e/eb/VfB_Stuttgart_1893_Logo.svg" },
  ];
  const matches = [
    { id: "bl-test-1", match_number: 1, matchday: 1, phase: "league", match_date: "2026-08-14", match_time: "20:30", kickoff_at: "2026-08-14T18:30:00Z", team_a_id: "bayern", team_b_id: "dortmund", team_a_name: "FC Bayern München", team_b_name: "Borussia Dortmund", status: "scheduled" },
    { id: "bl-test-2", match_number: 2, matchday: 1, phase: "league", match_date: "2026-08-15", match_time: "15:30", kickoff_at: "2026-08-15T13:30:00Z", team_a_id: "leipzig", team_b_id: "stuttgart", team_a_name: "RB Leipzig", team_b_name: "VfB Stuttgart", status: "scheduled" },
    { id: "bl-test-3", match_number: 3, matchday: 2, phase: "league", match_date: "2026-08-21", match_time: "20:30", kickoff_at: "2026-08-21T18:30:00Z", team_a_id: "dortmund", team_b_id: "leipzig", team_a_name: "Borussia Dortmund", team_b_name: "RB Leipzig", status: "scheduled" },
  ];
  return {
    competition: { id: "bundesliga-2025", status: "admin_test", public_enabled: false },
    teams,
    matches,
    results: [{ match_id: "bl-test-1", score_a: 2, score_b: 1, status: "final" }],
    topScorers: [
      { id: "kane", display_name: "Harry Kane", goals: 36 },
      { id: "undav", display_name: "Deniz Undav", goals: 19 },
    ],
    ranking: [
      { name: "Daniel BL", points: 4, matchPoints: 4, bonusPoints: 0, tipCount: 1, scoredTipCount: 1, averagePoints: 4 },
    ],
  };
}

function QrCodeImage({ value }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 7,
          color: {
            dark: "#071b45",
            light: "#ffffff",
          },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc("");
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <span className="qr-image">
      {src ? <img src={src} alt={`QR-Code für ${value}`} /> : <QrCode size={42} />}
    </span>
  );
}

async function createQrCodeDataUrl(value) {
  const { default: QRCode } = await import("qrcode");
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    scale: 7,
    color: {
      dark: "#071b45",
      light: "#ffffff",
    },
  });
}

function mapDbMatch(row) {
  const teamA = displayTeamName(row.team_a);
  const teamB = displayTeamName(row.team_b);

  return {
    id: row.id,
    matchNumber: row.match_number,
    phase: row.phase,
    group: `Gruppe ${row.group_key}`,
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

function createInitialTips(matches, savedTips = []) {
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

function normalizePlayerName(value) {
  return normalizeText(value).replace(/\s+/g, " ");
}

function playerLabel(player) {
  if (!player) return "";
  return player.team_name ? `${player.display_name} · ${player.team_name}` : player.display_name;
}

function findPlayerByText(players, text) {
  const normalized = normalizePlayerName(text);
  if (!normalized) return null;
  const matches = players.filter((player) => {
    const names = [player.display_name, ...(Array.isArray(player.aliases) ? player.aliases : [])];
    return names.some((name) => normalizePlayerName(name) === normalized);
  });
  return matches.length === 1 ? matches[0] : null;
}

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

function clampScore(value) {
  return Math.max(0, Math.min(12, value));
}

function isCompleteTip(tip) {
  return Number.isInteger(tip?.scoreA) && Number.isInteger(tip?.scoreB);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00`));
}

function formatNumericDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return "noch offen";
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function isLockedForUsers(match) {
  if (!match?.kickoffAt) return false;
  return new Date(match.kickoffAt).getTime() <= Date.now();
}

function getTournamentDeadline(matches) {
  const timestamps = matches
    .map((match) => match.kickoffAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

function getGroupDeadline(matches, groupKey) {
  const timestamps = matches
    .filter((match) => match.groupKey === groupKey)
    .map((match) => match.kickoffAt)
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  if (!timestamps.length) return null;
  return new Date(Math.min(...timestamps)).toISOString();
}

function isDeadlinePassed(deadline) {
  return deadline ? new Date(deadline).getTime() <= Date.now() : false;
}

function pointsFor(tip, result) {
  if (!isCompleteTip(tip)) return 0;
  if (!result || result.status !== "final") return 0;
  if (tip.scoreA === result.score_a && tip.scoreB === result.score_b) return 4;
  const tipGoalDiff = tip.scoreA - tip.scoreB;
  const resultGoalDiff = result.score_a - result.score_b;
  const tipTrend = Math.sign(tipGoalDiff);
  const resultTrend = Math.sign(resultGoalDiff);
  if (tipTrend !== resultTrend) return 0;
  if (tipTrend === 0) return 2;
  return tipGoalDiff === resultGoalDiff ? 3 : 2;
}

function normalizeText(value) {
  return String(value || "").trim().toLocaleLowerCase("de-DE");
}

function bonusPointsFor(bonusTip, bonusResult) {
  if (!bonusTip || !bonusResult) return 0;
  let points = 0;
  if (normalizeText(bonusTip.champion) && normalizeText(bonusTip.champion) === normalizeText(bonusResult.champion)) {
    points += bonusPointValues.champion;
  }
  if (
    bonusTip.topScorerPlayerId &&
    (bonusResult.topScorerPlayerIds ?? []).includes(bonusTip.topScorerPlayerId)
  ) {
    points += bonusPointValues.topScorer;
  } else if (
    (bonusResult.topScorerPlayerIds ?? []).length === 0 &&
    normalizeText(bonusTip.topScorer) &&
    normalizeText(bonusTip.topScorer) === normalizeText(bonusResult.topScorer)
  ) {
    points += bonusPointValues.topScorer;
  }

  Object.entries(bonusResult.groupWinners ?? {}).forEach(([groupKey, winner]) => {
    if (normalizeText(bonusTip.groupWinners?.[groupKey]) && normalizeText(bonusTip.groupWinners?.[groupKey]) === normalizeText(winner)) {
      points += bonusPointValues.groupWinner;
    }
  });
  return points;
}

function areBonusTipsEqual(first, second) {
  if (!first || !second) return false;
  if ((first.champion ?? "") !== (second.champion ?? "")) return false;
  if ((first.topScorer ?? "") !== (second.topScorer ?? "")) return false;
  if ((first.topScorerPlayerId ?? "") !== (second.topScorerPlayerId ?? "")) return false;

  const firstWinners = first.groupWinners ?? {};
  const secondWinners = second.groupWinners ?? {};
  const groupKeys = new Set([...Object.keys(firstWinners), ...Object.keys(secondWinners)]);
  return [...groupKeys].every((groupKey) => (firstWinners[groupKey] ?? "") === (secondWinners[groupKey] ?? ""));
}

function getGroupLeaderSuggestions(groupTables) {
  return Object.fromEntries(
    groupTables.map((group) => [group.groupKey, group.rows[0]?.team ?? ""]),
  );
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
  const [tipTrends, setTipTrends] = useState(() => (isTestMode ? createTestTipTrends(bundledMatches) : {}));
  const [lastSavedMatch, setLastSavedMatch] = useState("");
  const [tipSaveStatuses, setTipSaveStatuses] = useState({});
  const [groupFilter, setGroupFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [appStatus, setAppStatus] = useState(isTestMode ? "Testmodus aktiv" : "Spielplan wird geladen...");
  const [codeStatus, setCodeStatus] = useState(isTestMode ? "claimed" : scannedCode ? "checking" : "missing");
  const [adminSession, setAdminSession] = useState(null);
  const [adminData, setAdminData] = useState({ codes: [], participants: [], tips: [], bonusTips: [], bonusResults: null, results: [], players: [] });
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
  const savedTipCount = Object.values(tips).filter((tip) => tip.saved).length;
  const featuredMatch =
    matches.find((match) => match.teamA === "Deutschland" || match.teamB === "Deutschland") ??
    matches[0];
  const resultsByMatch = useMemo(
    () => new Map(results.map((result) => [result.match_id, result])),
    [results],
  );

  const filteredMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return matches.filter((match) => {
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
    const rows = participant
      ? [
          ...ranking.filter((row) => row.name !== participant.name),
          {
            name: participant.name,
            points: currentPoints,
            matchPoints: currentMatchPoints,
            bonusPoints: currentBonusPoints,
            tipCount: currentTipCount,
            scoredTipCount: currentScoredTipCount,
            averagePoints: currentAveragePoints,
            isCurrent: true,
          },
        ]
      : [...ranking];
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
    if (activeTab === "rangliste" && canViewRanking) {
      void refreshRanking();
    }
  }, [activeTab, canViewRanking]);

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
        setActiveTab("start", { replace: true });
        return;
      }

      try {
        const [dbMatches, dbResults, rankPayload, bonusPayload, playerPayload, trendPayload, session] = await Promise.all([
          loadDbMatches(),
          loadResults(),
          apiGet("/api/ranking").catch(() => ({ ranking: [] })),
          apiGet("/api/bonus-results").catch(() => ({ bonusResults: null })),
          apiGet("/api/players").catch(() => ({ players: [] })),
          apiGet("/api/tip-trends").catch(() => ({ trends: {} })),
          getAdminSession(),
        ]);

        const nextMatches = dbMatches.length ? dbMatches.map(mapDbMatch) : bundledMatches;
        const nextPlayers = playerPayload.players ?? [];
        setMatches(nextMatches);
        setResults(dbResults);
        setPlayers(nextPlayers);
        setRanking(rankPayload.ranking ?? []);
        setTipTrends(trendPayload.trends ?? {});
        setAdminSession(session);
        setTips(createInitialTips(nextMatches));
        setTipSaveStatuses({});
        setBonusTips(createInitialBonusTips(nextMatches, null, nextPlayers));
        setBonusResults(createInitialBonusResults(nextMatches, bonusPayload.bonusResults, nextPlayers));
        setAppStatus("Spielplan bereit");
      } catch (error) {
        setAppStatus("Spielplan wird vorbereitet");
      }
    }

    bootstrap();
  }, [isTestMode, setActiveTab]);

  useEffect(() => {
    async function resolveParticipant() {
      if (isTestMode) {
        setCodeStatus("claimed");
        return;
      }

      if (!activeCode) {
        setCodeStatus("missing");
        return;
      }

      if (participant?.id) {
        setCodeStatus("claimed");
        return;
      }

      try {
        const payload = await apiGet(`/api/participant?code=${encodeURIComponent(activeCode)}`);
        setCodeStatus(payload.codeStatus);
        if (payload.participant) {
          const saved = {
            id: payload.participant.id,
            name: payload.participant.display_name,
            code: activeCode,
          };
          setParticipant(saved);
          setName(saved.name);
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
          setActiveTab("start", { replace: true });
        }
      } catch {
        setCodeStatus("unknown");
      }
    }

    resolveParticipant();
  }, [activeCode, participant?.id, isTestMode]);

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
    setTips((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        [side]: Number.isInteger(current[matchId]?.[side])
          ? clampScore(current[matchId][side] + delta)
          : 0,
        saved: false,
      },
    }));
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
  }

  async function handleAdminLogout() {
    await signOutAdmin();
    setAdminSession(null);
    setAdminData({ codes: [], participants: [], tips: [], bonusTips: [], bonusResults: null, results: [], players: [] });
  }

  async function handleCreateCodes(count) {
    const payload = await apiPost("/api/admin-create-codes", { count }, adminSession?.access_token);
    setAdminData((current) => ({
      ...current,
      codes: [...(payload.codes ?? []), ...current.codes],
    }));
  }

  async function handleSaveResult(matchId, scoreA, scoreB) {
    const payload = await apiPost(
      "/api/admin-save-result",
      { matchId, scoreA, scoreB, status: "final" },
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
            .filter((tab) => tab.id !== "rangliste" || canViewRanking)
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
          <span>WM 2026 · {matches.length} Gruppenspiele</span>
          <strong>{savedTipCount} von {matches.length} Tipps gespeichert</strong>
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
                    matches={matches}
                    tips={tips}
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
                onLogin={handleAdminLogin}
                onLogout={handleAdminLogout}
                onRefresh={() => refreshAdminData()}
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
  const payload = await response.json();
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
  bonusTips,
  groupTables,
  ranking,
  setActiveTab,
}) {
  const savedTipCount = Object.values(tips).filter((tip) => tip.saved).length;
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

function TipScreen({
  filteredMatches,
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
              {groupFilters.map((filter) => (
                <button
                  type="button"
                  key={filter}
                  className={groupFilter === filter ? "active" : ""}
                  onClick={() => setGroupFilter(filter)}
                >
                  {filter === "alle"
                    ? "Alle"
                    : filter === "deutschland"
                      ? "Deutschland"
                      : `Gr. ${filter}`}
                </button>
              ))}
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

function PlayerSelect({ players, value, fallbackText, disabled, multiple = false, onChange }) {
  const [query, setQuery] = useState("");
  const selectedIds = multiple ? value ?? [] : value ? [value] : [];
  const filteredPlayers = players
    .filter((player) => player.active !== false || selectedIds.includes(player.id))
    .filter((player) => {
      const haystack = [player.display_name, player.team_name, ...(Array.isArray(player.aliases) ? player.aliases : [])]
        .join(" ")
        .toLocaleLowerCase("de-DE");
      return !query.trim() || haystack.includes(query.trim().toLocaleLowerCase("de-DE"));
    });

  function updateSingle(playerId) {
    const player = players.find((item) => item.id === playerId);
    onChange(playerId, player);
  }

  function updateMultiple(playerId, checked) {
    const nextIds = checked
      ? [...new Set([...selectedIds, playerId])]
      : selectedIds.filter((id) => id !== playerId);
    onChange(nextIds, nextIds.map((id) => players.find((player) => player.id === id)).filter(Boolean));
  }

  return (
    <div className="player-select">
      <input
        value={query}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Spieler suchen"
      />
      {multiple ? (
        <div className="player-check-list">
          {filteredPlayers.map((player) => (
            <label key={player.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(player.id)}
                disabled={disabled}
                onChange={(event) => updateMultiple(player.id, event.target.checked)}
              />
              {playerLabel(player)}
            </label>
          ))}
        </div>
      ) : (
        <select value={value ?? ""} disabled={disabled} onChange={(event) => updateSingle(event.target.value)}>
          <option value="">Bitte wählen</option>
          {filteredPlayers.map((player) => (
            <option key={player.id} value={player.id}>{playerLabel(player)}</option>
          ))}
        </select>
      )}
      {fallbackText && !selectedIds.length && (
        <small>Bisheriger Text: {fallbackText}</small>
      )}
      {players.length === 0 && <small>Noch keine Spieler im Adminbereich angelegt.</small>}
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

function ScoreControl({ value, onIncrease, onDecrease, disabled }) {
  return (
    <div className="score-control">
      <button type="button" onClick={onIncrease} disabled={disabled} aria-label="Tor hinzufügen">
        <ChevronUp size={22} />
      </button>
      <strong>{Number.isInteger(value) ? value : "-"}</strong>
      <button type="button" onClick={onDecrease} disabled={disabled} aria-label="Tor entfernen">
        <ChevronDown size={22} />
      </button>
    </div>
  );
}

function RankingPanel({ ranking: rows, expanded = false, setActiveTab }) {
  const [rankingMode, setRankingMode] = useState("total");
  const sortedRows = useMemo(() => {
    const nextRows = [...rows];
    if (expanded && rankingMode === "average") {
      return nextRows.sort(
        (first, second) =>
          (second.averagePoints ?? 0) - (first.averagePoints ?? 0) ||
          (second.scoredTipCount ?? 0) - (first.scoredTipCount ?? 0) ||
          second.points - first.points ||
          first.name.localeCompare(second.name, "de"),
      );
    }
    return nextRows.sort((first, second) => second.points - first.points || first.name.localeCompare(second.name, "de"));
  }, [rows, expanded, rankingMode]);
  const visibleRows = expanded ? sortedRows : sortedRows.slice(0, 10);
  const getRowLabel = (row, index) => {
    if (!expanded) return `${index + 1} ${row.name} ${row.points}`;
    if (rankingMode === "average") {
      return `${index + 1} ${row.name} ${row.tipCount ?? 0} ${row.scoredTipCount ?? 0} ${(row.averagePoints ?? 0).toFixed(2)} ${row.matchPoints ?? row.points}`;
    }
    return `${index + 1} ${row.name} ${row.tipCount ?? 0} ${row.matchPoints ?? row.points} ${row.bonusPoints ?? 0} ${row.points}`;
  };

  return (
    <section className={`ranking-panel panel ${expanded ? "expanded" : ""}`}>
      <header className="section-title">
        <Trophy size={24} />
        <h2>Rangliste</h2>
        <span>{expanded ? "Alle" : "Top 10"}</span>
      </header>
      {expanded && (
        <div className="ranking-tabs">
          <button
            type="button"
            className={rankingMode === "total" ? "active" : ""}
            onClick={() => setRankingMode("total")}
          >
            Gesamtpunkte
          </button>
          <button
            type="button"
            className={rankingMode === "average" ? "active" : ""}
            onClick={() => setRankingMode("average")}
          >
            Durchschnitt
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Platz</th>
            <th>Name</th>
            {expanded && rankingMode === "total" && <th>Tipps</th>}
            {expanded && rankingMode === "total" && <th>Spielpunkte</th>}
            {expanded && rankingMode === "total" && <th>Bonus</th>}
            {expanded && rankingMode === "average" && <th>Tipps</th>}
            {expanded && rankingMode === "average" && <th>Gewertet</th>}
            {expanded && rankingMode === "average" && <th>Schnitt</th>}
            <th>{rankingMode === "average" ? "Spielpunkte" : "Gesamt"}</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan={expanded ? 6 : 3}>Noch keine Punkte vorhanden.</td>
            </tr>
          )}
          {visibleRows.map((row, index) => (
            <tr key={`${row.name}-${index}`} className={row.isCurrent ? "current" : ""} aria-label={getRowLabel(row, index)}>
              <td data-label="Platz">{index + 1}</td>
              <td data-label="Name">{row.name}</td>
              {expanded && rankingMode === "total" && <td data-label="Tipps">{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "total" && <td data-label="Spielpunkte">{row.matchPoints ?? row.points}</td>}
              {expanded && rankingMode === "total" && <td data-label="Bonus">{row.bonusPoints ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Tipps">{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Gewertet">{row.scoredTipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td data-label="Schnitt">{(row.averagePoints ?? 0).toFixed(2)}</td>}
              <td data-label={rankingMode === "average" ? "Spielpunkte" : "Gesamt"}>
                {rankingMode === "average" ? row.matchPoints ?? row.points : row.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expanded && rankingMode === "average" && (
        <p className="ranking-note">
          Tipps zeigt alle gespeicherten Spieltipps. Gewertet zählt nur Spiele mit eingetragenem Endergebnis.
          Der Schnitt nutzt nur Spielpunkte pro gewertetem Tipp; Bonuspunkte sind nicht eingerechnet.
        </p>
      )}
      {!expanded && (
        <button type="button" className="ghost-button" onClick={() => setActiveTab?.("rangliste")}>
          Zur vollständigen Rangliste
        </button>
      )}
    </section>
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
  onLogin,
  onLogout,
  onRefresh,
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
  const [bundesligaData, setBundesligaData] = useState(null);
  const [bundesligaMessage, setBundesligaMessage] = useState("");
  const [bundesligaLoading, setBundesligaLoading] = useState(false);
  const activePlayers = players.filter((player) => player.active !== false);
  const isBundesligaAdmin = adminCompetition === competitions.bundesliga.id;

  useEffect(() => {
    setBonusResultDraft(createInitialBonusResults(matches, bonusResults, players));
  }, [matches, bonusResults, players]);

  useEffect(() => {
    if (!isBundesligaAdmin || !session?.access_token) return;
    void loadBundesligaData();
  }, [isBundesligaAdmin, session?.access_token]);

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
    try {
      await onSaveResult(
        matchId,
        draft.scoreA ?? current?.score_a ?? 0,
        draft.scoreB ?? current?.score_b ?? 0,
      );
      setAdminMessage("Ergebnis gespeichert.");
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

      {isBundesligaAdmin && (
        <BundesligaAdminSetup
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
          onGenerateDemoTips={async () => {
            const payload = await runBundesligaAction("generate-demo-tips");
            if (payload) setBundesligaMessage(`${payload.tips?.length ?? 0} Demo-Tipps gespeichert.`);
          }}
          onImportResults={async (throughMatchday) => {
            const payload = await runBundesligaAction("import-results", { throughMatchday });
            if (payload) setBundesligaMessage(`Ergebnisse bis Spieltag ${payload.throughMatchday} importiert.`);
          }}
          onResetResults={async () => {
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
          onBackToWorldCup={() => setAdminCompetition(competitions.wm2026.id)}
        />
      )}

      {!isBundesligaAdmin && (
        <>
      <div className="admin-actions">
        <button type="button" className="ghost-button" onClick={onRefresh}>Daten aktualisieren</button>
        <button type="button" className="ghost-button" onClick={onLogout}>Admin abmelden</button>
      </div>

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

      {adminMessage && <p className="admin-message">{adminMessage}</p>}

      <div className="admin-stats">
        <strong>{adminData.codes.length}<span>QR-Codes</span></strong>
        <strong>{adminData.participants.length}<span>Teilnehmer</span></strong>
        <strong>{adminData.tips.length}<span>Tipps</span></strong>
      </div>

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
      <section className={`print-sheet ${printMode}`} aria-hidden="true">
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
      <div className="participant-list">
        {adminData.participants.length === 0 && (
          <p className="fine-print">Noch keine Teilnehmer angelegt.</p>
        )}
        {adminData.participants.map((participant) => {
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
          return (
            <div className="result-row" key={match.id}>
              <span>Spiel {match.matchNumber}</span>
              <strong>{match.teamA} - {match.teamB}</strong>
              <small>{formatDate(match.date)} · {match.time} Uhr</small>
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
              <button type="button" className="save-tip" onClick={() => saveResult(match.id)}>Speichern</button>
            </div>
          );
        })}
      </div>

      {selectedParticipant && (
        <div className="modal-backdrop" role="presentation">
          <section className="participant-modal" role="dialog" aria-modal="true">
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
        </div>
      )}
        </>
      )}
    </section>
  );
}

function BundesligaParticipantApp({ isTestMode }) {
  const savedParticipant = useMemo(() => loadSavedBundesligaParticipant(), []);
  const [activeTab, setActiveTab] = useState(getBundesligaTabFromHash);
  const [data, setData] = useState(() => (isTestMode ? createTestBundesligaData() : null));
  const [participant, setParticipant] = useState(() => (isTestMode ? { id: "bl-test", name: "Daniel BL", code: "BL-TEST" } : savedParticipant));
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("blCode")?.trim() || savedParticipant?.code || "");
  const [name, setName] = useState(() => savedParticipant?.name ?? "");
  const [codeStatus, setCodeStatus] = useState(isTestMode ? "claimed" : code ? "checking" : "missing");
  const [tips, setTips] = useState({});
  const [bonusTip, setBonusTip] = useState(createBundesligaBonusTip());
  const [ranking, setRanking] = useState(() => (isTestMode ? createTestBundesligaData().ranking : []));
  const [selectedMatchday, setSelectedMatchday] = useState(1);
  const [message, setMessage] = useState(isTestMode ? "Bundesliga-Testmodus aktiv" : "Bundesliga wird geladen...");
  const [tipStatuses, setTipStatuses] = useState({});
  const tipsRef = useRef(tips);
  const bonusRef = useRef(bonusTip);

  const matches = useMemo(() => (data?.matches ?? []).map(mapBundesligaMatch), [data]);
  const teams = data?.teams ?? [];
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const topScorers = data?.topScorers ?? [];
  const resultsByMatch = useMemo(() => new Map((data?.results ?? []).map((result) => [result.match_id, result])), [data]);
  const matchdayOptions = useMemo(() =>
    Array.from(new Set(matches.map((match) => Number(match.matchday)).filter(Number.isInteger))).sort((a, b) => a - b),
  [matches]);
  const visibleMatches = matches.filter((match) => Number(match.matchday) === Number(selectedMatchday));
  const savedTipCount = Object.values(tips).filter((tip) => tip.saved).length;
  const selectedMatchdayIndex = Math.max(0, matchdayOptions.indexOf(Number(selectedMatchday)));

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
    async function loadData() {
      if (isTestMode) {
        const testData = createTestBundesligaData();
        setData(testData);
        setTips(createInitialTips(testData.matches.map(mapBundesligaMatch)));
        setRanking(testData.ranking);
        setSelectedMatchday(1);
        return;
      }
      try {
        const payload = await apiGet("/api/bundesliga-public-data");
        setData(payload);
        const mappedMatches = (payload.matches ?? []).map(mapBundesligaMatch);
        setTips(createInitialTips(mappedMatches));
        setSelectedMatchday(Number(mappedMatches[0]?.matchday) || 1);
        await refreshRanking();
        setMessage("Bundesliga bereit");
      } catch (error) {
        setMessage(error.message);
      }
    }
    loadData();
  }, [isTestMode]);

  useEffect(() => {
    async function resolveParticipant() {
      if (isTestMode) return;
      if (!code || participant?.id) return;
      try {
        const payload = await apiGet(`/api/bundesliga-participant?code=${encodeURIComponent(code)}`);
        setCodeStatus(payload.codeStatus);
        if (payload.participant) {
          const saved = { id: payload.participant.id, name: payload.participant.display_name, code };
          setParticipant(saved);
          setName(saved.name);
          window.localStorage.setItem(BUNDESLIGA_STORAGE_KEY, JSON.stringify(saved));
        }
      } catch {
        setCodeStatus("unknown");
      }
    }
    resolveParticipant();
  }, [code, participant?.id, isTestMode]);

  useEffect(() => {
    async function loadParticipantState() {
      if (isTestMode || !participant?.id || !matches.length) return;
      try {
        const [tipPayload, bonusPayload] = await Promise.all([
          apiGet(`/api/bundesliga-tips?participantId=${encodeURIComponent(participant.id)}`),
          apiGet(`/api/bundesliga-bonus-tips?participantId=${encodeURIComponent(participant.id)}`).catch(() => ({ bonusTip: null })),
        ]);
        setTips(createInitialTips(matches, tipPayload.tips ?? []));
        setBonusTip(createBundesligaBonusTip(bonusPayload.bonusTip));
      } catch (error) {
        setMessage(error.message);
      }
    }
    loadParticipantState();
  }, [participant?.id, matches, isTestMode]);

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
    if (!participant?.id || bonusTip.saved) return undefined;
    const timer = window.setTimeout(() => {
      void saveBonus(bonusRef.current, { auto: true });
    }, AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [bonusTip, participant?.id]);

  function setBundesligaTab(tabId) {
    if (!bundesligaTabIds.has(tabId)) return;
    window.location.hash = tabId;
    setActiveTab(tabId);
  }

  async function refreshRanking() {
    if (isTestMode) {
      setRanking(createTestBundesligaData().ranking);
      return;
    }
    const payload = await apiGet("/api/bundesliga-ranking").catch(() => ({ ranking: [] }));
    setRanking(payload.ranking ?? []);
  }

  async function claimCode(event) {
    event.preventDefault();
    if (!code.trim() || name.trim().length < 2) return;
    if (isTestMode) return;
    try {
      const payload = await apiPost("/api/bundesliga-claim-code", { code, name });
      const saved = { id: payload.participant.id, name: payload.participant.display_name, code };
      setParticipant(saved);
      setName(saved.name);
      setCodeStatus("claimed");
      window.localStorage.setItem(BUNDESLIGA_STORAGE_KEY, JSON.stringify(saved));
      setMessage("Bundesliga-Code aktiviert.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function changeScore(matchId, side, delta) {
    setTips((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        [side]: Number.isInteger(current[matchId]?.[side]) ? clampScore(current[matchId][side] + delta) : 0,
        saved: false,
      },
    }));
    setTipStatuses((current) => ({ ...current, [matchId]: "pending" }));
  }

  async function saveTipRows(matchIds, sourceTips = tipsRef.current) {
    if (!participant?.id) {
      setMessage("Bitte zuerst Bundesliga-Code aktivieren.");
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
      return;
    }
    try {
      const payload = await apiPost("/api/bundesliga-save-tips", {
        participantId: participant.id,
        tips: completeIds.map((matchId) => ({
          matchId,
          scoreA: sourceTips[matchId].scoreA,
          scoreB: sourceTips[matchId].scoreB,
        })),
      });
      const savedIds = new Set((payload.tips ?? []).map((tip) => tip.match_id));
      setTips((current) => {
        const next = { ...current };
        savedIds.forEach((id) => { next[id] = { ...next[id], saved: true }; });
        return next;
      });
      setTipStatuses((current) => ({ ...current, ...Object.fromEntries([...savedIds].map((id) => [id, "saved"])) }));
      setMessage("Bundesliga-Tipp gespeichert.");
      await refreshRanking();
    } catch (error) {
      setMessage(error.message);
    }
  }

  function updateBonus(patch) {
    setBonusTip((current) => ({ ...current, ...patch, saved: false }));
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
        <span className="bundesliga-team-logo">
          {team?.logo_url ? <img src={team.logo_url} alt="" /> : name.slice(0, 2).toUpperCase()}
        </span>
        <strong>{team?.name ?? name}</strong>
      </span>
    );
  }

  async function saveBonus(source = bonusRef.current, { auto = false } = {}) {
    if (!participant?.id) {
      setMessage("Bitte zuerst Bundesliga-Code aktivieren.");
      return;
    }
    if (isTestMode) {
      setBonusTip((current) => ({ ...current, saved: true }));
      setMessage(auto ? "Bundesliga-Bonus automatisch gespeichert." : "Bundesliga-Bonus gespeichert.");
      return;
    }
    try {
      const scorer = topScorers.find((row) => row.id === source.topScorerId);
      const payload = await apiPost("/api/bundesliga-save-bonus-tips", {
        participantId: participant.id,
        championTeamId: source.championTeamId,
        topScorerId: source.topScorerId,
        topScorer: scorer?.display_name ?? source.topScorer,
        relegatedTeamIds: source.relegatedTeamIds,
      });
      setBonusTip(createBundesligaBonusTip(payload.bonusTip));
      setMessage(auto ? "Bundesliga-Bonus automatisch gespeichert." : "Bundesliga-Bonus gespeichert.");
      await refreshRanking();
    } catch (error) {
      setMessage(error.message);
    }
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
  const topScorerPreview = topScorers.slice(0, 5);
  const currentParticipantRank = participant
    ? ranking.find((row) => row.id === participant.id || row.name === participant.name)
    : null;

  return (
    <div className="bundesliga-public-shell">
      <header className="bundesliga-public-header">
        <button type="button" onClick={() => setBundesligaTab("bundesliga-start")}>
          <span>BL</span>
          <strong>Bundesliga Tippspiel</strong>
          <small>versteckte Testversion</small>
        </button>
        <nav>
          <button className={activeTab === "bundesliga-start" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-start")}>Start</button>
          <button className={activeTab === "bundesliga-tippen" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-tippen")}>Tippen</button>
          <button className={activeTab === "bundesliga-bonus" ? "active" : ""} onClick={() => setBundesligaTab("bundesliga-bonus")}>Bonus</button>
          <button className={activeTab === "bundesliga-rangliste" ? "active" : ""} onClick={() => { setBundesligaTab("bundesliga-rangliste"); void refreshRanking(); }}>Rangliste</button>
        </nav>
        <button type="button" onClick={() => { window.location.hash = "start"; }}>Zur WM</button>
      </header>

      <main className="bundesliga-public-main">
        <section className="bundesliga-public-status">
          <span>{participant ? `Angemeldet als ${participant.name}` : "Bundesliga-Code erforderlich"}</span>
          <strong>{savedTipCount} von {matches.length} Tipps gespeichert</strong>
          <span>{currentParticipantRank ? `${currentParticipantRank.points} Punkte` : message}</span>
        </section>

        {activeTab === "bundesliga-start" && (
          <section className="bundesliga-home-grid">
            <section className="bundesliga-welcome-card bundesliga-public-card">
              <div>
                <span>Versteckte Testversion</span>
                <h1>Bundesliga starten</h1>
                <p>Tipps, Bonusfragen und Rangliste sind getrennt von der WM und laufen hier im Bundesliga-Design.</p>
              </div>
              <form onSubmit={claimCode}>
                <label>Code<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="BL-..." /></label>
                <label>Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Dein Name" /></label>
                <button type="submit">Code aktivieren</button>
                <small>Status: {codeStatus}</small>
              </form>
            </section>

            <aside className="bundesliga-side-stack">
              <section className="bundesliga-public-card">
                <h2>Live-Tabelle</h2>
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 8).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <span className="bundesliga-team-logo">{row.logoUrl ? <img src={row.logoUrl} alt="" /> : row.team.slice(0, 2).toUpperCase()}</span>
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="bundesliga-public-card">
                <h2>Erste Spiele</h2>
                <div className="bundesliga-fixture-list">
                  {firstMatches.map((match) => (
                    <div key={match.id}>
                      <span>{formatDateTime(match.kickoffAt)}</span>
                      <strong>{match.teamA}</strong>
                      <small>{match.teamB}</small>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        )}

        {activeTab === "bundesliga-tippen" && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card bundesliga-tip-stage">
              <div className="bundesliga-public-section-head">
                <div>
                  <h2>Spieltag tippen</h2>
                  <p>{visibleMatches.length} Spiele am {selectedMatchday}. Spieltag</p>
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
              <div className="bundesliga-matchday-chips" aria-label="Schnellauswahl Spieltage">
                {matchdayOptions.slice(0, 17).map((day) => (
                  <button key={day} type="button" className={Number(selectedMatchday) === day ? "active" : ""} onClick={() => setSelectedMatchday(day)}>
                    {day}
                  </button>
                ))}
              </div>
              <div className="bundesliga-tip-card-list">
                {visibleMatches.map((match) => {
                  const tip = tips[match.id] ?? { scoreA: null, scoreB: null, saved: false };
                  const result = resultsByMatch.get(match.id);
                  return (
                    <article key={match.id} className="bundesliga-user-match-card">
                      <header>
                        <span>{formatDateTime(match.kickoffAt)}</span>
                        <b>{result ? `${result.score_a}:${result.score_b}` : "-:-"}</b>
                      </header>
                      <div className="bundesliga-user-match-body">
                        {teamBadge(match.teamAId, match.teamA)}
                        <div className="score-row">
                          <ScoreControl value={tip.scoreA} onIncrease={() => changeScore(match.id, "scoreA", 1)} onDecrease={() => changeScore(match.id, "scoreA", -1)} />
                          <span className="score-separator">:</span>
                          <ScoreControl value={tip.scoreB} onIncrease={() => changeScore(match.id, "scoreB", 1)} onDecrease={() => changeScore(match.id, "scoreB", -1)} />
                        </div>
                        {teamBadge(match.teamBId, match.teamB, { align: "right" })}
                      </div>
                      <footer>
                        <small>{tip.saved ? "gespeichert" : tipStatuses[match.id] === "pending" ? "Autosave wartet..." : "offen"}</small>
                        <button type="button" onClick={() => saveTipRows([match.id])} disabled={!isCompleteTip(tip)}>Tipp speichern</button>
                      </footer>
                    </article>
                  );
                })}
              </div>
            </section>

            <aside className="bundesliga-side-stack">
              <section className="bundesliga-public-card">
                <h2>Live-Tabelle</h2>
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 6).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <span className="bundesliga-team-logo">{row.logoUrl ? <img src={row.logoUrl} alt="" /> : row.team.slice(0, 2).toUpperCase()}</span>
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="bundesliga-public-card">
                <h2>Torschützen</h2>
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
            </aside>
          </section>
        )}

        {activeTab === "bundesliga-bonus" && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card bundesliga-bonus-public">
              <div className="bundesliga-public-section-head">
                <div>
                  <h2>Bonus tippen</h2>
                  <p>Meister, Torschützenkönig und drei Absteiger wählen.</p>
                </div>
                <button type="button" onClick={() => saveBonus()}>Bonus speichern</button>
              </div>
              <section className="bundesliga-choice-section">
                <h3>Meister</h3>
                <div className="bundesliga-choice-grid">
                  {teams.map((team) => (
                    <button key={team.id} type="button" className={bonusTip.championTeamId === team.id ? "selected" : ""} onClick={() => updateBonus({ championTeamId: team.id })}>
                      <span className="bundesliga-team-logo">{team.logo_url ? <img src={team.logo_url} alt="" /> : team.name.slice(0, 2).toUpperCase()}</span>
                      <strong>{team.name}</strong>
                    </button>
                  ))}
                </div>
              </section>
              <section className="bundesliga-choice-section">
                <h3>Torschützenkönig</h3>
                <div className="bundesliga-scorer-choice-list">
                  {topScorers.slice(0, 12).map((row) => (
                    <button key={row.id} type="button" className={bonusTip.topScorerId === row.id ? "selected" : ""} onClick={() => updateBonus({ topScorerId: row.id })}>
                      <strong>{row.display_name}</strong>
                      <span>{row.team_name || "OpenLigaDB"}</span>
                      <b>{row.goals} Tore</b>
                    </button>
                  ))}
                </div>
              </section>
              <section className="bundesliga-choice-section">
                <h3>Absteiger <span>{bonusTip.relegatedTeamIds.length} / 3</span></h3>
                <div className="bundesliga-choice-grid compact">
                  {teams.map((team) => (
                    <button key={team.id} type="button" className={bonusTip.relegatedTeamIds.includes(team.id) ? "selected" : ""} onClick={() => toggleRelegatedTeam(team.id)}>
                      <span className="bundesliga-team-logo">{team.logo_url ? <img src={team.logo_url} alt="" /> : team.name.slice(0, 2).toUpperCase()}</span>
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
                  <div><span>Torschütze</span><strong>{topScorers.find((row) => row.id === bonusTip.topScorerId)?.display_name ?? "offen"}</strong></div>
                  <div><span>Absteiger</span><strong>{bonusTip.relegatedTeamIds.length} / 3</strong></div>
                </div>
              </section>
            </aside>
          </section>
        )}

        {activeTab === "bundesliga-rangliste" && (
          <section className="bundesliga-stage-grid">
            <section className="bundesliga-public-card">
              <h2>Bundesliga Rangliste</h2>
              <div className="bundesliga-public-ranking">
                <div className="head"><span>Pl.</span><strong>Name</strong><span>Tipps</span><span>Spiel</span><span>Bonus</span><b>Gesamt</b></div>
                {ranking.map((row, index) => (
                  <div key={row.id ?? row.name} className={participant?.id === row.id || participant?.name === row.name ? "current" : ""}>
                    <span>{index + 1}</span>
                    <strong>{row.name}</strong>
                    <span>{row.tipCount}</span>
                    <span>{row.matchPoints}</span>
                    <span>{row.bonusPoints}</span>
                    <b>{row.points}</b>
                  </div>
                ))}
              </div>
            </section>
            <aside className="bundesliga-side-stack">
              <section className="bundesliga-public-card">
                <h2>Live-Tabelle</h2>
                <div className="bundesliga-mini-table">
                  {displayTableRows.slice(0, 6).map((row, index) => (
                    <div key={row.teamId}>
                      <span>{index + 1}</span>
                      <span className="bundesliga-team-logo">{row.logoUrl ? <img src={row.logoUrl} alt="" /> : row.team.slice(0, 2).toUpperCase()}</span>
                      <strong>{row.team}</strong>
                      <b>{row.points}</b>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}

function BundesligaAdminSetup({
  data,
  loading,
  message,
  onRefresh,
  onImport,
  onCreateDemoParticipant,
  onCreateInviteCodes,
  onGenerateDemoTips,
  onImportResults,
  onResetResults,
  onImportTopScorers,
  onSaveTopScorer,
  onBackToWorldCup,
}) {
  const [includeRelegation, setIncludeRelegation] = useState(true);
  const [throughMatchday, setThroughMatchday] = useState(1);
  const [selectedMatchday, setSelectedMatchday] = useState(34);
  const [activeLabView, setActiveLabView] = useState("overview");
  const [demoName, setDemoName] = useState("");
  const [scorerDrafts, setScorerDrafts] = useState({});
  const matches = data?.matches ?? [];
  const leagueMatches = matches.filter((match) => match.phase === "league");
  const resultCount = data?.results?.length ?? 0;
  const maxMatchday = Math.max(34, ...leagueMatches.map((match) => Number(match.matchday) || 0));
  const nextMatchday = Math.min(maxMatchday, Math.max(1, throughMatchday));
  const activeMatchday = Math.min(maxMatchday, Math.max(1, selectedMatchday));
  const matchdayOptions = Array.from(
    new Set(leagueMatches.map((match) => Number(match.matchday)).filter(Number.isInteger)),
  ).sort((first, second) => first - second);
  const visibleMatches = leagueMatches.filter((match) => Number(match.matchday) === activeMatchday);
  const matchdayTipCount = visibleMatches.reduce((sum, match) => sum + (match.demoTips?.length ?? 0), 0);
  const tableRows = data?.table ?? [];
  const rankingRows = data?.ranking ?? [];
  const topScorerRows = data?.topScorers ?? [];
  const inviteCodes = data?.inviteCodes ?? [];
  const dataQuality = data?.dataQuality ?? {};
  const importedThrough = leagueMatches.reduce((max, match) => {
    if (!match.result) return max;
    return Math.max(max, Number(match.matchday) || 0);
  }, 0);

  async function createDemoParticipant() {
    await onCreateDemoParticipant(demoName);
    setDemoName("");
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

  const labNavItems = [
    { id: "overview", label: "Übersicht", Icon: House },
    { id: "schedule", label: "Spielplan", Icon: CalendarDays },
    { id: "table", label: "Tabelle", Icon: Trophy },
    { id: "results", label: "Ergebnisse", Icon: ListFilter },
    { id: "tips", label: "Tipp-Auswertung", Icon: Medal },
    { id: "ranking", label: "Demo-Rangliste", Icon: UsersRound },
    { id: "scorers", label: "Torschützen", Icon: Goal },
  ];

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
                        {row.logoUrl && <img src={row.logoUrl} alt="" />}
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

  function renderTopScorers({ compact = false } = {}) {
    return (
      <section className={`bundesliga-dark-panel${compact ? "" : " bundesliga-view-panel"}`}>
        <header>
          <h3>Torschützen - Top {compact ? 5 : 20}</h3>
          {!compact && <button type="button" onClick={onImportTopScorers} disabled={loading}>OpenLigaDB importieren</button>}
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
          <h3>Demo-Rangliste</h3>
          <span>{rankingRows.length} Test-Tipper</span>
        </header>
        <div className="bundesliga-ranking-table-scroll">
          <table className="bundesliga-ranking-table">
            <thead>
              <tr>
                <th>Pl.</th>
                <th>Name</th>
                <th>Punkte</th>
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

  return (
    <section className="bundesliga-admin-setup">
      <aside className="bundesliga-lab-rail">
        <div className="bundesliga-mark">
          <span>BL</span>
          <strong>Testlabor</strong>
        </div>
        {labNavItems.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={activeLabView === id ? "active" : ""}
            onClick={() => setActiveLabView(id)}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="bundesliga-rail-meta">
          <small>Wettbewerb</small>
          <strong>Bundesliga</strong>
          <span>2025/2026</span>
          <small>Status</small>
          <b>Testmodus</b>
          <em>OpenLigaDB · bl1/2025</em>
        </div>
      </aside>

      <div className="bundesliga-lab-main">
        <header className="bundesliga-lab-header">
          <div>
            <h2>Bundesliga Testlabor</h2>
            <p>Admin · Testumgebung 2025/2026</p>
          </div>
          <span>Testmodus: <strong>Admin</strong></span>
          <button type="button" onClick={onBackToWorldCup}>Zur WM-2026 Version</button>
        </header>

        <section className="bundesliga-command-grid">
          <button type="button" onClick={() => onImport(includeRelegation)} disabled={loading}>
            <Download size={23} />
            <span><strong>OpenLigaDB importieren</strong><small>Teams, Spielplan, Logos</small></span>
          </button>
          <button type="button" onClick={onGenerateDemoTips} disabled={loading || leagueMatches.length === 0}>
            <UsersRound size={23} />
            <span><strong>Demo-Tipps füllen</strong><small>Alle Spiele für Demo-Tipper</small></span>
          </button>
          <div className="bundesliga-import-control">
            <CalendarDays size={22} />
            <span><strong>Ergebnisse bis Spieltag</strong></span>
            <input
              type="number"
              min="1"
              max={maxMatchday}
              value={nextMatchday}
              onChange={(event) => setThroughMatchday(Number(event.target.value))}
            />
            <button type="button" onClick={() => onImportResults(nextMatchday)} disabled={loading || leagueMatches.length === 0}>
              Importieren
            </button>
          </div>
          <button type="button" onClick={onResetResults} disabled={loading || resultCount === 0}>
            <ShieldCheck size={23} />
            <span><strong>Ergebnisse zurücksetzen</strong><small>Nur Bundesliga-Testdaten</small></span>
          </button>
          <button type="button" onClick={() => { window.location.hash = "bundesliga-start"; }}>
            <ChevronRight size={23} />
            <span><strong>Teilnehmeransicht öffnen</strong><small>Versteckte Bundesliga-Version</small></span>
          </button>
          <button type="button" onClick={onCreateInviteCodes} disabled={loading}>
            <QrCode size={23} />
            <span><strong>10 Bundesliga-Codes</strong><small>Getrennte Teilnehmercodes</small></span>
          </button>
        </section>

        <section className="bundesliga-lab-stats" aria-label="Bundesliga Teststatus">
          <span><strong>{leagueMatches.length}</strong> Liga-Spiele</span>
          <span><strong>{data?.teams?.length ?? 0}</strong> Teams</span>
          <span><strong>{data?.demoTips?.length ?? 0}</strong> Demo-Tipps</span>
          <span><strong>{importedThrough || 0}</strong> Spieltage gewertet</span>
          <span><strong>{dataQuality.topScorerCount ?? topScorerRows.length}</strong> Torschützen</span>
          {dataQuality.lastTopScorerImportAt && <span><strong>{formatDateTime(dataQuality.lastTopScorerImportAt)}</strong> letzter Torschützen-Import</span>}
          <label>
            <input
              type="checkbox"
              checked={includeRelegation}
              onChange={(event) => setIncludeRelegation(event.target.checked)}
            />
            Relegation mitladen
          </label>
          <button type="button" onClick={onRefresh} disabled={loading}>Aktualisieren</button>
        </section>

        {message && <p className="bundesliga-lab-message">{message}</p>}
        {dataQuality.topScorerSource === "match_goals_fallback" && (
          <p className="bundesliga-lab-message">
            Torschützen laufen noch im Fallback aus Match-Toren. Bitte OpenLigaDB-Torschützen importieren.
          </p>
        )}
        {dataQuality.incompleteTopScorers > 0 && (
          <p className="bundesliga-lab-message">
            {dataQuality.incompleteTopScorers} Torschützen wirken abgekürzt oder unvollständig und können unten korrigiert werden.
          </p>
        )}

        {activeLabView === "overview" && (
          <div className="bundesliga-lab-layout">
            {renderStandingsTable()}

            <aside className="bundesliga-lab-side">
              {renderResultsPanel({ compact: true })}
              {renderTipEvaluation({ compact: true })}
              {renderTopScorers({ compact: true })}
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
              <section className="bundesliga-dark-panel">
                <header><h3>Letzte Bundesliga-Codes</h3></header>
                <div className="bundesliga-code-list">
                  {inviteCodes.slice(0, 5).map((item) => (
                    <div key={item.id}>
                      <strong>{item.code}</strong>
                      <span>{item.status}</span>
                      <small>{getBundesligaInviteUrl(item.code)}</small>
                    </div>
                  ))}
                  {inviteCodes.length === 0 && <p>Noch keine Bundesliga-Codes erzeugt.</p>}
                </div>
              </section>
            </aside>
          </div>
        )}

        {activeLabView === "schedule" && renderSchedule()}
        {activeLabView === "table" && renderStandingsTable()}
        {activeLabView === "results" && renderResultsPanel()}
        {activeLabView === "tips" && renderTipEvaluation()}
        {activeLabView === "ranking" && renderRanking()}
        {activeLabView === "scorers" && renderTopScorers()}
      </div>
    </section>
  );
}
