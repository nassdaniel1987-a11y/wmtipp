# Österfeld Tippspiel Bundesliga Logo-Richtungen

## Ziel

Die Bundesliga-App bleibt Teil von Österfeld Tippspiel. Die fünf Richtungen sind als Auswahl- und Review-System gedacht, nicht als sofortiger Ersatz der bestehenden Produktionsassets.

## Richtungen

| Richtung | Beste Verwendung | Kernzeichen | Badge-Logik |
| --- | --- | --- | --- |
| Scoreboard Core | Header, Share Card, Live | LED-Scoreboard mit `2:1` | Mini-Scoreboard fuer Live und Spieltagssieger |
| ÖT Crest | App-Icon, Achievements | rundes oder schildfoermiges `ÖT` | einheitliche Crest-Familie fuer Top 3 und ST-Sieger |
| Tippzettel Matchmark | Funktionsklarheit | Tippschein, roter Haken, Ball | `ST`, Haken und Podium statt langer Texte |
| Matchday Ribbon | Share- und Siegerkommunikation | Matchday-Banner | Gold fuer Winner, Gruen fuer Live |
| Private League System | Mobile-App und Admin | reduziertes `ÖT`-Monogramm | UI-nahe Status-Plaketten |

## Pflichtformate

| Asset | Zielgroesse | Hinweise |
| --- | ---: | --- |
| Header-Logo | 1200 x 278 | Primaer fuer `BUNDESLIGA_BRAND_ASSETS.header` |
| Compact-Logo | 760 x 176 | Primaer fuer Header-Navigation |
| App-Icon | 512 x 512 | Muss bei 48 px noch lesbar sein |
| App-Icon klein | 192 x 192 | Android/Web-App Fallback |
| Share Card | 1200 x 628 | Muss mit Namen, Punkten und Platz funktionieren |
| Badge gross | 512 x 512 | Fuer Spieltagssieger und Top 3 |
| Live-Badge | 512 x 256 | Muss ohne Animation lesbar bleiben |

## Farbregeln

- Dunkles Ink/Panel bleibt die Basis.
- Rot ist Markensignal und Konturfarbe.
- Weiss ist die primaere Schriftfarbe.
- Gold nur fuer Gewinner- und Top-Status.
- Gruen nur fuer Live, erledigt oder positive Statuszustaende.

## Promptset

Scoreboard Core:

```text
Vector-friendly dark sports tipping app logo system for ‘Österfeld Tippspiel’, horizontal LED scoreboard motif, red digital score 2:1, bold white wordmark, compact app icon variant, achievement badge variants for matchday winner, top 3 ranking, live status, premium but private community feel, no official Bundesliga logo, no betting aesthetic.
```

ÖT Crest:

```text
Vector-friendly crest logo system for ‘ÖT Österfeld Tippspiel’, black shield and circular badge variants, red outline, white ÖT monogram, subtle football and scoreline elements, matching badges for Spieltagssieger, Top 3, Live, clean mobile app identity, no gambling style.
```

Tippzettel Matchmark:

```text
Vector-friendly mobile app logo system, stylized prediction slip with red checkmark and football, ‘Österfeld Tippspiel’ wordmark, dark high-contrast interface style, matching compact icon and badges for matchday winner, ranking top 3, live, private sports community.
```

Matchday Ribbon:

```text
Vector-friendly sports badge and logo system for ‘Österfeld Tippspiel’, matchday ribbon language, dark graphite background, red winner stripe, gold used only for winner status, app icon, share card mark, Spieltagssieger and Top 3 badge family.
```

Private League System:

```text
Minimal premium product logo system for private football tipping app ‘Österfeld Tippspiel’, clean ÖT monogram, subtle LED dots and score markers, dark UI-ready palette, restrained red accent, readable at small app-icon sizes, matching achievement badge set.
```

## Review-Reihenfolge

1. Erst bei 32 px, 48 px und 96 px pruefen.
2. Dann Header, Share Card, Winner Callout, Top-3-Karte und Live-Badge pruefen.
3. Erst danach einzelne Assets in Produktionsgroessen exportieren.
4. Keine Richtung verwenden, die wie offizielles Liga-Branding, Sportwetten-Branding oder generische Esports-Grafik wirkt.
