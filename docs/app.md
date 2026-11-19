# Apps für Windows und Android

Tauri 2 mit der Oberfläche aus `apps/web` und dem Rechenkern `packages/core`. Windows und
Android teilen sich den gesamten TypeScript-Code; iOS folgt später. Bedienung: [Handbuch der App](manual/app.de.md).

## Aufbau

```
apps/client
├─ src/                 TypeScript/React
│  ├─ main.tsx          Start: Plattform wählen (Tauri oder Browser-Vorschau), Engine, Seiten
│  ├─ shell.tsx         Seitenleiste, Drag & Drop, Update-Dialog
│  ├─ pages/            Auswertungen, Server, Einstellungen (eigene Seiten der App)
│  ├─ lib/engine.ts     Import, lokale Historie, Verbindung, Upload-Warteschlange, Updates
│  ├─ lib/evaluate.ts   Auswertung wie auf dem Server (gleicher Parser, gleiche Optionen)
│  ├─ lib/store.ts      Lokale Daten: SQLite (Tauri) oder Speicher (Vorschau, Tests)
│  ├─ lib/transport.ts  Beantwortet die API-Aufrufe der übernommenen Web-Seiten lokal
│  └─ platform/         Tauri bzw. Browser: Dateien, HTTP, Token, Updates
├─ src/platform/       tauri.ts (Windows), android.ts (Android), browser.ts (Vorschau, Tests)
└─ src-tauri/           Rust: Dateien lesen; desktop.rs (Credential Manager, Dateizuordnung,
                        eine Instanz, Updater), mobile.rs (APK-Updates), signature.rs
   └─ gen/android/      Android-Projekt (Gradle); PamPlugin.kt: Dateiauswahl, „Teilen“ und
                        „Öffnen mit“, Token im Keystore, Drucken, Falz, APK-Installation
```

## Android

- **Layout** (`src/lib/layout.ts`): unter 840 px Breite Navigation unten (Handys, zugeklappte
  Foldables), ab 840 px Navigationsleiste links mit Liste und Ergebnis nebeneinander (Tablets,
  aufgeklappte Foldables). Die Ergebnisseite zeigt Übersicht, Diagramme und Holder als Reiter
  (`ResultDetailContext.tabbed`); der Ausdruck enthält trotzdem alles. Holder 2-, 3- oder 4-spaltig
  nach Breite (Container Queries).
- **Foldables:** Auf- und Zuklappen ändert nur das Layout, die Seite bleibt. Im Tischmodus (halb
  geöffnet, Falz waagerecht) meldet `PamPlugin.kt` die Lage des Falzes; die Diagramme stehen dann
  darüber, die Bedienung darunter.
- **Dateien:** Dateiauswahl, „Teilen“ (`SEND`, `SEND_MULTIPLE`) und „Öffnen mit“ (`VIEW`). Das Plugin
  kopiert die Dateien in den Cache und gibt Name und Änderungsdatum weiter.
- **Drucken:** `window.print()` wird auf den Android-Druckdialog umgeleitet (auch „Als PDF
  speichern“).
- **Token:** EncryptedSharedPreferences mit Schlüssel im Android-Keystore.
- **QR-Code:** Das Web zeigt einen neuen API-Key zusätzlich als QR-Code
  (`{"server": "…", "apiKey": "pam_…"}`); die App scannt ihn unter „Server“.
- **Updates:** Die APK von GitHub prüft dieselben Kanäle wie Windows (Eintrag `android` in
  `stable.json`/`beta.json`), lädt die APK, prüft die Signatur (`signature.rs`, gleicher Schlüssel
  wie Windows) und übergibt sie dem Android-Installer. Beim ersten Mal fragt Android, ob die App
  Apps installieren darf. Die Version aus Google Play erkennt das (`distribution`) und überlässt
  die Updates Play; im Play-Bundle fehlt die Berechtigung `REQUEST_INSTALL_PACKAGES`.
- **Versionscode:** `0.3.0-beta.2` → 300002, `0.3.0` → 300099; jede Beta und die fertige Version
  steigen, wie Android und Play es verlangen.

Android lokal bauen (Android SDK und NDK nötig):

```bash
pnpm --filter @pam/client tauri android build --debug --target aarch64 --apk
pnpm --filter @pam/client tauri android dev     # auf einem angeschlossenen Gerät
```

Der CI-Job `android` baut bei jedem Pull Request eine Debug-APK und startet sie in einem Emulator.

- **Übernommene Seiten:** Ergebnis und Kopf-Historie sind die Seiten der Web-Oberfläche. Die App
  leitet deren API-Aufrufe mit `setApiTransport` an `lib/transport.ts` um, das sie aus den lokalen
  Daten beantwortet. Die Web-Seite „Ergebnis“ bietet dafür `ResultDetailContext` (eigene
  Schaltflächen statt „Originaldatei“).
- **Gleiche Ergebnisse:** Die App wertet mit denselben Koeffizienten, Bewertungsgrenzen und der
  Zeitzone der Maschinen aus wie der Server (`GET /api/app/config`); ohne Verbindung gelten die
  Standardwerte und die Zeitzone des PCs. Ändert der Server die Werte, bewertet die App alle
  lokalen Ergebnisse neu.
- **Lokale Daten:** SQLite `pam.db` unter `%APPDATA%\com.callmetechie.pamanalyzer`. Ergebnisse als
  JSON-Dokumente (neue Felder ohne Migration), Originaldateien gzip-komprimiert.
- **Server:** HTTP über `tauri-plugin-http` (keine CORS-Regeln nötig). Das Geräte-Token liegt in
  der Windows-Anmeldeinformationsverwaltung, das Passwort wird nie gespeichert.
- **Warteschlange:** Neue Dateien werden mit Status `queued` gespeichert und in Paketen zu 10
  hochgeladen. Netzwerkfehler → erneuter Versuch nach einer Minute; `401` → Verbindung beendet
  (Key widerrufen oder Gerät getrennt).

## Entwicklung

```bash
pnpm --filter @pam/client dev            # Browser-Vorschau unter http://localhost:1420
pnpm --filter @pam/client test           # Unit- und Integrationstests (mit dem echten Server-Code)
pnpm --filter @pam/client e2e            # Browser-Tests der Oberfläche (Server simuliert)
pnpm --filter @pam/client tauri dev      # echte App (Rust, WebView)
```

In der Browser-Vorschau liegen die Daten nur im Speicher; Server-Aufrufe scheitern dort an CORS,
die e2e-Tests simulieren den Server. Unter Linux braucht `tauri dev` die WebKitGTK-Pakete
(siehe Job `app` in `.github/workflows/ci.yml`).

## Veröffentlichen

Der Workflow `.github/workflows/app.yml` baut den Windows-Installer (`windows-latest`), die
Android-APK und das Android-App-Bundle für Google Play (`ubuntu-latest`) und veröffentlicht alles
als ein GitHub-Release. Am einfachsten startet man ihn auf GitHub unter
**Actions → App → Run workflow** mit der Versionsnummer (z. B. `0.2.0` oder `0.3.0-beta.1`); das
Tag `app-v…` legt der Workflow selbst an. Alternativ löst ein selbst gepushtes Tag ihn aus:

| Tag | Release | Update-Kanal |
|---|---|---|
| `app-v0.2.0` | normales Release („Latest“) | `stable` und `beta` |
| `app-v0.3.0-beta.1` | Pre-Release | nur `beta` |

Die Versionsnummer kommt aus dem Tag; die Release-Notizen aus dem passenden Abschnitt in
`apps/client/CHANGELOG.md` (eine Beta ohne eigenen Abschnitt nimmt den Abschnitt ihrer Version).

```bash
git tag app-v0.1.0
git push origin app-v0.1.0
```

Die Kanäle sind zwei Dateien im Release `app-updates` (nicht löschen):
`stable.json` und `beta.json`. Die App liest die Datei ihres Kanals unter
`https://github.com/CallMeTechie/new-pam-analyzer/releases/download/app-updates/<kanal>.json`.
Eine Stable-Version aktualisiert beide Dateien, damit auch Beta-Nutzer sie bekommen.

### Signaturschlüssel

Updates werden nur installiert, wenn sie mit dem privaten Schlüssel signiert sind, dessen
öffentlicher Teil in `apps/client/src-tauri/tauri.conf.json` (`plugins.updater.pubkey`) steht.

- Secret `TAURI_SIGNING_PRIVATE_KEY` im Repository (Settings → Secrets and variables → Actions):
  Inhalt der Datei mit dem privaten Schlüssel.
- Optional `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, falls der Schlüssel ein Passwort hat.

Neuen Schlüssel erzeugen (dann den öffentlichen Teil in `tauri.conf.json` ersetzen; bereits
installierte Apps nehmen danach nur noch Updates an, die mit dem neuen Schlüssel signiert sind, und
müssen einmal von Hand neu installiert werden):

```bash
pnpm --filter @pam/client tauri signer generate -w pam-updater.key
```

### Android-Signaturschlüssel

Android installiert ein Update nur, wenn es mit demselben Schlüssel signiert ist wie die
installierte App. Secrets:

- `ANDROID_KEYSTORE_BASE64`: der Keystore, base64-kodiert,
- `ANDROID_KEYSTORE_PASSWORD`: Passwort von Keystore und Schlüssel,
- `ANDROID_KEY_ALIAS`: Name des Schlüssels.

Der Keystore muss sicher aufbewahrt werden. Geht er verloren, nehmen installierte APKs keine
Updates mehr an. Neuen Keystore erzeugen:

```bash
keytool -genkeypair -keystore pam-release.keystore -storetype PKCS12 -alias pam \
  -keyalg RSA -keysize 4096 -validity 36500
base64 -w0 pam-release.keystore
```

### Google Play

Optional: Mit dem Secret `PLAY_SERVICE_ACCOUNT_JSON` (Dienstkonto mit Zugriff auf die
Play Console) lädt der Workflow das App-Bundle hoch: Stable in die Produktion, Beta in den
offenen Test („beta“). Die erste Version muss einmal von Hand in der Play Console angelegt
werden. Bei Google Play signiert Google die App neu (Play App Signing); der Keystore oben ist
dann der Upload-Schlüssel.

### Code-Signing

Der Installer ist nicht mit einem Code-Signing-Zertifikat signiert. Windows SmartScreen warnt
deshalb beim ersten Start („Weitere Informationen → Trotzdem ausführen“). Die Updates in der App
sind davon unabhängig über den Signaturschlüssel abgesichert. Ein Zertifikat lässt sich später in
`app.yml` ergänzen (`bundle.windows.certificateThumbprint` bzw. `signCommand`).
