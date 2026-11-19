# App für Windows

Tauri 2 mit der Oberfläche aus `apps/web` und dem Rechenkern `packages/core`. Android und iOS
folgen später mit derselben Codebasis. Bedienung: [Handbuch der App](manual/app.de.md).

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
└─ src-tauri/           Rust: Dateien lesen, Token im Credential Manager, Dateizuordnung .dat,
                        eine Instanz, Updater mit Kanälen
```

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

Der Workflow `.github/workflows/app.yml` baut auf `windows-latest` den Installer und
veröffentlicht ihn als GitHub-Release. Ausgelöst wird er durch ein Tag:

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

### Code-Signing

Der Installer ist nicht mit einem Code-Signing-Zertifikat signiert. Windows SmartScreen warnt
deshalb beim ersten Start („Weitere Informationen → Trotzdem ausführen“). Die Updates in der App
sind davon unabhängig über den Signaturschlüssel abgesichert. Ein Zertifikat lässt sich später in
`app.yml` ergänzen (`bundle.windows.certificateThumbprint` bzw. `signCommand`).
