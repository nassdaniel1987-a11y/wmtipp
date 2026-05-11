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
  LogOut,
  Medal,
  QrCode,
  ShieldCheck,
  Trophy,
  UsersRound,
} from "lucide-react";
import { demoCodes, matches, ranking } from "./data.js";

const STORAGE_KEY = "wm-tippspiel-prototyp";
const tabs = [
  { id: "start", label: "Start", icon: House },
  { id: "tippen", label: "Tippen", icon: Goal },
  { id: "rangliste", label: "Rangliste", icon: Trophy },
  { id: "admin", label: "Admin", icon: ShieldCheck },
];

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

function clampScore(value) {
  return Math.max(0, Math.min(12, value));
}

export default function App() {
  const savedState = useMemo(() => loadSavedState(), []);
  const scannedCode = getInitialCode();
  const [activeTab, setActiveTab] = useState("start");
  const [participant, setParticipant] = useState(savedState?.participant ?? null);
  const [name, setName] = useState(savedState?.participant?.name ?? "");
  const [tips, setTips] = useState(
    savedState?.tips ??
      Object.fromEntries(
        matches.map((match) => [
          match.id,
          {
            scoreA: match.scoreA ?? 0,
            scoreB: match.scoreB ?? 0,
            saved: false,
          },
        ]),
      ),
  );
  const [lastSavedMatch, setLastSavedMatch] = useState("");

  const activeCode = participant?.code || scannedCode || "DEMO-001";
  const knownCode = demoCodes.find((item) => item.code === activeCode);
  const codeState = knownCode?.status ?? (scannedCode ? "frei" : "demo");
  const canJoin = codeState === "frei" || codeState === "demo" || participant;

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
    setTips(
      Object.fromEntries(
        matches.map((match) => [
          match.id,
          { scoreA: match.scoreA ?? 0, scoreB: match.scoreB ?? 0, saved: false },
        ]),
      ),
    );
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
          <span>Ganztagsschule Cup</span>
          <strong>Tippen · Mitfiebern · Punkte sammeln</strong>
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
              setName={setName}
              saveParticipant={saveParticipant}
              setActiveTab={setActiveTab}
            />
          </aside>

          <section className="center-stage">
            {activeTab === "start" && (
              <>
                <MatchCard
                  match={matches[0]}
                  tip={tips[matches[0].id]}
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
              <div className="match-stack">
                {matches.map((match, index) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    tip={tips[match.id]}
                    changeScore={changeScore}
                    saveTip={saveTip}
                    lastSavedMatch={lastSavedMatch}
                    locked={!participant}
                    featured={index === 0}
                  />
                ))}
              </div>
            )}

            {activeTab === "rangliste" && (
              <RankingPanel ranking={displayRanking} expanded />
            )}

            {activeTab === "admin" && <AdminPanel participant={participant} />}
          </section>

          <aside className="side-stack">
            <RankingPanel ranking={displayRanking} />
            <UpcomingPanel />
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
            <small>Name gespeichert</small>
            <strong>{participant.name}</strong>
          </div>
          <button onClick={() => setActiveTab("tippen")}>Zum Tippen</button>
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
            Tipp speichern
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
          <strong>{match.status}</strong>
          <span>{match.group}</span>
        </div>
        <span className="match-time">
          <CalendarDays size={17} />
          {match.kickoff}
        </span>
      </header>

      <div className="match-body">
        <TeamBlock flag={match.flagA} name={match.teamA} />
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
        <TeamBlock flag={match.flagB} name={match.teamB} />
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
              : "Bereit zum Speichern"}
        </span>
      </footer>
    </article>
  );
}

function TeamBlock({ flag, name }) {
  return (
    <div className="team-block">
      <span className="flag" aria-hidden="true">
        {flag}
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
        <h2>Weitere Spiele heute</h2>
      </header>
      <div className="fixture-row">
        <span>15:00 Uhr</span>
        <strong>Marokko</strong>
        <b>1 : 1</b>
        <strong>Kroatien</strong>
      </div>
      <div className="fixture-row">
        <span>18:00 Uhr</span>
        <strong>Spanien</strong>
        <b>- : -</b>
        <strong>Schweiz</strong>
      </div>
      <button className="ghost-button">Alle Spiele anzeigen</button>
    </section>
  );
}

function InfoBanner() {
  return (
    <aside className="info-banner">
      <Medal size={42} />
      <div>
        <strong>Mit jedem richtigen Tipp sammelst du Punkte!</strong>
        <span>Zeig dein Fussballwissen und bringe deine Schule an die Spitze.</span>
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
