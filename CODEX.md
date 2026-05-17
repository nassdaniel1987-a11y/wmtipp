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
- Info-Bereich mit Punktehinweisen und App-Version

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
