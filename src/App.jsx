import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleUserRound,
  Goal,
  House,
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
  { id: "admin", label: "Admin", icon: ShieldCheck },
];
const groupFilters = ["alle", "deutschland", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

function getInitialCode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("code")?.trim() || "";
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
  const tipTrend = Math.sign(tip.scoreA - tip.scoreB);
  const resultTrend = Math.sign(result.score_a - result.score_b);
  return tipTrend === resultTrend ? 2 : 0;
}

export default function App() {
  const scannedCode = getInitialCode();
  const savedParticipant = useMemo(() => loadSavedParticipant(), []);
  const [activeTab, setActiveTab] = useState("start");
  const [participant, setParticipant] = useState(savedParticipant);
  const [name, setName] = useState(savedParticipant?.name ?? "");
  const [manualCode, setManualCode] = useState("");
  const [matches, setMatches] = useState(bundledMatches);
  const [results, setResults] = useState([]);
  const [tips, setTips] = useState(createInitialTips(bundledMatches));
  const [ranking, setRanking] = useState([]);
  const [lastSavedMatch, setLastSavedMatch] = useState("");
  const [groupFilter, setGroupFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");
  const [appStatus, setAppStatus] = useState("Spielplan wird geladen...");
  const [codeStatus, setCodeStatus] = useState(scannedCode ? "checking" : "missing");
  const [adminSession, setAdminSession] = useState(null);
  const [adminData, setAdminData] = useState({ codes: [], participants: [], tips: [], results: [] });

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

  const currentPoints = Object.entries(tips).reduce((sum, [matchId, tip]) => {
    return sum + pointsFor(tip, resultsByMatch.get(matchId));
  }, 0);

  const displayRanking = useMemo(() => {
    const rows = participant
      ? [
          ...ranking.filter((row) => row.name !== participant.name),
          { name: participant.name, points: currentPoints, isCurrent: true },
        ]
      : ranking;
    return rows.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [ranking, participant, currentPoints]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [dbMatches, dbResults, rankPayload, session] = await Promise.all([
          loadDbMatches(),
          loadResults(),
          apiGet("/api/ranking").catch(() => ({ ranking: [] })),
          getAdminSession(),
        ]);

        const nextMatches = dbMatches.length ? dbMatches.map(mapDbMatch) : bundledMatches;
        setMatches(nextMatches);
        setResults(dbResults);
        setRanking(rankPayload.ranking ?? []);
        setAdminSession(session);
        setTips(createInitialTips(nextMatches));
        setAppStatus("Spielplan bereit");
      } catch (error) {
        setAppStatus("Spielplan wird vorbereitet");
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    async function resolveParticipant() {
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
        }
      } catch {
        setCodeStatus("unknown");
      }
    }

    resolveParticipant();
  }, [activeCode, participant?.id]);

  useEffect(() => {
    async function loadParticipantTips() {
      if (!participant?.id) return;
      try {
        const payload = await apiGet(`/api/tips?participantId=${encodeURIComponent(participant.id)}`);
        setTips(createInitialTips(matches, payload.tips ?? []));
      } catch (error) {
        setAppStatus("Tipps konnten gerade nicht geladen werden");
      }
    }

    loadParticipantTips();
  }, [participant?.id, matches]);

  async function saveParticipant(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !activeCode) return;

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
      setActiveTab("tippen");
    } catch (error) {
      setAppStatus(error.message);
    }
  }

  function resetDevice() {
    window.localStorage.removeItem(STORAGE_KEY);
    setParticipant(null);
    setName("");
    setManualCode("");
    setLastSavedMatch("");
    setTips(createInitialTips(matches));
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

  async function saveTipRows(matchIds) {
    if (!participant?.id) {
      setAppStatus("Bitte zuerst QR-Code aktivieren und Namen eintragen.");
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
    } catch (error) {
      setAppStatus(error.message);
    }
  }

  async function refreshAdminData(session = adminSession) {
    if (!session?.access_token) return;
    const payload = await apiGetWithAuth("/api/admin-data", session.access_token);
    setAdminData(payload);
  }

  async function handleAdminLogin(email, password) {
    const session = await signInAdmin(email, password);
    setAdminSession(session);
    await refreshAdminData(session);
  }

  async function handleAdminLogout() {
    await signOutAdmin();
    setAdminSession(null);
    setAdminData({ codes: [], participants: [], tips: [], results: [] });
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
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActiveTab("start")}>
          <span className="brand-ball">⚽</span>
          <span>WM-Tippspiel</span>
        </button>

        <nav className="main-nav" aria-label="Hauptnavigation">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
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
          className="icon-button"
          onClick={adminSession ? handleAdminLogout : resetDevice}
          aria-label={adminSession ? "Admin abmelden" : "Dieses Geraet zuruecksetzen"}
          title={adminSession ? "Admin abmelden" : "Dieses Geraet zuruecksetzen"}
        >
          <LogOut size={20} />
        </button>
      </header>

      <main className="stadium">
        <section className="scoreboard-strip" aria-label="Turnieruebersicht">
          <span>WM 2026 · {matches.length} Gruppenspiele</span>
          <strong>{savedTipCount} von {matches.length} Tipps gespeichert</strong>
          <span>{appStatus}</span>
        </section>

        <div className="content-grid">
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
              <>
                <ScheduleSummary />
                <MatchCard
                  match={featuredMatch}
                  tip={tips[featuredMatch.id]}
                  result={resultsByMatch.get(featuredMatch.id)}
                  changeScore={changeScore}
                  saveTip={saveTip}
                  lastSavedMatch={lastSavedMatch}
                  locked={!participant}
                  featured
                />
                <InfoBanner />
              </>
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

            {activeTab === "admin" && (
              <AdminPanel
                session={adminSession}
                adminData={adminData}
                matches={matches}
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
                    codes: current.codes.map((code) =>
                      code.id === payload.freedCodeId
                        ? { ...code, status: "free", participant: null, claimed_at: null }
                        : code,
                    ),
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
                  return payload;
                }}
                onSaveResult={handleSaveResult}
              />
            )}
          </section>

          <aside className="side-stack">
            <RankingPanel ranking={displayRanking} />
            <UpcomingPanel matches={matches} />
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
          ? "Code wird geprueft"
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
          <button onClick={() => setActiveTab("tippen")}>Zum WM-Plan</button>
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
          <h2>Offizieller WM-Plan als Tippgrundlage</h2>
          <p>{scheduleSource.label}</p>
        </div>
      </header>
      <div className="summary-stats">
        <strong>72<span>Gruppenspiele</span></strong>
        <strong>12<span>Gruppen</span></strong>
        <strong>11.06.-27.06.<span>Gruppenphase</span></strong>
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
  changeScore,
  saveTip,
  saveVisibleTips,
  lastSavedMatch,
  locked,
}) {
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
          className="primary-button compact"
          disabled={locked || filteredMatches.length === 0}
          onClick={saveVisibleTips}
        >
          Sichtbare Tipps speichern
          <Check size={18} />
        </button>
      </section>

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
    </div>
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
      <button onClick={onIncrease} disabled={disabled} aria-label="Tor hinzufuegen">
        <ChevronUp size={22} />
      </button>
      <strong>{value}</strong>
      <button onClick={onDecrease} disabled={disabled} aria-label="Tor entfernen">
        <ChevronDown size={22} />
      </button>
    </div>
  );
}

function RankingPanel({ ranking: rows, expanded = false }) {
  const visibleRows = expanded ? rows : rows.slice(0, 10);
  return (
    <section className={`ranking-panel panel ${expanded ? "expanded" : ""}`}>
      <header className="section-title">
        <Trophy size={24} />
        <h2>Rangliste</h2>
        <span>Top 10</span>
      </header>
      <table>
        <thead>
          <tr>
            <th>Platz</th>
            <th>Name</th>
            <th>Punkte</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.length === 0 && (
            <tr>
              <td colSpan="3">Noch keine Punkte vorhanden.</td>
            </tr>
          )}
          {visibleRows.map((row, index) => (
            <tr key={`${row.name}-${index}`} className={row.isCurrent ? "current" : ""}>
              <td>{index + 1}</td>
              <td>{row.name}</td>
              <td>{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!expanded && <button className="ghost-button">Zur vollstaendigen Rangliste</button>}
    </section>
  );
}

function UpcomingPanel({ matches }) {
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
      <button className="ghost-button">Alle Spiele im Tippbereich</button>
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
        <strong>Alles bereit fuer eure Tipprunde.</strong>
        <span>Codes, Tipps, Ergebnisse und Rangliste werden zentral gespeichert.</span>
      </div>
    </aside>
  );
}

function AdminPanel({
  session,
  adminData,
  matches,
  resultsByMatch,
  onLogin,
  onLogout,
  onRefresh,
  onCreateCodes,
  onCreateParticipant,
  onDeleteParticipant,
  onSaveParticipantTips,
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
    if (!window.confirm(`${displayName} wirklich loeschen? Die Tipps werden entfernt und der Code wird wieder frei.`)) {
      return;
    }

    try {
      await onDeleteParticipant(participantId);
      setAdminMessage(`${displayName} wurde geloescht.`);
    } catch (error) {
      setAdminMessage(error.message);
    }
  }

  function openParticipant(participant) {
    const existingTips = adminData.tips.filter((tip) => tip.participant_id === participant.id);
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
      setAdminMessage(`Tipps fuer ${selectedParticipant.display_name} gespeichert.`);
    } catch (error) {
      setAdminMessage(error.message);
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
          <h2>Adminbereich</h2>
          <p>QR-Codes erzeugen, Teilnehmer ansehen und Spielergebnisse eintragen.</p>
        </div>
      </header>

      <div className="admin-actions">
        <button className="ghost-button" onClick={onRefresh}>Daten aktualisieren</button>
        <button className="ghost-button" onClick={onLogout}>Admin abmelden</button>
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
        <button className="primary-button compact" onClick={createCodes}>Codes erzeugen</button>
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

      <h3>QR-Codes</h3>
      <p className="fine-print">
        Diese Codes werden an Teilnehmende ausgegeben. Der komplette Link kann
        als QR-Code gedruckt werden; die Nummer kann am PC manuell eingegeben werden.
      </p>
      <div className="admin-grid">
        {adminData.codes.slice(0, 12).map((row) => (
          <article key={row.id} className={`code-card ${row.status}`}>
            <QrCode size={26} />
            <strong>{row.code}</strong>
            <span>{row.participant?.display_name || row.status}</span>
            <small>{`${window.location.origin}/?code=${row.code}`}</small>
          </article>
        ))}
      </div>

      <h3>Teilnehmer</h3>
      <div className="participant-list">
        {adminData.participants.length === 0 && (
          <p className="fine-print">Noch keine Teilnehmer angelegt.</p>
        )}
        {adminData.participants.map((participant) => {
          const code = adminData.codes.find((item) => item.participant?.id === participant.id);
          const tipCount = new Set(
            adminData.tips
              .filter((tip) => tip.participant_id === participant.id)
              .map((tip) => tip.match_id),
          ).size;

          return (
            <div className="participant-row" key={participant.id}>
              <button className="participant-open" onClick={() => openParticipant(participant)}>
                {participant.display_name}
              </button>
              <span>{code?.code || "ohne Code"}</span>
              <span className="participant-tip-count">
                {tipCount} / {matches.length} Tipps
              </span>
              <button
                className="danger-button"
                onClick={() => deleteParticipant(participant.id, participant.display_name)}
              >
                Loeschen
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
            className={resultFilter === "open" ? "active" : ""}
            onClick={() => setResultFilter("open")}
          >
            Offen
          </button>
          <button
            className={resultFilter === "started" ? "active" : ""}
            onClick={() => setResultFilter("started")}
          >
            Gestartet
          </button>
          <button
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
              <button className="save-tip" onClick={() => saveResult(match.id)}>Speichern</button>
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
              <button className="icon-button" onClick={() => setSelectedParticipant(null)}>
                ×
              </button>
            </header>

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
                    <button className="save-tip" onClick={() => saveSelectedParticipantTips([match.id])}>
                      {draft.saved ? "Gespeichert" : "Speichern"}
                    </button>
                  </div>
                );
              })}
            </div>

            <footer>
              <button
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
