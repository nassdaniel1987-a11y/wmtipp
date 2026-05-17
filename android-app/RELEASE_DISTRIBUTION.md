# Private Android-Verteilung über Netlify

## Grundidee

Netlify veröffentlicht:

- `public/app-update.json`
- `public/downloads/wmtippspiel-latest.apk`

Die App prüft `app-update.json`. Ist dort ein höherer `versionCode` als lokal eingetragen, zeigt sie ein Update an und lädt die APK über den dort hinterlegten Link.

## Wichtig für echte Updates

Alle Versionen, die dieselbe Installation aktualisieren sollen, müssen:

1. dieselbe `applicationId` verwenden,
2. mit demselben Release-Keystore signiert sein,
3. einen höheren `versionCode` haben.

Den Keystore unbedingt dauerhaft sichern. Ohne denselben Schlüssel akzeptiert Android spätere APKs nicht als Update.

## Release-Ablauf

1. `VERSION_CODE` und `VERSION_NAME` in `version.properties` erhöhen.
2. Im Projektwurzelordner `npm run sync:android-update-manifest` ausführen.
3. Release-APK mit eurem festen Keystore bauen.
4. APK als `public/downloads/wmtippspiel-latest.apk` ablegen.
5. Webprojekt deployen.

`version.properties` ist die zentrale Quelle für die Android-Version. Gradle liest sie direkt ein; das Sync-Skript überträgt dieselben Werte in `public/app-update.json`.

## Vor der ersten echten Verteilung

Einen festen Release-Keystore anlegen und die Gradle-Release-Signierung aktivieren. Debug-APKs sind nur zum Testen geeignet, nicht für die langfristige Verteilung an Teilnehmer.
