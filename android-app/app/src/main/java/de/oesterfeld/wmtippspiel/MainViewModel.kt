package de.oesterfeld.wmtippspiel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.oesterfeld.wmtippspiel.data.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant

enum class AppTab { Start, Tippen, Rangliste, Info }

data class MainUiState(
    val isLoading: Boolean = false,
    val storedParticipant: StoredParticipant? = null,
    val matches: List<Match> = emptyList(),
    val drafts: Map<String, TipDraft> = emptyMap(),
    val tipSaveStatuses: Map<String, TipSaveStatus> = emptyMap(),
    val tipSaveErrors: Map<String, String> = emptyMap(),
    val bonusTip: BonusTip = BonusTip(),
    val bonusResults: BonusResult? = null,
    val ranking: List<RankingRow> = emptyList(),
    val trends: Map<String, TipTrend> = emptyMap(),
    val results: Map<String, MatchResult> = emptyMap(),
    val groupTables: List<GroupTable> = emptyList(),
    val selectedTab: AppTab = AppTab.Start,
    val searchTerm: String = "",
    val groupFilter: String = "alle",
    val availableUpdate: AppUpdate? = null,
    val updateProgress: Int? = null,
    val isDownloadingUpdate: Boolean = false,
    val message: String? = null,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val api = TippspielApi()
    private val participantStore = ParticipantStore(application)
    private val updateInstaller = UpdateInstaller(application)
    private val autosaveJobs = mutableMapOf<String, Job>()
    private val _uiState = MutableStateFlow(MainUiState(storedParticipant = participantStore.load()))
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        checkForUpdate()
        _uiState.value.storedParticipant?.let(::loadDashboard)
    }

    fun activate(code: String, name: String) = launchBusy {
        val participant = api.claimCode(code.trim(), name.trim())
        participantStore.save(participant, code.trim())
        val stored = StoredParticipant(participant.id, participant.displayName, code.trim())
        _uiState.update { it.copy(storedParticipant = stored) }
        loadDashboard(stored)
    }

    fun continueWithCode(code: String) = launchBusy {
        val participant = api.loadParticipant(code.trim())
        if (participant == null) {
            _uiState.update { it.copy(isLoading = false, message = "Code gefunden. Bitte gib noch deinen Namen ein, um ihn erstmals zu aktivieren.") }
        } else {
            participantStore.save(participant, code.trim())
            val stored = StoredParticipant(participant.id, participant.displayName, code.trim())
            _uiState.update { it.copy(storedParticipant = stored) }
            loadDashboard(stored)
        }
    }

    fun selectTab(tab: AppTab) = _uiState.update { it.copy(selectedTab = tab) }
    fun setSearchTerm(value: String) = _uiState.update { it.copy(searchTerm = value) }
    fun setGroupFilter(value: String) = _uiState.update { it.copy(groupFilter = value) }
    fun refresh() { _uiState.value.storedParticipant?.let(::loadDashboard) }
    fun checkForUpdate() {
        viewModelScope.launch {
            runCatching { api.loadAppUpdate() }
                .onSuccess { update ->
                    _uiState.update {
                        it.copy(
                            availableUpdate = update.takeIf { candidate -> candidate.versionCode > BuildConfig.VERSION_CODE },
                        )
                    }
                }
        }
    }

    fun downloadUpdate() {
        val update = _uiState.value.availableUpdate ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isDownloadingUpdate = true, updateProgress = 0, message = null) }
            runCatching {
                updateInstaller.downloadAndOpenInstaller(update) { progress ->
                    _uiState.update { state -> state.copy(updateProgress = progress) }
                }
            }.onFailure { error ->
                _uiState.update { it.copy(message = error.message ?: "Update konnte nicht gestartet werden.") }
            }
            _uiState.update { it.copy(isDownloadingUpdate = false) }
        }
    }

    fun updateDraft(matchId: String, scoreA: String? = null, scoreB: String? = null) {
        val current = _uiState.value.drafts[matchId] ?: TipDraft(matchId)
        val next = current.copy(scoreA = scoreA ?: current.scoreA, scoreB = scoreB ?: current.scoreB, saved = false)
        _uiState.update {
            it.copy(
                drafts = it.drafts + (matchId to next),
                tipSaveStatuses = it.tipSaveStatuses + (matchId to TipSaveStatus.Pending),
                tipSaveErrors = it.tipSaveErrors - matchId,
                message = null,
            )
        }
        scheduleAutosave(matchId)
    }

    fun adjustScore(matchId: String, homeTeam: Boolean, delta: Int) {
        val current = _uiState.value.drafts[matchId] ?: TipDraft(matchId)
        val raw = if (homeTeam) current.scoreA else current.scoreB
        val currentValue = raw.toIntOrNull() ?: if (delta > 0) 0 else 1
        val nextValue = (currentValue + delta).coerceIn(0, 12).toString()
        if (homeTeam) updateDraft(matchId, scoreA = nextValue) else updateDraft(matchId, scoreB = nextValue)
    }

    private fun saveTip(matchId: String) {
        val participant = _uiState.value.storedParticipant ?: return
        val draft = _uiState.value.drafts[matchId] ?: TipDraft(matchId)
        if (!draft.isValid) return
        viewModelScope.launch {
            _uiState.update { it.copy(tipSaveStatuses = it.tipSaveStatuses + (matchId to TipSaveStatus.Saving)) }
            runCatching {
                api.saveTip(participant.id, Tip(matchId, draft.scoreA.toInt(), draft.scoreB.toInt()))
            }.onSuccess { saved ->
                val updated = saved.associate { tip -> tip.matchId to TipDraft(tip.matchId, tip.scoreA.toString(), tip.scoreB.toString(), saved = true) }
                _uiState.update { state ->
                    val current = state.drafts[matchId]
                    if (current?.scoreA == draft.scoreA && current.scoreB == draft.scoreB) {
                        state.copy(
                            drafts = state.drafts + updated,
                            tipSaveStatuses = state.tipSaveStatuses + (matchId to TipSaveStatus.Saved),
                            tipSaveErrors = state.tipSaveErrors - matchId,
                        )
                    } else {
                        state
                    }
                }
                val current = _uiState.value.drafts[matchId]
                if (current?.scoreA != draft.scoreA || current.scoreB != draft.scoreB) {
                    scheduleAutosave(matchId)
                }
                refreshSupportingData()
            }.onFailure { error ->
                _uiState.update { state ->
                    val current = state.drafts[matchId]
                    if (current?.scoreA == draft.scoreA && current.scoreB == draft.scoreB) {
                        state.copy(
                            tipSaveStatuses = state.tipSaveStatuses + (matchId to TipSaveStatus.Error),
                            tipSaveErrors = state.tipSaveErrors + (matchId to (error.message ?: "Speichern fehlgeschlagen.")),
                        )
                    } else {
                        state
                    }
                }
            }
        }
    }

    fun updateChampion(value: String) = _uiState.update { it.copy(bonusTip = it.bonusTip.copy(champion = value, saved = false)) }
    fun updateTopScorer(value: String) = _uiState.update { it.copy(bonusTip = it.bonusTip.copy(topScorer = value, saved = false)) }
    fun updateGroupWinner(group: String, value: String) = _uiState.update {
        it.copy(bonusTip = it.bonusTip.copy(groupWinners = it.bonusTip.groupWinners + (group to value), saved = false))
    }
    fun saveBonusTip() {
        val participant = _uiState.value.storedParticipant ?: return
        launchBusy {
            val saved = api.saveBonusTip(participant.id, _uiState.value.bonusTip)
            _uiState.update { it.copy(bonusTip = saved, message = "Bonus-Tipps gespeichert.") }
            refreshSupportingData()
        }
    }

    fun logout() { participantStore.clear(); _uiState.value = MainUiState() }

    fun isMatchLocked(match: Match): Boolean = match.kickoffAt?.let { runCatching { Instant.parse(it).isBefore(Instant.now()) }.getOrDefault(false) } ?: false

    private fun loadDashboard(participant: StoredParticipant) = launchBusy {
        val matches = api.loadMatches()
        val tips = api.loadTips(participant.id)
        val groups = matches.mapNotNull { it.groupKey }.distinct().sorted()
        val drafts = matches.associate { match ->
            val tip = tips.find { it.matchId == match.id }
            match.id to TipDraft(match.id, tip?.scoreA?.toString().orEmpty(), tip?.scoreB?.toString().orEmpty(), saved = tip != null)
        }
        val loadedBonus = api.loadBonusTip(participant.id)
        val defaultGroupWinners = groups.associateWith { "" }
        val saveStatuses = drafts.mapValues { (_, draft) -> if (draft.saved) TipSaveStatus.Saved else TipSaveStatus.Idle }
        _uiState.update {
            it.copy(
                storedParticipant = participant,
                matches = matches,
                drafts = drafts,
                tipSaveStatuses = saveStatuses,
                tipSaveErrors = emptyMap(),
                bonusTip = loadedBonus?.copy(groupWinners = defaultGroupWinners + loadedBonus.groupWinners)
                    ?: BonusTip(groupWinners = defaultGroupWinners),
            )
        }
        refreshSupportingData()
    }

    private fun scheduleAutosave(matchId: String) {
        autosaveJobs.remove(matchId)?.cancel()
        val match = _uiState.value.matches.find { it.id == matchId } ?: return
        if (isMatchLocked(match)) return
        autosaveJobs[matchId] = viewModelScope.launch {
            delay(650)
            if (_uiState.value.drafts[matchId]?.isValid == true) {
                saveTip(matchId)
            }
        }
    }

    private suspend fun refreshSupportingData() {
        val ranking = api.loadRanking()
        val trends = api.loadTrends()
        val bonusResults = api.loadBonusResults()
        val results = runCatching { api.loadResults() }
            .getOrDefault(emptyList())
            .associateBy(MatchResult::matchId)
        val groupTables = buildGroupTables(_uiState.value.matches, results)
        _uiState.update { it.copy(ranking = ranking, trends = trends, bonusResults = bonusResults, results = results, groupTables = groupTables) }
    }

    private fun launchBusy(block: suspend () -> Unit) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            runCatching { block() }
                .onFailure { error -> _uiState.update { it.copy(message = error.message ?: "Aktion fehlgeschlagen.") } }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    private fun buildGroupTables(matches: List<Match>, results: Map<String, MatchResult>): List<GroupTable> =
        matches
            .filter { it.groupKey != null }
            .groupBy { it.groupKey!! }
            .toSortedMap()
            .map { (groupKey, groupMatches) ->
                val seedRows = groupMatches
                    .flatMap { listOf(it.teamA to it.teamMarkA, it.teamB to it.teamMarkB) }
                    .distinctBy { it.first }
                    .associate { (team, mark) -> team to GroupStanding(team, mark) }
                    .toMutableMap()

                groupMatches.forEach { match ->
                    val result = results[match.id] ?: return@forEach
                    if (result.status != "final") return@forEach
                    val home = seedRows.getValue(match.teamA)
                    val away = seedRows.getValue(match.teamB)
                    val homeWon = result.scoreA > result.scoreB
                    val awayWon = result.scoreA < result.scoreB
                    val drawn = result.scoreA == result.scoreB

                    seedRows[match.teamA] = home.copy(
                        played = home.played + 1,
                        won = home.won + if (homeWon) 1 else 0,
                        drawn = home.drawn + if (drawn) 1 else 0,
                        lost = home.lost + if (awayWon) 1 else 0,
                        goalsFor = home.goalsFor + result.scoreA,
                        goalsAgainst = home.goalsAgainst + result.scoreB,
                        points = home.points + when {
                            homeWon -> 3
                            drawn -> 1
                            else -> 0
                        },
                    )
                    seedRows[match.teamB] = away.copy(
                        played = away.played + 1,
                        won = away.won + if (awayWon) 1 else 0,
                        drawn = away.drawn + if (drawn) 1 else 0,
                        lost = away.lost + if (homeWon) 1 else 0,
                        goalsFor = away.goalsFor + result.scoreB,
                        goalsAgainst = away.goalsAgainst + result.scoreA,
                        points = away.points + when {
                            awayWon -> 3
                            drawn -> 1
                            else -> 0
                        },
                    )
                }

                GroupTable(
                    groupKey = groupKey,
                    rows = seedRows.values.sortedWith(
                        compareByDescending<GroupStanding> { it.points }
                            .thenByDescending { it.goalDifference }
                            .thenByDescending { it.goalsFor }
                            .thenBy { displayTeamName(it.team) },
                    ),
                )
            }
}
