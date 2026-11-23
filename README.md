# PAM Analyzer (Neuentwicklung)

Neuentwicklung des PAM Analyzers zur Auswertung von PAM-Ergebnissen (`.dat`) der
FUJI-Bestückautomaten NXT, NXT-R (APAM) und AIMEX.

## Bestandteile

| Pfad | Inhalt | Stand |
|---|---|---|
| `packages/core` | Rechenkern: Parser und Cpk-Berechnung, ohne Abhängigkeiten | ✅ fertig, gegen das Alt-System abgesichert |
| `apps/server` | Server als Docker-Container: REST-API, Firmen, Benutzer, Einladungen und Geräte, Upload | ✅ fertig |
| `apps/web` | Web-Oberfläche (React), Englisch und Deutsch; Grundlage der Apps | ✅ fertig |
| `apps/client` | Apps für Windows und Android (Tauri), iOS folgt | ✅ Windows und Android |

Details: [Handbuch](docs/manual/de.md) · [Änderungen](CHANGELOG.de.md) ·
[Architektur](docs/architektur.md) · [Rechenkern und Dateiformat](docs/rechenkern.md) ·
[Server, API und Betrieb](docs/server.md) · [Web-Oberfläche](docs/web.md) ·
[Apps](docs/app.md) · [Handbuch der App](docs/manual/app.de.md)

## Entwicklung

Voraussetzungen: Node.js ≥ 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test        # Tests aller Pakete
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @pam/web e2e   # Browser-Tests gegen den gebauten Server
pnpm --filter @pam/client e2e   # Browser-Tests der App-Oberfläche
```

Web-Oberfläche mit Live-Reload: Server mit `pnpm --filter @pam/server dev` starten (Port 3000),
dann `pnpm --filter @pam/web dev`; Vite leitet `/api` an den Server weiter.

## Server starten

```bash
docker compose up -d
```

Das Image kommt von `ghcr.io/callmetechie/new-pam-analyzer:latest`; mit `--build` wird es lokal
gebaut. Die Web-Oberfläche läuft danach unter http://localhost:3000.

Der Datenordner wird beim Start automatisch eingerichtet, auch als eingebundener Ordner eines
NAS (z. B. Synology); Rechte von Hand sind nicht nötig. Hinter einem Reverse Proxy muss
`PUBLIC_URL` genau die Adresse sein, die im Browser steht, z. B. `https://pam.example.com`.

### Erste Anmeldung

Beim ersten Start legt der Server die Firma „FUJI Service“ und einen Administrator **in der
Datenbank** an. Es gibt keine Zugangsdaten in `.env` oder Umgebungsvariablen.

| | Standard |
|---|---|
| E-Mail-Adresse | `admin@example.com` |
| Passwort | `admin1234` |

Bei der ersten Anmeldung **müssen E-Mail-Adresse und Passwort geändert werden** (Passwort
mindestens 12 Zeichen). Bis dahin ist mit dem Konto nichts anderes möglich, auch keine
Verbindung aus den Apps. Danach funktionieren die Standard-Zugangsdaten nicht mehr.

> **Wichtig:** Die Standard-Zugangsdaten sind öffentlich bekannt. Melden Sie sich direkt nach dem
> ersten Start an und ändern Sie sie, bevor der Server aus dem Internet erreichbar ist.

Gibt es keinen Administrator mehr (z. B. nach dem Löschen der Datenbank), legt der nächste Start
das Standardkonto erneut an. Weitere Einstellungen: [Server](docs/server.md).

## Rechenkern verwenden

```ts
import { analyzePamFile, parsePamFile } from '@pam/core';

const parsed = parsePamFile(content, file.name, { lastModified: new Date(file.lastModified) });
const result = analyzePamFile(parsed);

result.head.x.cpk;          // Cpk X des ganzen Kopfes
result.shafts;              // Kennzahlen je Holder (A, B, …)
parsed.invalidLines;        // nicht auswertbare Zeilen mit Grund
```
