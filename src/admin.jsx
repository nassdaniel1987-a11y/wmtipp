// Admin-Bereich: WM-Verwaltung (AdminPanel) und WM-Testmodus-Verwaltung.
import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  House,
  ListFilter,
  QrCode,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { apiGet, apiGetWithAuth, apiPost } from "./api.js";
import { displayTeamName } from "./teamNames.js";
import { chunkArray, formatDate, formatNumericDate } from "./lib/format.js";
import { getGroupLeaderSuggestions, isCompleteTip } from "./lib/scoring.js";
import { KO_PHASE_LABELS, codeStatusLabels, competitions } from "./lib/constants.js";
import { findPlayerByText, normalizePlayerName, playerLabel } from "./lib/players.js";
import {
  createInitialBonusResults,
  createInitialBonusTips,
  getGroups,
  getInviteUrl,
  isBonusTipStarted,
  isKnockoutPhase,
} from "./lib/wm.js";
import { QrCodeImage, createQrCodeDataUrl } from "./components/shared.jsx";
import { PlayerSelect, RankingPanel } from "./components/wm.jsx";
import { BUNDESLIGA_FEATURE_ENABLED, BundesligaAdminArea } from "./bundesliga.jsx";
export function AdminPanel({
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
  const isBundesligaAdmin = BUNDESLIGA_FEATURE_ENABLED && adminCompetition === competitions.bundesliga.id;
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
          {BUNDESLIGA_FEATURE_ENABLED && (
            <button
              type="button"
              className={isBundesligaAdmin ? "active" : ""}
              onClick={() => setAdminCompetition(competitions.bundesliga.id)}
            >
              Bundesliga
            </button>
          )}
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

export function WmTestAdminArea({
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


