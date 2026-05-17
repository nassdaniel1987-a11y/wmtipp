package de.oesterfeld.wmtippspiel.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val Navy = Color(0xFF071B45)
val Blue = Color(0xFF0D4EA6)
val Green = Color(0xFF0B8C42)
val GreenDark = Color(0xFF066634)
val Yellow = Color(0xFFFFC400)
val Orange = Color(0xFFF28A1A)
val Muted = Color(0xFF60708C)
val Background = Color(0xFFEDF5FB)
val SurfaceSoft = Color(0xFFFBFDFF)
val Line = Color(0xFFD8E4F0)

private val AppColors = lightColorScheme(
    primary = Navy,
    onPrimary = Color.White,
    secondary = Blue,
    onSecondary = Color.White,
    tertiary = Green,
    onTertiary = Color.White,
    background = Background,
    onBackground = Navy,
    surface = Color.White,
    onSurface = Navy,
    outline = Line,
)

@Composable
fun WmTippspielTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = AppColors, content = content)
}
