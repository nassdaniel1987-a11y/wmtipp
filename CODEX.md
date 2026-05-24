# CODEX.md

## Projektüberblick

- Webapp: React/Vite im Projektwurzelordner
- Android-App: eigenständiges natives Projekt in `android-app/`
- Live-URL: `https://wmtipp.netlify.app`
- Web und Android nutzen dasselbe Backend und dieselben Teilnehmerdaten.

## Wichtige Android-Entscheidungen

- Paketname / App-ID: `de.oesterfeld.wmtippspiel`
- Android-App ist eine Teilnehmer-App; Admin bleibt Web-only.
- Native App mit Kotlin + Jetpack Compose.
- App kommuniziert direkt mit dem Live-Backend unter `https://wmtipp.netlify.app`.
- Login über QR-Code bzw. Einladungscode.

## Private Android-Verteilung

Die App wird privat über Netlify verteilt:

- APK-Download:
  - `public/downloads/wmtippspiel-latest.apk`
  - live unter `https://wmtipp.netlify.app/downloads/wmtippspiel-latest.apk`
- Update-Metadaten:
  - `public/app-update.json`
  - live unter `https://wmtipp.netlify.app/app-update.json`

Die Android-App prüft `app-update.json`. Wenn dort ein höherer `versionCode` als lokal installiert ist, zeigt sie einen Update-Hinweis an und lädt die APK von Netlify.
Update-APKs werden innerhalb des App-Caches geladen und beim nächsten App-Start wieder bereinigt; neue Updates landen nicht mehr dauerhaft im öffentlichen Download-Ordner.

## Release-Signierung

- Der dauerhafte Release-Keystore liegt lokal unter:
  - `android-app/release/wmtippspiel-release.jks`
- Die lokale Konfigurationsdatei liegt unter:
  - `android-app/keystore.properties`
- Beide Dateien sind absichtlich per `.gitignore` ausgeschlossen.
- Ohne denselben Keystore können spätere APKs bereits installierte Apps nicht normal aktualisieren.
- Vor jeder größeren Änderung sicherstellen, dass der Keystore extern gesichert ist.

## Versionsverwaltung

Zentrale Quelle für die Android-Version:

- `android-app/version.properties`

Beispiel:

```properties
VERSION_CODE=2
VERSION_NAME=0.1.1
```

Gradle liest diese Datei direkt ein.  
`public/app-update.json` wird daraus synchronisiert mit:

```bash
npm run sync:android-update-manifest
```

Die App zeigt ihre aktuelle Version im Reiter **Info** an.

## Release-Ablauf für Android-Updates

1. `android-app/version.properties` erhöhen
2. falls gewünscht `notes` in `public/app-update.json` anpassen
3. im Projektwurzelordner ausführen:
   ```bash
   npm run sync:android-update-manifest
   ```
4. Release-APK bauen:
   ```bash
   cd android-app
   .\gradlew.bat :app:assembleRelease
   ```
5. APK kopieren:
   ```powershell
   Copy-Item -Force `
     'android-app\app\build\outputs\apk\release\app-release.apk' `
     'public\downloads\wmtippspiel-latest.apk'
   ```
6. App-/Web-Build prüfen
7. committen und nach `main` pushen
8. nach Netlify-Deploy prüfen:
   - `https://wmtipp.netlify.app/app-update.json`
   - `https://wmtipp.netlify.app/downloads/wmtippspiel-latest.apk`

## Bekannter Installationsfall

Wenn eine alte Android-Studio-Debugversion installiert war, kann die Release-APK wegen anderer Signatur nicht darüber installiert werden.

Auf einem getesteten Gerät blieb die alte Debug-App trotz Deinstallation im Android-Profil **Private space** erhalten.  
ADB-Diagnose:

```bash
adb devices -l
adb shell pm list users
adb shell pm list packages -u | findstr de.oesterfeld.wmtippspiel
```

Falls das Paket nur noch in einem Nebenprofil hängt:

```bash
adb shell pm uninstall --user <USER_ID> de.oesterfeld.wmtippspiel
```

## Häufige Befehle

Web:

```bash
npm run build
```

Android Debug:

```bash
cd android-app
.\gradlew.bat :app:assembleDebug
```

Android Release:

```bash
cd android-app
.\gradlew.bat :app:assembleRelease
```

## Aktueller UI-Stand Android

- Tabs: Start, Tippen, Rangliste, Info
- Start-Dashboard mit Fortschritt
- Tippkarten mit Flaggenbildern, Such-/Gruppenfilter, einklappbarem Community-Trend
- Mobile Toreingabe je Teamzeile über `Minus · Zahl · Plus` statt Formularfeldern
- Tipps werden nach Änderungen automatisch mit kurzem Debounce gespeichert; der Status erscheint inline in der Karte
- Bonus-Tipps mit kompakter Gruppenübersicht
- Rangliste mit Gesamtpunkten und Durchschnitt
- Info-Bereich mit ausführlicher Punktevergabe, Ranglistenhinweis und App-Version

## Aktueller Admin-Stand Web

- QR-Code-Bereich ist einklappbar, damit viele Codes den Adminbereich nicht dauerhaft überladen.
- Teilnehmernamen können direkt in der Teilnehmerliste bearbeitet werden.
- Personalisierte Offline-Tippbögen enthalten einen scannbaren QR-Code je Teilnehmer.
- Admin-Daten laden Spieltipps und Bonus-Tipps paginiert, damit Counter und Nachträge auch über dem Supabase-Standardlimit von 1000 Zeilen stimmen.
- Bundesliga-Admin ist jetzt als Betriebsbereich aufgebaut: linke Navigation, kompakte KPI-Leiste, Operations-Queue, Ergebnis-/Teilnehmer-Arbeitsflächen und Diagnose-Bereich.
- Bundesliga-Codes können im Bundesliga-Admin wieder gelöscht werden, solange sie frei und keinem Teilnehmer zugeordnet sind.
- Echte Bundesliga-Teilnehmer können im Bundesliga-Admin direkt mit verknüpftem Code angelegt werden.
- Bundesliga-Grunddaten 2025/2026 können im Datenimport gelöscht werden: Spielplan, Teams/Logos, Ergebnisse, Goals, Torschützen sowie alte Tipps/Bonuswerte werden entfernt; echte Teilnehmer und Codes bleiben erhalten.

## Bundesliga Stand

- Versteckte Bundesliga-Version läuft getrennt von der WM unter den Hash-Routen `#bundesliga-start`, `#bundesliga-tippen`, `#bundesliga-bonus` und `#bundesliga-rangliste`.
- Bundesliga-Admin ist über den Adminbereich erreichbar und bleibt nicht öffentlich.
- Datenbasis nutzt `competition_*` Tabellen mit `competition_id = 'bundesliga-2025'`.
- OpenLigaDB ist als Hauptquelle vorbereitet: Teams, Logos, Spielplan, Ergebnisse und Torschützen.
- Torschützen werden über `getgoalgetters/bl1/2025` importiert und im Admin korrigierbar gemacht.
- Bundesliga-Teilnehmer, Codes, Tipps und Bonus-Tipps sind von WM-Teilnehmern getrennt.
- Echte Bundesliga-Teilnehmer können per Bundesliga-Code beitreten oder im Admin direkt mit Code angelegt werden; freie Bundesliga-Codes lassen sich im Admin löschen.
- Bundesliga-UX nutzt ein eigenes Branding-Set unter `public/brand/bundesliga/`: Scoreboard-Header aus Konzept C, App-Icon aus Konzept D und Badge-Grafiken aus dem ersten Logo-Durchgang.
- Spieltag-Zentrale, Live-Spieltag-Auswertung, Bonus-Erinnerung, mobile Rangliste und Admin-Qualitätscheck sind eingebaut.
- Das Startdashboard zeigt „Nächste Spiele“ als kompakte Logo-Paarungen ohne Ergebnisanzeige.
- Der Bundesliga-Admin enthält in `Diagnose` einen sichtbaren Release-Probelauf mit Ampelstatus für Daten, Codes, Teilnehmer, Tipps, Bonus, Ergebnisse und Rangliste.
- Der Release-Probelauf kann im Diagnose-Bereich per Button vorbereitet werden; er schreibt nur `Release Test 1-3`, Spieltag-1-Tipps, Bonus-Tipps, Spieltag-1-Ergebnisse und hält `public_enabled = false`.
- Release-Probelauf-Testdaten können gezielt wieder gelöscht werden; entfernt werden nur `Release Test 1-3` samt deren Tipps, Bonus-Tipps und Codes. Spielplan, Ergebnisse, Torschützen und echte Teilnehmer bleiben erhalten.
- Der Diagnose-Bereich hat zusätzlich einen großen Bereinigungsbutton für Demo-/Diagnose-Daten: Demo-Tipper, Demo-Tipps, Demo-Bonus, Release-Testdaten, Ergebnisse, Goal-Events und offizielle Bundesliga-Bonus-Ergebnisse werden gelöscht. Spielplan, Teams/Logos, Torschützenliste, echte Teilnehmer und echte Codes bleiben erhalten.
- Im Bereich `Datenimport` gibt es zusätzlich einen Reset für die importierten 2025/2026-Grunddaten, damit Test-Spielplan, Teams/Logos und Torschützen vor dem Livegang komplett entfernt werden können. Echte Teilnehmer und Codes bleiben stehen.
- Nutzer-Komfort ist erweitert:
  - Karten „Was fehlt noch?“ und „Meine Statistik“ in Start/Tippen/Rangliste.
  - Live-Auswertung erklärt pro Tipp den Punktegrund.
  - Tipp-Trends und Teilnehmervergleich erscheinen nur für sichtbare Spiele ab Anpfiff.
  - Spieltagssieger und Share-Karte werden in der Community-Karte angezeigt.
- Automatik ist vorbereitet, aber geschützt:
  - `netlify/functions/bundesliga-auto-import.js` importiert Ergebnisse/Torschützen nur mit `BUNDESLIGA_AUTO_IMPORT_ENABLED=true`.
  - Bundesliga-Push-Erinnerungen in `send-tip-reminders.js` laufen nur mit `BUNDESLIGA_PUSH_REMINDERS_ENABLED=true`.
  - Bundesliga-Admin zeigt Datenstatus, letzte Imports und ob Automatik/Push aktiv sind.

## Zuletzt ausgeführte / benötigte SQL-Dateien

- WM-Grundlage:
  - `supabase/schema.sql`
  - `supabase/seed_matches.sql`
  - `supabase/bonus_tips.sql`
  - `supabase/bonus_results.sql`
  - `supabase/players.sql`
- Bundesliga-Grundlage:
  - `supabase/bundesliga_test_environment.sql`
- Bundesliga Release-Konfiguration:
  - `supabase/bundesliga_release_settings.sql`
  - bleibt idempotent und lässt `bundesliga-2025` weiterhin versteckt: `status = 'admin_test'`, `public_enabled = false`.

## Nächste Schritte Bundesliga

- Komfort-/Community-Runde im Browser visuell prüfen, sobald lokaler Browserzugriff nicht blockiert ist:
  - Start: „Was fehlt noch?“, „Meine Statistik“, Community, Datenstatus.
  - Tippen: Live-Auswertung mit Punktegrund und Trends.
  - Rangliste: Spieltagssieger, Teilnehmervergleich, Share-Karte.
- Push/Auto-Import erst aktivieren, wenn Firebase/Env und echter Bundesliga-Betrieb bewusst freigegeben sind.
- Vor öffentlicher Freigabe später Saison/Deadline auf die echte Bundesliga-Saison umstellen und bewusst `public_enabled` aktivieren.

## Bundesliga Release-Probelauf

1. Admin öffnen und in die Bundesliga-Admin-Ansicht wechseln.
2. OpenLigaDB-Daten prüfen oder importieren: Teams, Logos, Spielplan und Torschützen.
3. In der Karte „Release-Probelauf“ den Button „Release-Probelauf vorbereiten“ klicken.
4. Der Button stellt sicher:
   - `Release Test 1`, `Release Test 2`, `Release Test 3` existieren als Bundesliga-Testteilnehmer.
   - Spieltag 1 hat Beispieltipps, aber ein Tipp bleibt bewusst offen.
   - Bonus-Tipps sind gesetzt.
   - Ergebnisse für Spieltag 1 werden aus vorhandenen OpenLigaDB-Daten importiert.
   - Offizielle Bonus-Ergebnisse werden gesetzt, falls sie noch leer sind.
   - `status = 'admin_test'` und `public_enabled = false` bleiben erhalten.
5. Probelauf-Bericht und Ampelstatus prüfen. Warnungen als Release-Lücke notieren.
6. Tab `Teilnehmer` öffnen und prüfen, ob die drei Release-Testteilnehmer sichtbar sind.
7. Tab `Tipp-Auswertung` und `Rangliste` prüfen.
8. Optional Admin-Nachtrag testen: einen Spieltipp oder Bonuswert eines Release-Testteilnehmers korrigieren und danach Teilnehmeransicht neu laden.
9. Versteckte Teilnehmeransicht `#bundesliga-start`, `#bundesliga-tippen`, `#bundesliga-bonus` und `#bundesliga-rangliste` prüfen.
10. Live-Spieltag-Auswertung und Rangliste prüfen:
    - exaktes Ergebnis: 4 Punkte
    - richtige Differenz: 3 Punkte
    - richtige Tendenz: 2 Punkte
    - falsch oder offen: 0 Punkte
11. Freigabe nur simulieren: `status`, `public_enabled`, Bonusfrist und Regeln prüfen, aber Bundesliga nicht öffentlich aktivieren.
12. Bei Bedarf „Release-Testdaten löschen“ klicken. Das entfernt nur die drei Release-Testteilnehmer samt Tipps, Bonus-Tipps und Codes; importierte Daten und echte Teilnehmer bleiben bestehen.
13. Für einen kompletten Diagnose-Neustart „Diagnose-Daten löschen“ klicken. Das entfernt Demo- und Auswertungsdaten, lässt aber die importierte Grundlage für Teams, Logos, Spielplan und Torschützen stehen.

## Bundesliga Visuelle QA

Start prüfen:

- „Was fehlt noch?“ zeigt offene Tipps und Bonusstatus.
- „Meine Statistik“, Community-Karte, Datenstatus und Top-3-Rangliste sind sichtbar.
- „Nächste Spiele“ zeigt Paarungen mit Logos ohne Ergebnisanzeige.

Tippen prüfen:

- Spieltag-Navigation mit Pfeilen und Status-Chips funktioniert.
- Tippkarten zeigen Logos, `-:-` für offene Tipps und klare Speicher-/Statushinweise.
- Live-Auswertung zeigt Ergebnis, eigenen Tipp, Punktegrund und Trends; fremde Tipps bleiben bis Anpfiff versteckt.

Bonus prüfen:

- Meister, Torschützenkönig und drei Absteiger sind bedienbar.
- Bonus-Erinnerung bleibt sichtbar, solange etwas offen ist.
- Bonusfrist kommt aus der Release-Konfiguration, falls vorhanden.

Rangliste prüfen:

- Top 3, eigene Platzierung, Spieltagssiege und Spieltagssieger-Karte sind lesbar.
- Mobile Rangliste bleibt als Kartenansicht ohne horizontales Quetschen nutzbar.

Admin prüfen:

- Bundesliga-Admin öffnet mit Betriebsübersicht, KPI-Leiste, Operations-Queue und den Bereichen `Teilnehmer`, `Codes`, `Spielplan`, `Ergebnisse`, `Bonus`, `Rangliste`, `Datenimport`, `Diagnose`.
- Release-Probelauf starten.
- Release-Testdaten löschen.
- Diagnose-Daten löschen und prüfen, dass Teams, Spielplan, Torschützen, echte Teilnehmer und echte Codes erhalten bleiben.
- Release-Checkliste, Datenqualität, Teilnehmer, Tipp-Auswertung, Datenimport und Regeln kontrollieren.
- Bei Bedarf im Bereich `Datenimport` „25/26-Grunddaten löschen“ nutzen und prüfen, dass echte Teilnehmer und Codes erhalten bleiben.

Release-Lücken:

- Noch keine offenen Lücken aus dem Probelauf notiert.

## CODEX.md Pflege-Regel

- Nach größeren Arbeitsblöcken kurz aktualisieren:
  - Was ist fertig?
  - Welche SQL-Datei ist neu oder muss ausgeführt werden?
  - Was ist der nächste sinnvolle Schritt?
  - Welche Dinge bleiben bewusst versteckt oder noch nicht live?

## Hinweise für spätere Erweiterungen

- `TeamMark` ist absichtlich allgemein gehalten, damit bei einem späteren Wechsel von WM auf Bundesliga statt Flaggen Vereinslogos verwendet werden können.
- Push-Benachrichtigungen sind code-seitig vorbereitet:
  - Android registriert FCM-Geräte und bietet Tipp-Erinnerungen in den Info-Einstellungen an.
  - `netlify/functions/send-tip-reminders.js` prüft alle 15 Minuten auf offene Tipps 24h bzw. 3h vor Anpfiff.
  - Für die Aktivierung fehlen nur noch Firebase-Konfiguration und produktive Supabase-Schema-Anwendung.
- Firebase-Dateien bleiben lokal/geheim:
  - `android-app/app/google-services.json` ist per `.gitignore` ausgeschlossen.
  - Netlify braucht `FIREBASE_SERVICE_ACCOUNT_JSON` als geheime Umgebungsvariable.
  - Für manuelle End-to-End-Tests gibt es `/api/send-test-push`; dieser Endpunkt erwartet zusätzlich `TEST_PUSH_SECRET`.
  - Für kontrollierte Logiktests gibt es `/api/test-tip-reminder` mit Preview- und Send-Modus für `24h` und `3h`.
  - Versandläufe deaktivieren ungültige FCM-Tokens automatisch, damit alte Installationen keine Fehlversuche sammeln.
- Admin-Funktionen bleiben Web-only.
