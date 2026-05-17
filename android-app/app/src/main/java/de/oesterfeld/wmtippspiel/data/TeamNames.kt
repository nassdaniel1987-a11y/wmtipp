package de.oesterfeld.wmtippspiel.data

private val germanTeamNames = mapOf(
    "Algeria" to "Algerien", "Argentina" to "Argentinien", "Australia" to "Australien", "Austria" to "Österreich",
    "Belgium" to "Belgien", "Bosnia & Herzegovina" to "Bosnien und Herzegowina", "Brazil" to "Brasilien", "Canada" to "Kanada",
    "Cape Verde" to "Kap Verde", "Colombia" to "Kolumbien", "Croatia" to "Kroatien", "Curaçao" to "Curaçao",
    "Czechia" to "Tschechien", "DR Congo" to "DR Kongo", "Ecuador" to "Ecuador", "Egypt" to "Ägypten",
    "England" to "England", "France" to "Frankreich", "Germany" to "Deutschland", "Ghana" to "Ghana", "Haiti" to "Haiti",
    "Iran" to "IR Iran", "Iraq" to "Irak", "Ivory Coast" to "Elfenbeinküste", "Japan" to "Japan", "Jordan" to "Jordanien",
    "Mexico" to "Mexiko", "Morocco" to "Marokko", "Netherlands" to "Niederlande", "New Zealand" to "Neuseeland",
    "Norway" to "Norwegen", "Panama" to "Panama", "Paraguay" to "Paraguay", "Portugal" to "Portugal", "Qatar" to "Katar",
    "Saudi Arabia" to "Saudi-Arabien", "Scotland" to "Schottland", "Senegal" to "Senegal", "Serbia" to "Serbien",
    "South Africa" to "Südafrika", "South Korea" to "Republik Korea", "Spain" to "Spanien", "Sweden" to "Schweden",
    "Switzerland" to "Schweiz", "Tunisia" to "Tunesien", "Türkiye" to "Türkei", "Uruguay" to "Uruguay",
    "United States" to "USA", "Uzbekistan" to "Usbekistan",
)

fun displayTeamName(name: String): String = germanTeamNames[name] ?: name
