package de.oesterfeld.wmtippspiel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import de.oesterfeld.wmtippspiel.data.Match
import de.oesterfeld.wmtippspiel.data.ParticipantStore
import de.oesterfeld.wmtippspiel.data.StoredParticipant
import de.oesterfeld.wmtippspiel.data.Tip
import de.oesterfeld.wmtippspiel.data.TippspielApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MainUiState(
    val isLoading: Boolean = false,
    val storedParticipant: StoredParticipant? = null,
    val matches: List<Match> = emptyList(),
    val tips: Map<String, Tip> = emptyMap(),
    val message: String? = null,
)

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val api = TippspielApi()
    private val participantStore = ParticipantStore(application)
    private val _uiState = MutableStateFlow(
        MainUiState(storedParticipant = participantStore.load()),
    )
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        _uiState.value.storedParticipant?.let { loadDashboard(it) }
    }

    fun activate(code: String, name: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            runCatching {
                api.claimCode(code.trim(), name.trim())
            }.onSuccess { participant ->
                participantStore.save(participant, code.trim())
                val stored = StoredParticipant(participant.id, participant.displayName, code.trim())
                _uiState.update { it.copy(storedParticipant = stored) }
                loadDashboard(stored)
            }.onFailure { error ->
                _uiState.update { it.copy(isLoading = false, message = error.message ?: "Aktivierung fehlgeschlagen.") }
            }
        }
    }

    fun continueWithCode(code: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            runCatching {
                api.loadParticipant(code.trim())
            }.onSuccess { participant ->
                if (participant == null) {
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            message = "Code gefunden. Bitte gib noch deinen Namen ein, um ihn erstmals zu aktivieren.",
                        )
                    }
                } else {
                    participantStore.save(participant, code.trim())
                    val stored = StoredParticipant(participant.id, participant.displayName, code.trim())
                    _uiState.update { it.copy(storedParticipant = stored) }
                    loadDashboard(stored)
                }
            }.onFailure { error ->
                _uiState.update { it.copy(isLoading = false, message = error.message ?: "Code konnte nicht geprüft werden.") }
            }
        }
    }

    fun refresh() {
        _uiState.value.storedParticipant?.let(::loadDashboard)
    }

    fun updateTip(matchId: String, scoreA: Int? = null, scoreB: Int? = null) {
        val current = _uiState.value.tips[matchId] ?: Tip(matchId, 0, 0)
        val updated = current.copy(
            scoreA = scoreA ?: current.scoreA,
            scoreB = scoreB ?: current.scoreB,
        )
        _uiState.update { it.copy(tips = it.tips + (matchId to updated), message = null) }
    }

    fun saveTip(matchId: String) {
        val participant = _uiState.value.storedParticipant ?: return
        val tip = _uiState.value.tips[matchId] ?: Tip(matchId, 0, 0)
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            runCatching { api.saveTip(participant.id, tip) }
                .onSuccess { savedTips ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            tips = it.tips + savedTips.associateBy(Tip::matchId),
                            message = "Tipp gespeichert.",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isLoading = false, message = error.message ?: "Speichern fehlgeschlagen.") }
                }
        }
    }

    fun logout() {
        participantStore.clear()
        _uiState.value = MainUiState()
    }

    private fun loadDashboard(participant: StoredParticipant) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, message = null) }
            runCatching {
                val matches = api.loadMatches()
                val tips = api.loadTips(participant.id).associateBy(Tip::matchId)
                matches to tips
            }.onSuccess { (matches, tips) ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        storedParticipant = participant,
                        matches = matches,
                        tips = tips,
                    )
                }
            }.onFailure { error ->
                _uiState.update { it.copy(isLoading = false, message = error.message ?: "Daten konnten nicht geladen werden.") }
            }
        }
    }
}
