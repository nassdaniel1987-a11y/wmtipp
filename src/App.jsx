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
  demoCodes,
  knockoutPreview,
  matches,
  ranking,
  scheduleSource,
} from "./data.js";

const STORAGE_KEY = "wm-tippspiel-prototyp";
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

function loadSavedState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function createInitialTips(savedTips = {}) {
  return Object.fromEntries(
    matches.map((match) => {
      const saved = savedTips[match.id];
      return [
        match.id,
        {
          scoreA: Number.isInteger(saved?.scoreA) ? saved.scoreA : 0,
          scoreB: Number.isInteger(saved?.scoreB) ? saved.scoreB : 0,
          saved: Boolean(saved?.saved),
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

export default function App() {
  const savedState = useMemo(() => loadSavedState(), []);
  const scannedCode = getInitialCode();
  const [activeTab, setActiveTab] = useState("start");
  const [participant, setParticipant] = useState(savedState?.participant ?? null);
  const [name, setName] = useState(savedState?.participant?.name ?? "");
  const [tips, setTips] = useState(createInitialTips(savedState?.tips));
  const [lastSavedMatch, setLastSavedMatch] = useState("");
  const [groupFilter, setGroupFilter] = useState("alle");
  const [searchTerm, setSearchTerm] = useState("");

  const activeCode = participant?.code || scannedCode || "DEMO-001";
  const knownCode = demoCodes.find((item) => item.code === activeCode);
  const codeState = knownCode?.status ?? (scannedCode ? "frei" : "demo");
  const canJoin = codeState === "frei" || codeState === "demo" || participant;

  const savedTipCount = Object.values(tips).filter((tip) => tip.saved).length;
  const featuredMatch =
    matches.find((match) => match.teamA === "Germany" || match.teamB === "Germany") ??
    matches[0];

  const filteredMatches = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return matches.filter((match) => {
      const groupMatch =
        groupFilter === "alle" ||
        (groupFilter === "deutschland" &&
          [match.teamA, match.teamB].includes("Germany")) ||
        match.groupKey === groupFilter;
      const queryMatch =
        !query ||
        [match.teamA, match.teamB, match.city, match.venue, match.group]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return groupMatch && queryMatch;
    });
  }, [groupFilter, searchTerm]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ participant, tips }),
    );
  }, [participant, tips]);

  function saveParticipant(event) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || !canJoin) return;
    setParticipant({ name: cleanName, code: activeCode });
    setActiveTab("tippen");
  }

  function resetDemo() {
    window.localStorage.removeItem(STORAGE_KEY);
    setParticipant(null);
    setName("");
    setLastSavedMatch("");
    setTips(createInitialTips());
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

  function saveTip(matchId) {
    setTips((current) => ({
      ...current,
      [matchId]: { ...current[matchId], saved: true },
    }));
    setLastSavedMatch(matchId);
  }

  function saveVisibleTips() {
    setTips((current) => {
      const next = { ...current };
      filteredMatches.forEach((match) => {
        next[match.id] = { ...next[match.id], saved: true };
      });
      return next;
    });
    setLastSavedMatch(filteredMatches[0]?.id ?? "");
  }

  const displayRanking = participant
    ? ranking.map((row) =>
        row.name === "Max Mustermann"
          ? { ...row, name: participant.name, isCurrent: true }
          : row,
      )
    : ranking;

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
            <small>Angemeldet als</small>
            <strong>{participant?.name || "Gast"}</strong>
          </span>
          <ChevronDown size={18} />
        </div>

        <button className="icon-button" onClick={resetDemo} aria-label="Demo zuruecksetzen">
          <LogOut size={20} />
        </button>
      </header>

      <main className="stadium">
        <section className="scoreboard-strip" aria-label="Turnieruebersicht">
          <span>WM 2026 · 72 Gruppenspiele</span>
          <strong>{savedTipCount} von {matches.length} Tipps gespeichert</strong>
          <span>Demo-Code: DEMO-001</span>
        </section>

        <div className="content-grid">
          <aside className="join-panel panel">
            <StartPanel
              activeCode={activeCode}
              canJoin={canJoin}
              codeState={codeState}
              name={name}
              participant={participant}
              savedTipCount={savedTipCount}
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

            {activeTab === "admin" && <AdminPanel participant={participant} />}
          </section>

          <aside className="side-stack">
            <RankingPanel ranking={displayRanking} />
            <UpcomingPanel />
            <KnockoutPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}

function StartPanel({
  activeCode,
  canJoin,
  codeState,
  name,
  participant,
  savedTipCount,
  setName,
  saveParticipant,
  setActiveTab,
}) {
  return (
    <>
      <div className="panel-heading">
        <UsersRound size={42} />
        <div>
          <h1>Jetzt mitmachen</h1>
          <p>QR-Code scannen und am WM-Tippspiel teilnehmen.</p>
        </div>
      </div>

      <div className={`code-status ${canJoin ? "ok" : "bad"}`}>
        <Check size={20} />
        <strong>{canJoin ? "Code erkannt" : "Code nicht gueltig"}</strong>
      </div>

      <div className="code-box">
        <QrCode size={28} />
        <span>{activeCode}</span>
      </div>

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
        Im Prototyp wird dein Name nur in diesem Browser gespeichert. Spaeter
        uebernimmt eine Datenbank die echte QR-Code-Zuordnung.
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
  changeScore,
  saveTip,
  lastSavedMatch,
  locked,
  featured,
}) {
  return (
    <article className={`match-card panel ${featured ? "featured" : ""}`}>
      <header className="match-header">
        <div>
          <strong>Spiel {match.matchNumber}</strong>
          <span>{match.status} · {match.group}</span>
        </div>
        <span className="match-time">
          <CalendarDays size={17} />
          {formatDate(match.date)} · {match.time} ET
        </span>
      </header>

      <div className="venue-line">
        {match.city} · {match.venue}
      </div>

      <div className="match-body">
        <TeamBlock flagCode={match.flagCodeA} name={match.teamA} />
        <ScoreControl
          value={tip.scoreA}
          onIncrease={() => changeScore(match.id, "scoreA", 1)}
          onDecrease={() => changeScore(match.id, "scoreA", -1)}
          disabled={locked}
        />
        <span className="score-separator">:</span>
        <ScoreControl
          value={tip.scoreB}
          onIncrease={() => changeScore(match.id, "scoreB", 1)}
          onDecrease={() => changeScore(match.id, "scoreB", -1)}
          disabled={locked}
        />
        <TeamBlock flagCode={match.flagCodeB} name={match.teamB} />
      </div>

      <footer className="match-actions">
        <button
          className="save-tip"
          onClick={() => saveTip(match.id)}
          disabled={locked}
        >
          <ShieldCheck size={17} />
          Tipp speichern
        </button>
        <span className={tip.saved || lastSavedMatch === match.id ? "saved" : ""}>
          {locked
            ? "Erst Namen eintragen"
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

function UpcomingPanel() {
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
      <button className="ghost-button">Alle 72 Gruppenspiele im Tippbereich</button>
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
        <strong>Jetzt werden echte Gruppenspiele getippt.</strong>
        <span>Die K.-o.-Runde ist vorbereitet und bekommt spaeter die qualifizierten Teams.</span>
      </div>
    </aside>
  );
}

function AdminPanel({ participant }) {
  const rows = demoCodes.map((row) =>
    participant && row.code === participant.code
      ? { ...row, status: "vergeben", name: participant.name }
      : row,
  );

  return (
    <section className="admin-panel panel">
      <header className="admin-hero">
        <ShieldCheck size={34} />
        <div>
          <h2>Admin-Vorschau</h2>
          <p>Hier sieht man spaeter, welche QR-Codes frei oder bereits vergeben sind.</p>
        </div>
      </header>

      <div className="admin-grid">
        {rows.map((row) => (
          <article key={row.code} className={`code-card ${row.status}`}>
            <QrCode size={26} />
            <strong>{row.code}</strong>
            <span>{row.name || statusLabel(row.status)}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status) {
  if (status === "frei") return "frei";
  if (status === "vergeben") return "vergeben";
  return "ungueltig";
}
