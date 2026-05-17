package de.oesterfeld.wmtippspiel

import android.os.Bundle
import android.net.Uri
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import de.oesterfeld.wmtippspiel.data.Match
import de.oesterfeld.wmtippspiel.data.Tip
import de.oesterfeld.wmtippspiel.ui.theme.WmTippspielTheme

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            WmTippspielTheme {
                val state by viewModel.uiState.collectAsState()
                TippspielApp(
                    state = state,
                    onActivate = viewModel::activate,
                    onContinueWithCode = viewModel::continueWithCode,
                    onRefresh = viewModel::refresh,
                    onTipChange = viewModel::updateTip,
                    onSaveTip = viewModel::saveTip,
                    onLogout = viewModel::logout,
                )
            }
        }
    }
}

@Composable
private fun TippspielApp(
    state: MainUiState,
    onActivate: (String, String) -> Unit,
    onContinueWithCode: (String) -> Unit,
    onRefresh: () -> Unit,
    onTipChange: (String, Int?, Int?) -> Unit,
    onSaveTip: (String) -> Unit,
    onLogout: () -> Unit,
) {
    Scaffold(containerColor = MaterialTheme.colorScheme.background) { innerPadding ->
        if (state.storedParticipant == null) {
            ActivationScreen(
                modifier = Modifier.padding(innerPadding),
                isLoading = state.isLoading,
                message = state.message,
                onActivate = onActivate,
                onContinueWithCode = onContinueWithCode,
            )
        } else {
            DashboardScreen(
                modifier = Modifier.padding(innerPadding),
                state = state,
                onRefresh = onRefresh,
                onTipChange = onTipChange,
                onSaveTip = onSaveTip,
                onLogout = onLogout,
            )
        }
    }
}

@Composable
private fun ActivationScreen(
    modifier: Modifier = Modifier,
    isLoading: Boolean,
    message: String?,
    onActivate: (String, String) -> Unit,
    onContinueWithCode: (String) -> Unit,
) {
    var code by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    val context = LocalContext.current
    val scanner = remember {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()
        GmsBarcodeScanning.getClient(context, options)
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("WM-Tippspiel", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text("Aktiviere deinen Teilnehmercode, um in App und Browser dieselben Tipps zu nutzen.")
        Spacer(Modifier.height(20.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { code = it.uppercase() },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Einladungscode") },
            singleLine = true,
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Name") },
            singleLine = true,
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { onActivate(code, name) },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading && code.isNotBlank() && name.trim().length >= 2,
        ) {
            Text(if (isLoading) "Wird aktiviert…" else "Code aktivieren")
        }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = {
                scanner.startScan()
                    .addOnSuccessListener { barcode ->
                        extractInviteCode(barcode.rawValue)?.let { scannedCode ->
                            code = scannedCode
                            onContinueWithCode(scannedCode)
                        }
                    }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading,
        ) {
            Text("QR-Code scannen")
        }
        message?.let {
            Spacer(Modifier.height(14.dp))
            Text(it, color = MaterialTheme.colorScheme.secondary)
        }
    }
}

private fun extractInviteCode(rawValue: String?): String? {
    val raw = rawValue?.trim().orEmpty()
    if (raw.isBlank()) return null
    return runCatching {
        Uri.parse(raw).getQueryParameter("code")?.trim()
    }.getOrNull().takeUnless { it.isNullOrBlank() } ?: raw
}

@Composable
private fun DashboardScreen(
    modifier: Modifier = Modifier,
    state: MainUiState,
    onRefresh: () -> Unit,
    onTipChange: (String, Int?, Int?) -> Unit,
    onSaveTip: (String) -> Unit,
    onLogout: () -> Unit,
) {
    Column(
        modifier = modifier.fillMaxSize(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column {
                Text("Hallo ${state.storedParticipant?.displayName}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("Deine Tipps", color = MaterialTheme.colorScheme.secondary)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = onRefresh) { Text("Neu laden") }
                OutlinedButton(onClick = onLogout) { Text("Abmelden") }
            }
        }

        if (state.isLoading && state.matches.isEmpty()) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 20.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                state.message?.let { message ->
                    item {
                        Text(message, color = MaterialTheme.colorScheme.secondary)
                    }
                }
                items(state.matches, key = Match::id) { match ->
                    MatchCard(
                        match = match,
                        tip = state.tips[match.id] ?: Tip(match.id, 0, 0),
                        onTipChange = onTipChange,
                        onSaveTip = onSaveTip,
                    )
                }
            }
        }
    }
}

@Composable
private fun MatchCard(
    match: Match,
    tip: Tip,
    onTipChange: (String, Int?, Int?) -> Unit,
    onSaveTip: (String) -> Unit,
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Spiel ${match.matchNumber} · ${match.matchDate} · ${match.matchTime}", color = MaterialTheme.colorScheme.secondary)
            Spacer(Modifier.height(8.dp))
            Text("${match.teamA}  –  ${match.teamB}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("${match.venue}, ${match.city}", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(14.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ScoreField(
                    value = tip.scoreA,
                    label = match.teamA,
                    onValueChange = { onTipChange(match.id, it, null) },
                    modifier = Modifier.weight(1f),
                )
                ScoreField(
                    value = tip.scoreB,
                    label = match.teamB,
                    onValueChange = { onTipChange(match.id, null, it) },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(12.dp))
            Button(onClick = { onSaveTip(match.id) }) {
                Text("Tipp speichern")
            }
        }
    }
}

@Composable
private fun ScoreField(
    value: Int,
    label: String,
    onValueChange: (Int) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value.toString(),
        onValueChange = { raw ->
            raw.toIntOrNull()?.takeIf { it in 0..12 }?.let(onValueChange)
        },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier,
    )
}
