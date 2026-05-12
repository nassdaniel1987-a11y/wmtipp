import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
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
    tipCount: 6,
    scoredTipCount: 5,
    averagePoints: 2,
  },
];
const TEST_SCENARIOS = [
  { label: "Exaktes Ergebnis", tipA: 2, tipB: 1, resultA: 2, resultB: 1, points: 4 },
  { label: "Tendenz + Tordifferenz", tipA: 2, tipB: 1, resultA: 3, resultB: 2, points: 3 },
  { label: "Richtige Tendenz", tipA: 1, tipB: 0, resultA: 2, resultB: 0, points: 2 },
  { label: "Falsche Tendenz", tipA: 0, tipB: 1, resultA: 2, resultB: 0, points: 0 },
  { label: "Remis-Tendenz", tipA: 1, tipB: 1, resultA: 2, resultB: 2, points: 2 },
];

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

function getInviteUrl(code) {
  const url = new URL(window.location.origin);
  url.searchParams.set("code", code);
  url.hash = "start";
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

function QrCodeImage({ value }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 1,
      scale: 7,
      color: {
        dark: "#071b45",
        light: "#ffffff",
      },
    })
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
          scoreA: Number.isInteger(saved?.score_a) ? saved.score_a : 0,
          scoreB: Number.isInteger(saved?.score_b) ? saved.score_b : 0,
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

function createInitialBonusTips(matches, savedBonusTip = null) {
  const groups = getGroups(matches);
  const savedGroupWinners = savedBonusTip?.group_winners ?? savedBonusTip?.groupWinners ?? {};

  return {
    champion: savedBonusTip?.champion ?? "",
    topScorer: savedBonusTip?.top_scorer ?? savedBonusTip?.topScorer ?? "",
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

function createInitialBonusResults(matches, savedBonusResults = null) {
  const groups = getGroups(matches);
  const savedGroupWinners = savedBonusResults?.group_winners ?? savedBonusResults?.groupWinners ?? {};

  return {
    champion: savedBonusResults?.champion ?? "",
    topScorer: savedBonusResults?.top_scorer ?? savedBonusResults?.topScorer ?? "",
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

function formatDate(date) {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${date}T12:00:00`));
}

function isLockedForUsers(match) {
  if (!match?.kickoffAt) return false;
  return new Date(match.kickoffAt).getTime() <= Date.now();
}

function pointsFor(tip, result) {
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
  if (normalizeText(bonusTip.topScorer) && normalizeText(bonusTip.topScorer) === normalizeText(bonusResult.topScorer)) {
    points += bonusPointValues.topScorer;
  }

  Object.entries(bonusResult.groupWinners ?? {}).forEach(([groupKey, winner]) => {
    if (normalizeText(bonusTip.groupWinners?.[groupKey]) && normalizeText(bonusTip.groupWinners?.[groupKey]) === normalizeText(winner)) {
      points += bonusPointValues.groupWinner;
    }
  });
  return points;
}

function getGroupLeaderSuggestions(groupTables) {
  return Object.fromEntries(
    groupTables.map((group) => [group.groupKey, group.rows[0]?.team ?? ""]),
  );
}

export default function App() {
  const isTestMode = useMemo(() => getIsTestMode(), []);
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
  const [bonusMessage, setBonusMessage] = useState("");
  const [ranking, setRanking] = useState(() => (isTestMode ? TEST_RANKING_ROWS : []));
  const [lastSavedMatch, setLastSavedMatch] = useState("");
  const [groupFilter, setGroupFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [appStatus, setAppStatus] = useState(isTestMode ? "Testmodus aktiv" : "Spielplan wird geladen...");
  const [codeStatus, setCodeStatus] = useState(isTestMode ? "claimed" : scannedCode ? "checking" : "missing");
  const [adminSession, setAdminSession] = useState(null);
  const [adminData, setAdminData] = useState({ codes: [], participants: [], tips: [], bonusTips: [], bonusResults: null, results: [] });

  const setActiveTab = useCallback((tabId, { replace = false } = {}) => {
    if (!tabIds.has(tabId)) return;

    setActiveTabState(tabId);
    const nextUrl = `${window.location.pathname}${window.location.search}#${tabId}`;
    if (window.location.hash === `#${tabId}`) return;

    if (replace) {
      window.history.replaceState(null, "", nextUrl);
    } else {
      window.history.pushState(null, "", nextUrl);
    }
  }, []);

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
      : ranking;
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [ranking, participant, currentPoints, currentMatchPoints, currentBonusPoints, currentTipCount, currentScoredTipCount, currentAveragePoints]);
  const teamOptions = useMemo(() => getTeamOptions(matches), [matches]);
  const groupTables = useMemo(() => buildGroupTables(matches, resultsByMatch), [matches, resultsByMatch]);

  useEffect(() => {
    function syncTabFromUrl() {
      setActiveTabState(getTabFromHash());
    }

    window.addEventListener("hashchange", syncTabFromUrl);
    window.addEventListener("popstate", syncTabFromUrl);
    return () => {
      window.removeEventListener("hashchange", syncTabFromUrl);
      window.removeEventListener("popstate", syncTabFromUrl);
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      if (isTestMode) {
        setMatches(bundledMatches);
        setResults(createTestResults(bundledMatches));
        setTips(createTestTips(bundledMatches));
        setBonusTips(createTestBonusTips(bundledMatches));
        setBonusResults(createTestBonusResults(bundledMatches));
        setRanking(TEST_RANKING_ROWS);
        setCodeStatus("claimed");
        setAppStatus("Testmodus aktiv");
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(TEST_PARTICIPANT));
        setActiveTab("start", { replace: true });
        return;
      }

      try {
        const [dbMatches, dbResults, rankPayload, bonusPayload, session] = await Promise.all([
          loadDbMatches(),
          loadResults(),
          apiGet("/api/ranking").catch(() => ({ ranking: [] })),
          apiGet("/api/bonus-results").catch(() => ({ bonusResults: null })),
          getAdminSession(),
        ]);

        const nextMatches = dbMatches.length ? dbMatches.map(mapDbMatch) : bundledMatches;
        setMatches(nextMatches);
        setResults(dbResults);
        setRanking(rankPayload.ranking ?? []);
        setAdminSession(session);
        setTips(createInitialTips(nextMatches));
        setBonusTips(createInitialBonusTips(nextMatches));
        setBonusResults(createInitialBonusResults(nextMatches, bonusPayload.bonusResults));
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
        setBonusTips(createInitialBonusTips(matches, bonusPayload.bonusTip));
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
    setBonusTips(createInitialBonusTips(matches));
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
        [side]: clampScore(current[matchId][side] + delta),
        saved: false,
      },
    }));
  }

  async function saveTip(matchId) {
    await saveTipRows([matchId]);
    setLastSavedMatch(matchId);
  }

  async function saveVisibleTips() {
    await saveTipRows(filteredMatches.map((match) => match.id));
    setLastSavedMatch(filteredMatches[0]?.id ?? "");
  }

  async function saveBonusTips() {
    if (!participant?.id) {
      setBonusMessage("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
      return;
    }

    if (isTestMode) {
      setBonusTips((current) => ({ ...current, saved: true }));
      setBonusMessage("Test-Bonus gespeichert. Rangliste bleibt lokal berechnet.");
      await refreshRanking();
      return;
    }

    try {
      const payload = await apiPost("/api/save-bonus-tips", {
        participantId: participant.id,
        champion: bonusTips.champion,
        topScorer: bonusTips.topScorer,
        groupWinners: bonusTips.groupWinners,
      });
      setBonusTips(createInitialBonusTips(matches, payload.bonusTip));
      setBonusMessage("Bonus-Tipps gespeichert.");
      await refreshRanking();
    } catch (error) {
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

  async function saveTipRows(matchIds) {
    if (!participant?.id) {
      setAppStatus("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
      return;
    }

    if (isTestMode) {
      setTips((current) => {
        const next = { ...current };
        matchIds.forEach((matchId) => {
          next[matchId] = { ...next[matchId], saved: true };
        });
        return next;
      });
      setAppStatus("Test-Tipp gespeichert. Punkte werden lokal neu berechnet.");
      await refreshRanking();
      return;
    }

    try {
      const payload = await apiPost("/api/save-tips", {
        participantId: participant.id,
        tips: matchIds.map((matchId) => ({
          matchId,
          scoreA: tips[matchId].scoreA,
          scoreB: tips[matchId].scoreB,
        })),
      });

      const savedIds = new Set((payload.tips ?? []).map((tip) => tip.match_id));
      setTips((current) => {
        const next = { ...current };
        savedIds.forEach((matchId) => {
          next[matchId] = { ...next[matchId], saved: true };
        });
        return next;
      });
      setAppStatus("Tipp gespeichert.");
      await refreshRanking();
    } catch (error) {
      setAppStatus(error.message);
    }
  }

  async function refreshAdminData(session = adminSession) {
    if (!session?.access_token) return;
    const payload = await apiGetWithAuth("/api/admin-data", session.access_token);
    setAdminData(payload);
    setBonusResults(createInitialBonusResults(matches, payload.bonusResults));
  }

  async function handleAdminLogin(email, password) {
    const session = await signInAdmin(email, password);
    setAdminSession(session);
    await refreshAdminData(session);
  }

  async function handleAdminLogout() {
    await signOutAdmin();
    setAdminSession(null);
    setAdminData({ codes: [], participants: [], tips: [], bonusTips: [], bonusResults: null, results: [] });
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
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              className={`nav-button ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
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
                    changeScore={changeScore}
                    saveTip={saveTip}
                    lastSavedMatch={lastSavedMatch}
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
                groupTables={groupTables}
                bonusTips={bonusTips}
                setBonusTips={setBonusTips}
                saveBonusTips={saveBonusTips}
                bonusMessage={bonusMessage}
                changeScore={changeScore}
                saveTip={saveTip}
                saveVisibleTips={saveVisibleTips}
                lastSavedMatch={lastSavedMatch}
                locked={!participant}
              />
            )}

            {activeTab === "rangliste" && (
              <RankingPanel ranking={displayRanking} expanded />
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
                  setBonusResults(createInitialBonusResults(matches, payload.bonusResults));
                  await refreshRanking();
                  return payload;
                }}
                onSaveResult={handleSaveResult}
              />
            )}
          </section>

          <aside className="side-stack">
            <RankingPanel ranking={displayRanking} setActiveTab={setActiveTab} />
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
  groupTables,
  bonusTips,
  setBonusTips,
  saveBonusTips,
  bonusMessage,
  changeScore,
  saveTip,
  saveVisibleTips,
  lastSavedMatch,
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
            Bonus-Tipps gelten für das ganze Turnier. Die Gruppentabellen werden
            aus den eingetragenen Ergebnissen berechnet.
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
              locked={locked}
            />
          ))}
        </div>
      ) : (
        <>
          <BonusTipsPanel
            matches={matches}
            teamOptions={teamOptions}
            groupTables={groupTables}
            bonusTips={bonusTips}
            setBonusTips={setBonusTips}
            saveBonusTips={saveBonusTips}
            bonusMessage={bonusMessage}
            locked={locked}
          />
          <GroupsOverview groupTables={groupTables} />
        </>
      )}
    </div>
  );
}

function BonusTipsPanel({
  teamOptions,
  groupTables,
  bonusTips,
  setBonusTips,
  saveBonusTips,
  bonusMessage,
  locked,
}) {
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

      <div className="bonus-main-grid">
        <label>
          Weltmeister
          <select
            value={bonusTips.champion}
            disabled={locked}
            onChange={(event) =>
              setBonusTips((current) => ({ ...current, champion: event.target.value, saved: false }))
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
          <input
            value={bonusTips.topScorer}
            disabled={locked}
            onChange={(event) =>
              setBonusTips((current) => ({ ...current, topScorer: event.target.value, saved: false }))
            }
            placeholder="Name des Spielers"
          />
        </label>
      </div>

      <h3>Gruppensieger</h3>
      <div className="group-winner-grid">
        {groupTables.map((group) => (
          <label key={group.groupKey}>
            Gruppe {group.groupKey}
            <select
              value={bonusTips.groupWinners[group.groupKey] ?? ""}
              disabled={locked}
              onChange={(event) => updateGroupWinner(group.groupKey, event.target.value)}
            >
              <option value="">Bitte wählen</option>
              {group.teams.map((team) => (
                <option key={team.name} value={team.name}>{team.name}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="bonus-actions">
        <button type="button" className="primary-button compact" disabled={locked} onClick={saveBonusTips}>
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
  locked,
  featured,
}) {
  if (!match || !tip) return null;
  const lockedByKickoff = isLockedForUsers(match);
  const isLocked = locked || lockedByKickoff;

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
          disabled={isLocked}
        >
          <ShieldCheck size={17} />
          Tipp speichern
        </button>
        <span className={tip.saved || lastSavedMatch === match.id ? "saved" : ""}>
          {locked
            ? "Erst QR-Code aktivieren"
            : lockedByKickoff
              ? "Tipp gesperrt: Spiel gestartet"
            : tip.saved || lastSavedMatch === match.id
              ? "Tipp gespeichert"
              : "Noch nicht gespeichert"}
        </span>
      </footer>
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
      <strong>{value}</strong>
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

  return (
    <section className={`ranking-panel panel ${expanded ? "expanded" : ""}`}>
      <header className="section-title">
        <Trophy size={24} />
        <h2>Rangliste</h2>
        <span>Top 10</span>
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
            <tr key={`${row.name}-${index}`} className={row.isCurrent ? "current" : ""}>
              <td>{index + 1}</td>
              <td>{row.name}</td>
              {expanded && rankingMode === "total" && <td>{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "total" && <td>{row.matchPoints ?? row.points}</td>}
              {expanded && rankingMode === "total" && <td>{row.bonusPoints ?? 0}</td>}
              {expanded && rankingMode === "average" && <td>{row.tipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td>{row.scoredTipCount ?? 0}</td>}
              {expanded && rankingMode === "average" && <td>{(row.averagePoints ?? 0).toFixed(2)}</td>}
              <td>{rankingMode === "average" ? row.matchPoints ?? row.points : row.points}</td>
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
  groupTables,
  bonusResults,
  resultsByMatch,
  onLogin,
  onLogout,
  onRefresh,
  onCreateCodes,
  onCreateParticipant,
  onDeleteParticipant,
  onDeleteCode,
  onSaveParticipantTips,
  onSaveParticipantBonusTips,
  onSaveBonusResults,
  onSaveResult,
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

  useEffect(() => {
    setBonusResultDraft(createInitialBonusResults(matches, bonusResults));
  }, [matches, bonusResults]);

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

  const visibleCodes = adminData.codes.slice(0, 12);
  const printableCodes = visibleCodes.filter((code) => selectedCodeIds.includes(code.id));

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
            scoreA: Number.isInteger(tip?.score_a) ? tip.score_a : 0,
            scoreB: Number.isInteger(tip?.score_b) ? tip.score_b : 0,
            saved: Boolean(tip),
          },
        ];
      }),
    );
    setSelectedParticipant(participant);
    setParticipantTipDrafts(drafts);
    setParticipantBonusDraft(createInitialBonusTips(matches, existingBonusTip));
  }

  async function saveSelectedParticipantTips(matchIds) {
    if (!selectedParticipant) return;
    try {
      const payload = await onSaveParticipantTips(
        selectedParticipant.id,
        matchIds.map((matchId) => ({
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
        groupWinners: participantBonusDraft.groupWinners,
      });
      setParticipantBonusDraft(createInitialBonusTips(matches, payload.bonusTip));
      setAdminMessage(`Bonus-Tipps für ${selectedParticipant.display_name} gespeichert.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  async function saveOfficialBonusResults() {
    try {
      const payload = await onSaveBonusResults(bonusResultDraft);
      setBonusResultDraft(createInitialBonusResults(matches, payload.bonusResults));
      setAdminMessage("Offizielle Bonus-Ergebnisse gespeichert.");
    } catch (error) {
      setAdminMessage(error.message);
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
          <h2>Adminbereich</h2>
          <p>QR-Codes erzeugen, Teilnehmer ansehen und Spielergebnisse eintragen.</p>
        </div>
      </header>

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
            <input
              value={bonusResultDraft.topScorer}
              onChange={(event) =>
                setBonusResultDraft((current) => ({ ...current, topScorer: event.target.value }))
              }
              placeholder="Name des Spielers"
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
      <div className="print-actions">
        <button type="button" className="ghost-button" onClick={selectAllVisibleCodes}>
          Sichtbare auswählen
        </button>
        <button type="button" className="ghost-button" onClick={() => setSelectedCodeIds([])}>
          Auswahl leeren
        </button>
        <button type="button" className="primary-button compact" onClick={printSelectedCodes}>
          Ausgewählte QR-Codes drucken
        </button>
      </div>
      <div className="admin-grid">
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
      </div>
      <section className="print-sheet" aria-hidden="true">
        {printableCodes.map((row) => (
          <article className="print-code-card" key={row.id}>
            <header>
              <img src="/oesterfeld-logo-round.jpg" alt="" />
              <div>
                <span>WM-Tippspiel</span>
                <strong>Österfeld-Edition</strong>
              </div>
            </header>
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
      </section>

      <h3>Teilnehmer</h3>
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
              <button type="button" className="participant-open" onClick={() => openParticipant(participant)}>
                {participant.display_name}
              </button>
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
                  <input
                    value={participantBonusDraft.topScorer}
                    onChange={(event) =>
                      setParticipantBonusDraft((current) => ({ ...current, topScorer: event.target.value, saved: false }))
                    }
                    placeholder="Name des Spielers"
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
                const draft = participantTipDrafts[match.id] ?? { scoreA: 0, scoreB: 0 };
                return (
                  <div className="participant-tip-row" key={match.id}>
                    <span>Spiel {match.matchNumber}</span>
                    <strong>{match.teamA} - {match.teamB}</strong>
                    <input
                      type="number"
                      min="0"
                      max="12"
                      value={draft.scoreA}
                      onChange={(event) =>
                        setParticipantTipDrafts((current) => ({
                          ...current,
                          [match.id]: {
                            ...current[match.id],
                            scoreA: Number(event.target.value),
                            saved: false,
                          },
                        }))
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      max="12"
                      value={draft.scoreB}
                      onChange={(event) =>
                        setParticipantTipDrafts((current) => ({
                          ...current,
                          [match.id]: {
                            ...current[match.id],
                            scoreB: Number(event.target.value),
                            saved: false,
                          },
                        }))
                      }
                    />
                    <button type="button" className="save-tip" onClick={() => saveSelectedParticipantTips([match.id])}>
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
    </section>
  );
}
