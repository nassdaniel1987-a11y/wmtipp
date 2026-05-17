package de.oesterfeld.wmtippspiel

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import de.oesterfeld.wmtippspiel.data.*
import de.oesterfeld.wmtippspiel.data.displayTeamName
import de.oesterfeld.wmtippspiel.ui.theme.WmTippspielTheme
import de.oesterfeld.wmtippspiel.ui.theme.*

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        setContent {
            WmTippspielTheme {
                val state by viewModel.uiState.collectAsState()
                TippspielApp(state, viewModel)
            }
        }
        viewModel.handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.handleIntent(intent)
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun TippspielApp(state: MainUiState, vm: MainViewModel) {
    if (state.storedParticipant == null) {
        ActivationScreen(state.isLoading, state.message, vm::activate, vm::continueWithCode)
        return
    }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { BottomTabs(state.selectedTab, vm::selectTab) },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            TopHeader(state, vm::refresh, vm::logout)
            state.availableUpdate?.let { UpdateBanner(it, state.isDownloadingUpdate, state.updateProgress, vm::downloadUpdate) }
            state.message?.let { MessageBanner(it) }
            when (state.selectedTab) {
                AppTab.Start -> StartScreen(state, vm)
                AppTab.Tippen -> TipsScreen(state, vm)
                AppTab.Rangliste -> RankingScreen(state)
                AppTab.Info -> InfoScreen(state, vm)
            }
        }
    }
    if (state.showNotificationPrompt) {
        NotificationPromptDialog(state.pushConfigured, vm::enableNotifications, vm::dismissNotificationPrompt)
    }
}

@Composable
private fun ActivationScreen(isLoading: Boolean, message: String?, onActivate: (String, String) -> Unit, onContinueWithCode: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    val context = LocalContext.current
    val scanner = remember {
        GmsBarcodeScanning.getClient(context, GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).enableAutoZoom().build())
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LogoBubble(110)
        Spacer(Modifier.height(18.dp))
        Text("WM-Tippspiel", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Text("Österfeld-Edition", color = MaterialTheme.colorScheme.secondary)
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(code, { code = it.uppercase() }, Modifier.fillMaxWidth(), label = { Text("Einladungscode") }, singleLine = true)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Name") }, singleLine = true)
        Spacer(Modifier.height(16.dp))
        Button({ onActivate(code, name) }, Modifier.fillMaxWidth(), enabled = !isLoading && code.isNotBlank() && name.trim().length >= 2) {
            Text(if (isLoading) "Wird aktiviert…" else "Code aktivieren")
        }
        Spacer(Modifier.height(10.dp))
        OutlinedButton({
            scanner.startScan().addOnSuccessListener { barcode ->
                extractInviteCode(barcode.rawValue)?.let { scanned -> code = scanned; onContinueWithCode(scanned) }
            }
        }, Modifier.fillMaxWidth(), enabled = !isLoading) { Text("QR-Code scannen") }
        message?.let { Spacer(Modifier.height(14.dp)); Text(it, color = MaterialTheme.colorScheme.secondary) }
    }
}

@Composable
private fun TopHeader(state: MainUiState, onRefresh: () -> Unit, onLogout: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LogoBubble(48)
            Spacer(Modifier.width(12.dp))
            Column {
                Text("Hallo ${state.storedParticipant?.displayName}", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                Text("WM 2026", color = MaterialTheme.colorScheme.secondary)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, contentDescription = "Neu laden") }
            IconButton(onClick = onLogout) { Icon(Icons.Default.Logout, contentDescription = "Abmelden") }
        }
    }
}

@Composable private fun MessageBanner(message: String) { Text(message, Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.secondary) }

@Composable
private fun UpdateBanner(update: AppUpdate, isDownloading: Boolean, progress: Int?, onUpdate: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 4.dp),
        colors = CardDefaults.cardColors(containerColor = Yellow.copy(alpha = .2f)),
        border = BorderStroke(1.dp, Yellow),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(Icons.Default.SystemUpdate, null, tint = Navy)
                Column(Modifier.weight(1f)) {
                    Text("Update verfügbar: Version ${update.versionName}", fontWeight = FontWeight.Bold, color = Navy)
                    if (update.notes.isNotBlank()) Text(update.notes, color = Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (isDownloading) {
                LinearProgressIndicator(
                    progress = { (progress ?: 0) / 100f },
                    modifier = Modifier.fillMaxWidth(),
                    color = Navy,
                    trackColor = Color.White.copy(alpha = .5f),
                )
                Text(
                    progress?.let { "$it % heruntergeladen" } ?: "Download läuft …",
                    color = Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            } else {
                Button(onClick = onUpdate, colors = ButtonDefaults.buttonColors(containerColor = Navy)) {
                    Icon(Icons.Default.Download, null)
                    Spacer(Modifier.width(8.dp))
                    Text("Update herunterladen")
                }
            }
        }
    }
}

@Composable
private fun StartScreen(state: MainUiState, vm: MainViewModel) {
    val saved = state.drafts.values.count { it.saved }
    val open = state.matches.size - saved
    val current = state.ranking.find { it.name == state.storedParticipant?.displayName }
    val next = state.matches.filter { !state.drafts[it.id].let { d -> d?.saved == true } }.take(4)
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            ElevatedCard(shape = RoundedCornerShape(24.dp)) {
                Column(
                    Modifier
                        .background(
                            Brush.linearGradient(
                                listOf(Navy, Blue, Green),
                            ),
                        )
                        .padding(18.dp),
                ) {
                    Text("Dein Überblick", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Spacer(Modifier.height(12.dp))
                    LinearProgressIndicator(
                        progress = { if (state.matches.isEmpty()) 0f else saved.toFloat() / state.matches.size },
                        modifier = Modifier.fillMaxWidth(),
                        color = Yellow,
                        trackColor = Color.White.copy(alpha = .22f),
                    )
                    Spacer(Modifier.height(8.dp))
                    Text("$saved von ${state.matches.size} Spieltipps gespeichert", color = Color.White)
                    Text(if (open == 0) "Alles erledigt." else "$open Tipps sind noch offen.", color = Color.White.copy(alpha = .82f))
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard("Punkte", current?.points?.toString() ?: "0", Modifier.weight(1f))
                StatCard("Schnitt", String.format("%.2f", current?.averagePoints ?: 0.0), Modifier.weight(1f))
                StatCard("Rang", state.ranking.indexOfFirst { it.name == state.storedParticipant?.displayName }.takeIf { it >= 0 }?.plus(1)?.toString() ?: "-", Modifier.weight(1f))
            }
        }
        item { SectionTitle("Nächste offene Tipps") }
        if (next.isEmpty()) item { EmptyCard("Gerade ist kein Tipp mehr offen.") }
        items(next, key = Match::id) { match -> CompactMatchCard(match) }
        item {
            Button({ vm.selectTab(AppTab.Tippen) }, Modifier.fillMaxWidth()) { Text("Offene Tipps bearbeiten") }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                QuickActionCard(Icons.Default.EmojiEvents, "Rangliste", "Deinen Platz ansehen", Modifier.weight(1f)) { vm.selectTab(AppTab.Rangliste) }
                QuickActionCard(Icons.Default.Info, "Regeln", "Punkte nachlesen", Modifier.weight(1f)) { vm.selectTab(AppTab.Info) }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun TipsScreen(state: MainUiState, vm: MainViewModel) {
    var bonusMode by remember { mutableStateOf(false) }
    val groups = state.matches.mapNotNull { it.groupKey }.distinct().sorted()
    val filters = listOf("alle", "deutschland") + groups
    val filtered = state.matches.filter { match ->
        val filterOk = when (state.groupFilter) {
            "alle" -> true
            "deutschland" -> displayTeamName(match.teamA) == "Deutschland" || displayTeamName(match.teamB) == "Deutschland"
            else -> match.groupKey == state.groupFilter
        }
        val q = state.searchTerm.trim().lowercase()
        filterOk && (q.isBlank() || listOf(displayTeamName(match.teamA), displayTeamName(match.teamB), match.city, match.groupKey.orEmpty()).any { it.lowercase().contains(q) })
    }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(selected = !bonusMode, onClick = { bonusMode = false }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Spiele") }
                SegmentedButton(selected = bonusMode, onClick = { bonusMode = true }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Bonus") }
            }
        }
        if (!bonusMode) {
            item { OutlinedTextField(state.searchTerm, vm::setSearchTerm, Modifier.fillMaxWidth(), label = { Text("Team, Gruppe oder Stadt suchen") }, leadingIcon = { Icon(Icons.Default.Search, null) }, singleLine = true) }
            item {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    filters.forEach { filter -> FilterChip(selected = state.groupFilter == filter, onClick = { vm.setGroupFilter(filter) }, label = { Text(if (filter == "alle") "Alle" else if (filter == "deutschland") "Deutschland" else "Gr. $filter") }) }
                }
            }
            items(filtered, key = Match::id) { match ->
                MatchEditorCard(
                    match = match,
                    draft = state.drafts[match.id] ?: TipDraft(match.id),
                    saveStatus = state.tipSaveStatuses[match.id] ?: TipSaveStatus.Idle,
                    saveError = state.tipSaveErrors[match.id],
                    trend = state.trends[match.id],
                    vm = vm,
                )
            }
        } else {
            item { BonusEditor(state, vm) }
            item { GroupTablesOverview(state.groupTables) }
        }
    }
}

@Composable
private fun MatchEditorCard(match: Match, draft: TipDraft, saveStatus: TipSaveStatus, saveError: String?, trend: TipTrend?, vm: MainViewModel) {
    val locked = vm.isMatchLocked(match)
    var showTrend by remember(match.id) { mutableStateOf(false) }
    ElevatedCard(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
    ) {
        Column {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.horizontalGradient(listOf(Navy, Blue, Green)))
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Spiel ${match.matchNumber}", color = Color.White, fontWeight = FontWeight.Bold)
                AssistChip(
                    onClick = {},
                    enabled = false,
                    label = { Text(if (match.groupKey != null) "Gruppe ${match.groupKey}" else match.phase) },
                    colors = AssistChipDefaults.assistChipColors(
                        disabledContainerColor = Color.White.copy(alpha = .16f),
                        disabledLabelColor = Color.White,
                    ),
                    border = null,
                )
            }
            Column(Modifier.padding(16.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Default.CalendarMonth, null, tint = Blue)
                    Text("${match.matchDate} · ${match.matchTime}", color = Blue, fontWeight = FontWeight.SemiBold)
                }
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                    TeamPill(match.teamMarkA, displayTeamName(match.teamA), Modifier.weight(1f))
                    Text(":", color = Muted, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 10.dp))
                    TeamPill(match.teamMarkB, displayTeamName(match.teamB), Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.LocationOn, null, tint = Green)
                    Text("${match.venue}, ${match.city}", style = MaterialTheme.typography.bodySmall, color = Muted)
                }
                if (trend != null && trend.total > 0) {
                    Spacer(Modifier.height(12.dp))
                    TextButton(
                        onClick = { showTrend = !showTrend },
                        contentPadding = PaddingValues(0.dp),
                    ) {
                        Icon(if (showTrend) Icons.Default.VisibilityOff else Icons.Default.Visibility, null)
                        Spacer(Modifier.width(6.dp))
                        Text(if (showTrend) "Community-Trend ausblenden" else "Community-Trend anzeigen")
                    }
                    if (showTrend) {
                        Spacer(Modifier.height(4.dp))
                        TrendRow(trend)
                    }
                }
                Spacer(Modifier.height(14.dp))
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    ScoreStepperRow(
                        mark = match.teamMarkA,
                        teamName = displayTeamName(match.teamA),
                        score = draft.scoreA,
                        locked = locked,
                        onMinus = { vm.adjustScore(match.id, homeTeam = true, delta = -1) },
                        onPlus = { vm.adjustScore(match.id, homeTeam = true, delta = 1) },
                    )
                    ScoreStepperRow(
                        mark = match.teamMarkB,
                        teamName = displayTeamName(match.teamB),
                        score = draft.scoreB,
                        locked = locked,
                        onMinus = { vm.adjustScore(match.id, homeTeam = false, delta = -1) },
                        onPlus = { vm.adjustScore(match.id, homeTeam = false, delta = 1) },
                    )
                }
                Spacer(Modifier.height(10.dp))
                TipSaveStatusRow(saveStatus, saveError, draft)
                if (locked) Text("Gesperrt: Spiel hat bereits begonnen.", color = Orange, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun ScoreStepperRow(mark: String, teamName: String, score: String, locked: Boolean, onMinus: () -> Unit, onPlus: () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), color = SurfaceSoft, border = BorderStroke(1.dp, Line)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            TeamMark(mark, teamName)
            Text(teamName, modifier = Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
            ScoreStepButton(Icons.Default.Remove, enabled = !locked && (score.toIntOrNull() ?: 1) > 0, onClick = onMinus)
            Surface(shape = RoundedCornerShape(12.dp), color = Color.White, border = BorderStroke(1.dp, Line)) {
                Text(
                    score.ifBlank { "–" },
                    modifier = Modifier.width(42.dp).padding(vertical = 8.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                    fontWeight = FontWeight.Bold,
                    color = Navy,
                )
            }
            ScoreStepButton(Icons.Default.Add, enabled = !locked && (score.toIntOrNull() ?: 0) < 12, onClick = onPlus)
        }
    }
}

@Composable
private fun ScoreStepButton(icon: ImageVector, enabled: Boolean, onClick: () -> Unit) {
    FilledTonalIconButton(onClick = onClick, enabled = enabled, colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = Blue.copy(alpha = .09f), contentColor = Blue)) {
        Icon(icon, null)
    }
}

@Composable
private fun TipSaveStatusRow(status: TipSaveStatus, error: String?, draft: TipDraft) {
    val (icon, text, color) = when {
        error != null || status == TipSaveStatus.Error -> Triple(Icons.Default.ErrorOutline, error ?: "Speichern fehlgeschlagen.", Orange)
        status == TipSaveStatus.Saving -> Triple(Icons.Default.Sync, "Wird gespeichert…", Blue)
        status == TipSaveStatus.Pending && draft.isValid -> Triple(Icons.Default.Schedule, "Wird gleich gespeichert…", Muted)
        status == TipSaveStatus.Saved || draft.saved -> Triple(Icons.Default.CheckCircle, "Gespeichert", Green)
        else -> Triple(Icons.Default.Edit, "Noch kein vollständiger Tipp", Muted)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, null, tint = color, modifier = Modifier.size(17.dp))
        Text(text, color = color, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun BonusEditor(state: MainUiState, vm: MainViewModel) {
    val teams = state.matches.flatMap { listOf(it.teamA, it.teamB) }.map(::displayTeamName).distinct().sorted()
    val groups = state.matches.groupBy { it.groupKey }.filterKeys { it != null }.toSortedMap(compareBy { it })
    ElevatedCard(shape = RoundedCornerShape(22.dp), colors = CardDefaults.elevatedCardColors(containerColor = Color.White)) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(
                Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(Navy, Blue))).padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Icon(Icons.Default.MilitaryTech, null, tint = Yellow)
                Column {
                    Text("Bonus-Tipps", color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge)
                    Text("Zusatzpunkte für den langen Atem", color = Color.White.copy(alpha = .8f))
                }
            }
            Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SimpleDropdown("Weltmeister", teams, state.bonusTip.champion, vm::updateChampion)
            OutlinedTextField(state.bonusTip.topScorer, vm::updateTopScorer, Modifier.fillMaxWidth(), label = { Text("Torschützenkönig") }, singleLine = true)
            groups.forEach { (group, matches) ->
                val options = matches.flatMap { listOf(it.teamA, it.teamB) }.map(::displayTeamName).distinct().sorted()
                SimpleDropdown("Gruppensieger Gruppe $group", options, state.bonusTip.groupWinners[group].orEmpty()) { vm.updateGroupWinner(group!!, it) }
            }
                Button(vm::saveBonusTip, Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = if (state.bonusTip.saved) Green else Navy)) {
                    Icon(if (state.bonusTip.saved) Icons.Default.CheckCircle else Icons.Default.Save, null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (state.bonusTip.saved) "Bonus-Tipps gespeichert" else "Bonus-Tipps speichern")
                }
            }
        }
    }
}

@Composable
private fun GroupTablesOverview(groupTables: List<GroupTable>) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        SectionTitle("Kompakte Gruppentabellen")
        groupTables.forEach { table ->
            Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Line)) {
                Column {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .background(SurfaceSoft)
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Gruppe ${table.groupKey}", fontWeight = FontWeight.Bold, color = Navy)
                        Text("Sp  ·  Diff  ·  Pkt", style = MaterialTheme.typography.labelMedium, color = Muted)
                    }
                    table.rows.forEachIndexed { index, row ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Row(
                                modifier = Modifier.weight(1f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(10.dp),
                            ) {
                                Text("${index + 1}.", color = Muted, modifier = Modifier.width(18.dp))
                                TeamMark(row.teamMark, displayTeamName(row.team))
                                Text(displayTeamName(row.team), fontWeight = FontWeight.SemiBold)
                            }
                            Text(
                                "${row.played}  ·  ${if (row.goalDifference > 0) "+" else ""}${row.goalDifference}  ·  ${row.points}",
                                color = Navy,
                                fontWeight = FontWeight.Bold,
                            )
                        }
                        if (index < table.rows.lastIndex) HorizontalDivider(color = Line)
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SimpleDropdown(label: String, options: List<String>, value: String, onChange: (String) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
        OutlinedTextField(value, {}, Modifier.menuAnchor().fillMaxWidth(), readOnly = true, label = { Text(label) }, trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) })
        ExposedDropdownMenu(expanded, onDismissRequest = { expanded = false }) { options.forEach { option -> DropdownMenuItem(text = { Text(option) }, onClick = { onChange(option); expanded = false }) } }
    }
}

@Composable
private fun RankingScreen(state: MainUiState) {
    var averageMode by remember { mutableStateOf(false) }
    val rows = remember(state.ranking, averageMode) {
        if (averageMode) {
            state.ranking.sortedWith(
                compareByDescending<RankingRow> { it.averagePoints }
                    .thenByDescending { it.scoredTipCount }
                    .thenByDescending { it.points }
                    .thenBy { it.name },
            )
        } else {
            state.ranking.sortedWith(compareByDescending<RankingRow> { it.points }.thenBy { it.name })
        }
    }
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            HeroSection(
                icon = Icons.Default.EmojiEvents,
                title = "Rangliste",
                subtitle = "Spielpunkte und Bonuspunkte zusammen",
            )
        }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(selected = !averageMode, onClick = { averageMode = false }, shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("Gesamtpunkte") }
                SegmentedButton(selected = averageMode, onClick = { averageMode = true }, shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("Durchschnitt") }
            }
        }
        itemsIndexed(rows) { index, row ->
            val mine = row.name == state.storedParticipant?.displayName
            Card(colors = CardDefaults.cardColors(containerColor = if (mine) Yellow.copy(alpha = .18f) else Color.White), border = BorderStroke(1.dp, if (mine) Yellow else Line)) {
                Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        RankBadge(index + 1)
                        Column {
                            Text(row.name, fontWeight = if (mine) FontWeight.Bold else FontWeight.SemiBold)
                            Text("${row.tipCount} Tipps · ${row.scoredTipCount} gewertet", color = Muted, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(if (averageMode) String.format("%.2f", row.averagePoints) else "${row.points} Pkt.", fontWeight = FontWeight.Bold, color = Navy)
                        Text(if (averageMode) "${row.matchPoints} Spielpunkte" else "${row.matchPoints} + ${row.bonusPoints}", style = MaterialTheme.typography.bodySmall, color = Muted)
                    }
                }
            }
        }
        if (averageMode) {
            item {
                Text(
                    "Durchschnitt = Spielpunkte pro gewertetem Tipp. Bonuspunkte fließen hier nicht ein.",
                    color = Muted,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }
    }
}

@Composable
private fun InfoScreen(state: MainUiState, vm: MainViewModel) {
    LazyColumn(contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { HeroSection(Icons.Default.Info, "Regeln & Punkte", "So wird im WM-Tippspiel gezählt") }
        item { InfoCard(Icons.Default.SportsSoccer, "Spieltipps", listOf("4 Punkte: exaktes Ergebnis", "3 Punkte: Tendenz + Tordifferenz", "2 Punkte: richtige Tendenz", "0 Punkte: falsche Tendenz")) }
        item { InfoCard(Icons.Default.MilitaryTech, "Bonus-Tipps", listOf("8 Punkte: Weltmeister", "6 Punkte: Torschützenkönig", "2 Punkte: pro richtigem Gruppensieger")) }
        item { InfoCard(Icons.Default.Shield, "Wichtig", listOf("Spieltipps sind ab Spielstart gesperrt.", "Weltmeister und Torschützenkönig schließen zum Turnierstart.", "Gruppensieger schließen mit dem ersten Spiel der Gruppe.", "Jeder QR-Code gehört genau einem Teilnehmer.")) }
        item { InfoCard(Icons.Default.Android, "App", listOf("Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", "Update-Test aktiv")) }
        item { NotificationSettingsCard(state, vm) }
    }
}

@Composable
private fun NotificationPromptDialog(pushConfigured: Boolean, onEnable: () -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted || Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) onEnable() else onDismiss()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.NotificationsActive, null) },
        title = { Text("Tipp-Erinnerungen aktivieren?") },
        text = {
            Text(
                if (pushConfigured) "Wir erinnern dich 24 Stunden und 3 Stunden vor Anpfiff, wenn noch ein Tipp fehlt."
                else "Push ist vorbereitet, aber noch nicht mit Firebase verbunden. Sobald die Einrichtung abgeschlossen ist, kannst du Erinnerungen aktivieren.",
            )
        },
        confirmButton = {
            Button(
                enabled = pushConfigured,
                onClick = {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    ) {
                        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        onEnable()
                    }
                },
            ) { Text("Aktivieren") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Später") } },
    )
}

@Composable
private fun NotificationSettingsCard(state: MainUiState, vm: MainViewModel) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Line)) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(Icons.Default.NotificationsActive, null, tint = Green)
            Column(Modifier.weight(1f)) {
                Text("Tipp-Erinnerungen", fontWeight = FontWeight.Bold)
                Text(
                    if (state.pushConfigured) "24 Stunden und 3 Stunden vor offenen Spielen"
                    else "Noch nicht mit Firebase verbunden",
                    color = Muted,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Switch(
                checked = state.notificationsEnabled,
                enabled = state.pushConfigured,
                onCheckedChange = vm::setNotificationsEnabled,
            )
        }
    }
}

@Composable private fun BottomTabs(selected: AppTab, onSelect: (AppTab) -> Unit) { NavigationBar(containerColor = Color.White) { listOf(AppTab.Start to Icons.Default.Home, AppTab.Tippen to Icons.Default.SportsSoccer, AppTab.Rangliste to Icons.Default.EmojiEvents, AppTab.Info to Icons.Default.Info).forEach { (tab, icon) -> NavigationBarItem(selected = selected == tab, onClick = { onSelect(tab) }, icon = { Icon(icon, null) }, label = { Text(tab.name) }, colors = NavigationBarItemDefaults.colors(selectedIconColor = Navy, selectedTextColor = Navy, indicatorColor = Yellow.copy(alpha = .35f), unselectedIconColor = Muted, unselectedTextColor = Muted)) } } }
@Composable private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
@Composable private fun StatCard(label: String, value: String, modifier: Modifier) { Card(modifier, colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Line)) { Column(Modifier.padding(12.dp)) { Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge, color = Navy); Text(label, style = MaterialTheme.typography.bodySmall, color = Muted) } } }
@Composable private fun EmptyCard(text: String) { OutlinedCard(border = BorderStroke(1.dp, Line)) { Text(text, Modifier.padding(16.dp), color = Muted) } }
@Composable private fun CompactMatchCard(match: Match) { Card(colors = CardDefaults.cardColors(containerColor = SurfaceSoft), border = BorderStroke(1.dp, Line)) { Column(Modifier.fillMaxWidth().padding(14.dp)) { Text("Spiel ${match.matchNumber}", color = Blue, fontWeight = FontWeight.Bold); Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { TeamMark(match.teamMarkA, displayTeamName(match.teamA)); Text("–", color = Muted); TeamMark(match.teamMarkB, displayTeamName(match.teamB)) }; Text("${match.matchDate} · ${match.matchTime}", color = Muted) } } }
@Composable private fun InfoCard(icon: ImageVector, title: String, lines: List<String>) { Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Line)) { Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) { Icon(icon, null, tint = Green); Text(title, fontWeight = FontWeight.Bold) }; lines.forEach { Text("• $it", color = Navy) } } } }
@Composable private fun LogoBubble(size: Int) { Box(Modifier.size(size.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) { Image(painterResource(R.drawable.oesterfeld_logo_round), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) } }
@Composable private fun TeamPill(mark: String, name: String, modifier: Modifier = Modifier) { Surface(modifier, shape = RoundedCornerShape(16.dp), color = SurfaceSoft, border = BorderStroke(1.dp, Line)) { Row(Modifier.padding(horizontal = 10.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) { TeamMark(mark, name); Text(name, fontWeight = FontWeight.SemiBold) } } }
@Composable
private fun TeamMark(mark: String, label: String) {
    Surface(shape = CircleShape, color = Color.White, border = BorderStroke(1.dp, Line)) {
        Box(Modifier.size(28.dp), contentAlignment = Alignment.Center) {
            if (mark.isNotBlank()) {
                AsyncImage(
                    model = "https://flagcdn.com/w40/$mark.png",
                    contentDescription = label,
                    modifier = Modifier.size(22.dp),
                    contentScale = ContentScale.Fit,
                )
            } else {
                Text(label.take(1))
            }
        }
    }
}
@Composable private fun TrendRow(trend: TipTrend) { Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { TrendChip("${trend.homeWinPercent}% Heimsieg"); TrendChip("${trend.drawPercent}% Remis"); TrendChip("${trend.awayWinPercent}% Auswärts") } }
@Composable private fun TrendChip(text: String) { Surface(shape = RoundedCornerShape(999.dp), color = Blue.copy(alpha = .08f)) { Text(text, Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = Blue, style = MaterialTheme.typography.labelMedium) } }
@Composable private fun HeroSection(icon: ImageVector, title: String, subtitle: String) { Card(shape = RoundedCornerShape(22.dp)) { Row(Modifier.fillMaxWidth().background(Brush.horizontalGradient(listOf(Navy, Blue, Green))).padding(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { Icon(icon, null, tint = Yellow); Column { Text(title, color = Color.White, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleLarge); Text(subtitle, color = Color.White.copy(alpha = .82f)) } } } }
@Composable private fun RankBadge(rank: Int) { Surface(shape = CircleShape, color = when (rank) { 1 -> Yellow.copy(alpha = .4f); 2 -> Color(0xFFE6EBF2); 3 -> Color(0xFFF4D2B8); else -> Blue.copy(alpha = .08f) }) { Text(rank.toString(), Modifier.size(34.dp).wrapContentSize(), fontWeight = FontWeight.Bold, color = Navy) } }
@Composable private fun QuickActionCard(icon: ImageVector, title: String, subtitle: String, modifier: Modifier = Modifier, onClick: () -> Unit) { Card(onClick = onClick, modifier = modifier, colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, Line)) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Icon(icon, null, tint = Green); Text(title, fontWeight = FontWeight.Bold); Text(subtitle, color = Muted, style = MaterialTheme.typography.bodySmall) } } }
private fun extractInviteCode(rawValue: String?): String? { val raw = rawValue?.trim().orEmpty(); if (raw.isBlank()) return null; return runCatching { Uri.parse(raw).getQueryParameter("code")?.trim() }.getOrNull().takeUnless { it.isNullOrBlank() } ?: raw }
