# WM-Tippspiel Android

Native Android-App zum bestehenden WM-Tippspiel.

## Öffnen

Diesen Ordner direkt in Android Studio öffnen:

```text
C:\Users\Nassd\Downloads\wm\android-app
```

## Backend konfigurieren

Standardmäßig verwendet die App direkt die Live-Seite:

```text
https://wmtipp.netlify.app
```

Für ein anderes Backend in `gradle.properties` ergänzen:

```properties
WM_API_BASE_URL=https://deine-domain.example
```

## Aktueller Stand

- Einladungscode aktivieren
- QR-Code direkt beim Login scannen
- Teilnehmer lokal merken
- Spiele laden
- gespeicherte Tipps laden
- Tipps speichern
