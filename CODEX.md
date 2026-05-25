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
- Bundesliga-Admin ist als geführte Betriebszentrale aufgebaut: gruppierte Navigation, Saisonstatus, vorbereitete Zugänge, nächste Schritte und Fachbereiche mit `Diagnose & Freigabe`.
- Bundesliga-Codes können im Bundesliga-Admin wieder gelöscht werden, solange sie frei und keinem Teilnehmer zugeordnet sind.
- Echte Bundesliga-Teilnehmer können im Bundesliga-Admin direkt mit verknüpftem Code angelegt werden.
- Bundesliga-Teilnehmer sind im Admin standardmäßig eingeklappt; pro Teilnehmer öffnet sich ein Detailbereich für Name, Spieltag-Tipps, Bonus und QR-Code.
- Im Bundesliga-Teilnehmerbereich kann der Admin per Zurück/Weiter oder Auswahl durch alle Spieltage wechseln und Tipps je Spieltag nachtragen.
- Bundesliga-Grunddaten 2026/2027 können ausschließlich im Gefahrenbereich unter `Diagnose & Freigabe` gelöscht werden: Spielplan, Teams/Logos, Ergebnisse, Goals, Torschützen sowie alte Tipps/Bonuswerte werden entfernt; echte Teilnehmer und Codes bleiben erhalten.
- Bundesliga-Nutzeransicht hat einen Code-first Login: bestehende Teilnehmer-Codes melden direkt an, freie Codes fragen danach den Namen ab.
- Bundesliga-Nutzer sehen vor der Anmeldung einen fokussierten Code-Login ohne persönliche Bereichsnavigation; nach erfolgreicher Anmeldung erscheint nur die persönliche Zentrale mit Abmelden, nächstem Schritt, Fortschritt, Bonusstatus, Punkten und Direktaktionen.
- Bundesliga-Nutzeransicht hat zusätzliche In-App-Detailseiten für Live-Spieltag, volle Tabelle, volle Torschützenliste und Spielplan.
- Fertige Bundesliga-Spiele öffnen eine persönliche Spielauswertung mit Endergebnis, eigenem Tipp, Punktebegründung, sichtbaren Community-Tipps, Tippverteilung und importiertem Torverlauf.
- Bundesliga-Variante A wurde über alle Nutzerbereiche geglättet: kompakter App-Rahmen, sichtbares Arbeitsfeedback, eindeutig lesbare offene/gesperrte/ausgewertete Tippzustände und reduzierte Doppel-Navigation in Live, Bonus und Spielplan.
- Bundesliga-Bonus-Autosave meldet Speichern erst nach einer tatsächlichen Nutzerauswahl; ein leer geladener Bonus erzeugt kein irreführendes Erfolgsfeedback mehr.
- Bundesliga-Bonus erlaubt vor der ersten OpenLigaDB-Torschützenliste eine freie Spielereingabe, damit der echte Saisonstart nicht auf bereits erzielte Tore warten muss.
- Der Bundesliga-Admin kann die interne Archivvorschau `2025/2026` gezielt öffnen; die normale Teilnehmeransicht bietet keine Saisonwahl und arbeitet auf `2026/2027`.
- Der URL-Testmodus (`?test=1` / `?mode=test`) ist nur in lokaler Development-/Testumgebung aktiv und kann in einem produktiven Web-Build keine Demo-Teilnehmeransicht öffnen.

## Bundesliga Stand

- Versteckte Bundesliga-Version läuft getrennt von der WM unter den Hash-Routen `#bundesliga-start`, `#bundesliga-tippen`, `#bundesliga-bonus`, `#bundesliga-rangliste`, `#bundesliga-live`, `#bundesliga-tabelle`, `#bundesliga-torschuetzen` und `#bundesliga-spielplan`.
- Die zuvor erprobte Bundesliga Variante B wurde wieder entfernt; die bestehenden `#bundesliga-*` Routen sind die einzige Bundesliga-Nutzeransicht.
- Der Bundesliga-Admin öffnet die Teilnehmeransicht getrennt als schreibgeschützte Archivvorschau `2025/2026` oder aktive Livevorbereitung `2026/2027`; Admin-Import, Release-Probelauf und Freigabegates bleiben fest an `bundesliga-2026` gebunden.
- Bundesliga-Admin ist über den Adminbereich erreichbar und bleibt nicht öffentlich.
- Liveziel ist die frische Saison `2026/2027` mit `competition_id = 'bundesliga-2026'`; `bundesliga-2025` bleibt als interne, nicht veröffentlichte Testbasis erhalten.
- OpenLigaDB ist als Hauptquelle vorbereitet: Teams, Logos, Spielplan, Ergebnisse und Torschützen.
- Spielplan und Torschützen werden für den Livebetrieb über `bl1/2026` importiert, sobald OpenLigaDB diese Saison bereitstellt; am 25. Mai 2026 ist der Spielplan dort noch nicht verfügbar.
- Bundesliga-Teilnehmer, Codes, Tipps und Bonus-Tipps sind von WM-Teilnehmern getrennt.
- Echte Bundesliga-Teilnehmer können per Bundesliga-Code beitreten oder im Admin direkt mit Code angelegt werden; freie Bundesliga-Codes lassen sich im Admin löschen.
- Verknüpfte Teilnehmer-Codes zeigen im Admin einen QR-Code; die Daten-API lädt dafür alle Bundesliga-Codes statt nur eines kleinen Ausschnitts.
- Bundesliga-UX nutzt ein eigenes Branding-Set unter `public/brand/bundesliga/`: Scoreboard-Header aus Konzept C, App-Icon aus Konzept D und Badge-Grafiken aus dem ersten Logo-Durchgang.
- Spieltag-Zentrale, Live-Spieltag-Auswertung, Bonus-Erinnerung, mobile Rangliste und Admin-Qualitätscheck sind eingebaut.
- Das Startdashboard zeigt „Nächste Spiele“ als kompakte Logo-Paarungen ohne Ergebnisanzeige.
- Der Bundesliga-Admin enthält in `Diagnose & Freigabe` einen sichtbaren Release-Probelauf mit Ampelstatus für Daten, Codes, Teilnehmer, Tipps, Bonus, Ergebnisse und Rangliste.
- Der Release-Probelauf kann in `Diagnose & Freigabe` per Button vorbereitet werden; er schreibt nur `Release Test 1-3`, Spieltag-1-Tipps, Bonus-Tipps, Spieltag-1-Ergebnisse und hält `public_enabled = false`.
- Release-Probelauf-Testdaten können gezielt wieder gelöscht werden; entfernt werden nur `Release Test 1-3` samt deren Tipps, Bonus-Tipps und Codes. Spielplan, Ergebnisse, Torschützen und echte Teilnehmer bleiben erhalten.
- Der Gefahrenbereich unter `Diagnose & Freigabe` bündelt Bereinigung von Demo-/Diagnose-Daten: Demo-Tipper, Demo-Tipps, Demo-Bonus, Release-Testdaten, Ergebnisse, Goal-Events und offizielle Bundesliga-Bonus-Ergebnisse werden gelöscht. Spielplan, Teams/Logos, Torschützenliste, echte Teilnehmer und echte Codes bleiben erhalten.
- Der Reset für importierte 2026/2027-Grunddaten liegt ebenfalls ausschließlich im Gefahrenbereich, damit Staging-Spielplan, Teams/Logos und Torschützen vor dem Livegang komplett entfernt werden können. Echte Teilnehmer und Codes bleiben stehen.
- Nutzer-Komfort ist erweitert:
  - Karten „Was fehlt noch?“ und „Meine Statistik“ in Start/Tippen/Rangliste.
  - Live-Auswertung erklärt pro Tipp den Punktegrund.
  - Tipp-Trends und Teilnehmervergleich erscheinen nur für sichtbare Spiele ab Anpfiff.
  - Spieltagssieger und Share-Karte werden in der Community-Karte angezeigt.
  - Vorschaukarten öffnen passende Detailseiten direkt über klickbare Überschriften statt über zusätzliche Öffnen-Buttons.
  - Die mobile Bundesliga-Navigation öffnet `Tabelle`, `Torschützen` und `Spielplan` über ein sichtbares `Mehr`-Panel unterhalb der horizontalen Kernnavigation.
  - `#bundesliga-start` trennt die Zustände klar: anonym wird nur der Code-first Login gezeigt, angemeldet die persönliche Zentrale samt `Abmelden`.
  - Die A-Oberfläche priorisiert auf Mobilgeräten den eigentlichen Workflow: kompakte Navigation, verdichtete Zentrale und Read-only-Auswertungsdarstellung für bereits gewertete Spiele.
  - Solange `bundesliga-2026` noch keinen importierten Spielplan besitzt, zeigen Zentrale, Tippen, Bonus und Spielplan einen klaren Vorsaison-Zustand statt vermeintlich fertiger Spieltagsaktionen.
  - Teilnehmer sehen einen verständlichen `Saisonstatus`; technische OpenLigaDB-/Importdetails bleiben im Bundesliga-Admin.
  - Die Spielauswertung ist bewusst kein vollständiges Matchcenter: Karten, Wechsel und Aufstellungen gehören nicht zur ersten Liveversion.
- Automatik ist vorbereitet, aber geschützt:
  - `netlify/functions/bundesliga-auto-import.js` aktualisiert relevante laufende Bundesliga-Spiele nach dem Deploy standardmäßig im Zwei-Minuten-Takt; im Admin lässt sich der Live-Updater pro aktiver Competition als Not-Aus pausieren.
  - Bundesliga-Push-Erinnerungen in `send-tip-reminders.js` laufen nur mit `BUNDESLIGA_PUSH_REMINDERS_ENABLED=true`.
  - Bundesliga-Admin zeigt Datenstatus, letzte Imports und ob Automatik/Push aktiv sind.
- Release-Hardening:
  - Persönliche Bundesliga-APIs leiten den Teilnehmer nur noch aus dem validierten Request-Header `X-Bundesliga-Code` ab; eine mitgesendete `participantId` berechtigt nicht zum Lesen oder Schreiben.
  - Versteckte Bundesliga-Daten sind anonym nicht abrufbar; ein gültiger Bundesliga-Code erlaubt Preview-Prüfungen, bis `public_enabled = true` gesetzt wird.
  - Tipp-Sperre ab Anpfiff, Bonusfrist und Sichtbarkeit fremder Tipps werden serverseitig erzwungen; verdeckte Live-Tipps verraten weder Ergebnis noch Existenz fremder Einträge.
  - Der Admin blockiert die öffentliche Freigabe, solange Release-Gates wie Saison, Bonusfrist, vollständiger Spielplan/Logos oder bereinigte Probe-Ergebnisse offen sind.
  - Push-Erinnerungen gehören bewusst nicht zum ersten Bundesliga-Livegang.
  - Nutzer-Preview-Requests senden zusätzlich `X-Bundesliga-Competition`; erlaubt sind `bundesliga-2025`, `bundesliga-2026` und ausschließlich für die isolierte Generalprobe `bundesliga-liveprobe-rel-2026`. Standard und einzige Releasebasis bleibt `bundesliga-2026`.
  - `bundesliga-2025` ist nur als interne Archivvorschau lesbar: vorhandene zugeordnete Codes können alte Stände prüfen, während Code-Aktivierung, Spieltipps und Bonusänderungen serverseitig blockiert werden.

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
  - `supabase/migrations/20260525012138_bundesliga_2026_release_hardening.sql`
  - legt `bundesliga-2026` verborgen und leer an, schließt öffentliche Reads für verborgene Competitions und beansprucht freie Einladungscodes atomisch über einen Datenbank-Trigger.
  - wurde am 25. Mai 2026 vom Nutzer im SQL Editor des bestehenden WM-Supabase-Projekts ausgeführt.
  - `supabase/migrations/20260525161036_bundesliga_live_updates_probe.sql`
  - ergänzt den Bundesliga-Not-Aus `live_updates_paused` und legt die verborgene, später vollständig löschbare Relegations-Liveprobe an; WM-Tabellen und WM-Flows werden nicht verändert.
  - muss vor Nutzung der Liveprobe beziehungsweise des Live-Not-Aus im bestehenden Supabase-Projekt ausgeführt werden.

## Nächste Schritte Bundesliga

- Im Admin prüfen, dass `bundesliga-2026` als versteckte, leere Saison geladen wird; die SQL-Migration wurde am 25. Mai 2026 ausgeführt.
- Sobald OpenLigaDB `bl1/2026` ausliefert, den Spielplan importieren, Logos kontrollieren und eine echte Bonusfrist in der Release-Konfiguration setzen.
- Mit frischen Staging-Codes Login, Tipp-Sperre, Bonusfrist und Live-Sichtbarkeit prüfen; die Relegations-Generalprobe läuft getrennt in `bundesliga-liveprobe-rel-2026` und wird danach vollständig gelöscht.
- `public_enabled` erst über die Admin-Freigabe aktivieren, wenn die Release-Gates vollständig grün sind; der Live-Updater ist für relevante importierte Spiele aktiv und kann nur im Notfall pausiert werden, Push bleibt vorerst aus.

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
11. Freigabe nur simulieren: `status`, `public_enabled`, Bonusfrist und Regeln prüfen. Die öffentliche Aktion bleibt durch die Release-Gates blockiert, solange Probe- oder Importpunkte offen sind.
12. Im Bereich `Diagnose & Freigabe` bei Bedarf „Release-Testdaten löschen“ klicken. Das entfernt nur die drei Release-Testteilnehmer samt Tipps, Bonus-Tipps und Codes; importierte Daten und echte Teilnehmer bleiben bestehen.
13. Im dortigen Gefahrenbereich für einen kompletten Diagnose-Neustart „Diagnose-Daten löschen“ klicken. Das entfernt Demo- und Auswertungsdaten, lässt aber die importierte Grundlage für Teams, Logos, Spielplan und Torschützen stehen.

## Bundesliga Visuelle QA

Start prüfen:

- „Was fehlt noch?“ zeigt offene Tipps und Bonusstatus.
- „Meine Statistik“, Community-Karte, Saisonstatus und Top-3-Rangliste sind sichtbar.
- „Nächste Spiele“ zeigt Paarungen mit Logos ohne Ergebnisanzeige.
- Bei einer noch leeren Saison `2026/2027` steht stattdessen sichtbar „Spielplan 2026/27 noch nicht verfügbar“; es werden keine Tippaktionen für `ST 1` angeboten.

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

- Bundesliga-Admin öffnet mit geführter Betriebsübersicht, Saisonstatus und den Bereichen `Teilnehmer`, `Codes`, `Spielplan`, `Ergebnisse`, `Bonus`, `Rangliste`, `Datenimport`, `Diagnose & Freigabe`.
- Release-Probelauf starten.
- Unter `Diagnose & Freigabe` Release-Testdaten löschen.
- Im dortigen Gefahrenbereich Diagnose-Daten löschen und prüfen, dass Teams, Spielplan, Torschützen, echte Teilnehmer und echte Codes erhalten bleiben.
- Release-Checkliste, Datenqualität, Teilnehmer, Tipp-Auswertung, Datenimport und Regeln kontrollieren.
- Bei Bedarf ausschließlich im Gefahrenbereich von `Diagnose & Freigabe` „26/27-Grunddaten löschen“ nutzen und prüfen, dass echte Teilnehmer und Codes erhalten bleiben.

Release-Lücken:

- OpenLigaDB liefert `bl1/2026` am 25. Mai 2026 noch nicht; der Admin zeigt diesen wartenden Zustand und lässt die Freigabe geschlossen.
- Eine echte Bonusfrist muss vor dem öffentlichen Start in der Admin-Release-Konfiguration gesetzt werden.

## Bundesliga Release-Finish (25. Mai 2026)

- Variante A bleibt die einzige Bundesliga-Nutzeransicht; der gemeinsame Rahmen ist für Desktop und Mobil verdichtet.
- Regeln und Community-Vergleich folgen `rulesSummary.visibility` beziehungsweise der serverseitigen Sichtbarkeit (`kickoff`, `match_finished`, `never`); frei eingetragene Torschützen-Tipps bleiben in der Zusammenfassung lesbar.
- Die leere aktive Saison `bundesliga-2026` erscheint im Admin als erwartete Vorsaison: Zugänge können vorbereitet sein, während Import-, Bonus- und Freigabeprüfungen auf den offiziellen Spielplan warten.
- Destruktives Zurücksetzen von Ergebnissen verlangt eine Bestätigung; die öffentliche Freigabe bleibt zusätzlich in der UI deaktiviert, solange Release-Gates offen sind.
- Für reine UI- und Testmodusarbeit genügt `npm run dev`. Echte Functions-, Supabase- und Adminprüfungen laufen lokal über `npm run dev:netlify`; HTML-Antworten vom reinen Vite-Server werden als hilfreicher Backend-Hinweis angezeigt.

## Bundesliga Admin-Führung (25. Mai 2026)

- Der Bundesliga-Admin ist als geführte Betriebszentrale organisiert: `Alltag`, `Spielbetrieb` und `Technik` gruppieren die vorhandenen Bereiche für neue Betreuende.
- Die Übersicht priorisiert Saisonstatus, vorbereitete Zugänge, nächste Schritte und eine kompakte Aufgabenliste; technische Detailpanels liegen in ihren Fachbereichen.
- Ergebnisaktualisierung gehört zu `Ergebnisse`, nicht zur allgemeinen Datenimportfläche; `Bonus` zeigt fachliche Werte und Regeln ohne Live-Freigabeschalter.
- `Diagnose & Freigabe` bündelt Release-Gates, Release-Konfiguration, Probelauf, öffentliche Freigabe und den geschützten Gefahrenbereich für Rücksetzungen beziehungsweise Teilnehmerlöschung.
- Die Umordnung selbst verwendete bestehende Actions; der nachfolgende Echt-Livebetrieb ergänzt separat nur das Bundesliga-Feld `live_updates_paused` und die isolierte Probe-Competition.

## Bundesliga Echt-Livebetrieb und Relegations-Generalprobe (25. Mai 2026)

- Laufende Spiele liefern in `Live` den aktuellen Stand, importierte Torereignisse, den Aktualisierungszeitpunkt und deutlich als `vorläufig` gekennzeichnete Spieltagspunkte; die dauerhafte Rangliste rechnet weiterhin ausschließlich finale Ergebnisse.
- `Live` zeigt den letzten geladenen Datenstand neben der manuellen Aktualisierung; `Tippen` warnt in den letzten fünf Minuten vor der serverseitigen Anpfiff-Sperre mit Countdown und markiert ungespeicherte Tipps.
- Die Scheduled Function aktualisiert im Zwei-Minuten-Takt nur `bundesliga-2026` und `bundesliga-liveprobe-rel-2026`, wenn dort ein importiertes Spiel im Live-Zeitfenster liegt. `bundesliga-2025` bleibt schreibgeschütztes Archiv.
- Unter `Diagnose & Freigabe` steuert der Admin den Not-Aus und einen unmittelbaren Refresh für die reguläre Saison sowie die getrennte `Relegations-Liveprobe`.
- Die Probe nutzt ausschließlich OpenLigaDB `rel/2025`, Match `81659`, `SC Paderborn 07 - VfL Wolfsburg` am 25. Mai 2026 um 20:30 Uhr (Europe/Berlin). Sie hat eigene Codes, Teilnehmer, Tipps, Ergebnisse und Tore.
- Probe-Links enthalten `blCompetition=bundesliga-liveprobe-rel-2026`; die Teilnehmeransicht kennzeichnet sie als `Liveprobe Relegation - nicht Saisonbetrieb` und blendet Saisonbonus, Tabelle und Torschützen als reguläre Workflows aus.
- Nach dem Test löscht `Liveprobe vollständig löschen` nur Probe-Daten. `bundesliga-2026` und WM bleiben unangetastet.
- Die mobile Tippdarstellung fixiert überstehende Score-Buttons; das Statistiklabel `Gespeichert` bricht in schmalen Karten lesbar um.

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
