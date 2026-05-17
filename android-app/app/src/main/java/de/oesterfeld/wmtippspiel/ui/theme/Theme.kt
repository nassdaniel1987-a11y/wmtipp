package de.oesterfeld.wmtippspiel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val AppColors = lightColorScheme(
    primary = Color(0xFF071B45),
    secondary = Color(0xFF1E5AA8),
    background = Color(0xFFF7F8FC),
    surface = Color.White,
    onPrimary = Color.White,
    onBackground = Color(0xFF142033),
    onSurface = Color(0xFF142033),
)

@Composable
fun WmTippspielTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AppColors,
        content = content,
    )
}
