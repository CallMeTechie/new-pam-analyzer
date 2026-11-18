# PAM Analyzer (Neuentwicklung)

Neuentwicklung des PAM Analyzers zur Auswertung von PAM-Ergebnissen (`.dat`) der
FUJI-Bestückautomaten NXT, NXT-R (APAM) und AIMEX.

## Bestandteile

| Pfad | Inhalt | Stand |
|---|---|---|
| `packages/core` | Rechenkern: Parser und Cpk-Berechnung, ohne Abhängigkeiten | ✅ fertig, gegen das Alt-System abgesichert |
| `packages/ui` | Gemeinsame Oberfläche für Web und Apps | geplant |
| `apps/server` | Server als Docker-Container: REST-API, Firmen, Benutzer, API-Keys, Upload | ✅ API fertig, Web-Oberfläche folgt |
| `apps/client` | Apps für Windows, Android und iOS (Tauri) | geplant |

Details: [Architektur](docs/architektur.md) · [Rechenkern und Dateiformat](docs/rechenkern.md) ·
[Server, API und Betrieb](docs/server.md)

## Entwicklung

Voraussetzungen: Node.js ≥ 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test        # Tests aller Pakete
pnpm typecheck
pnpm lint
pnpm build
```

## Server starten

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='ein-langes-passwort' docker compose up -d --build
```

Beim ersten Start entstehen die Firma „FUJI Service“ und der erste Administrator. Weitere
Einstellungen: [Server](docs/server.md).

## Rechenkern verwenden

```ts
import { analyzePamFile, parsePamFile } from '@pam/core';

const parsed = parsePamFile(content, file.name, { lastModified: new Date(file.lastModified) });
const result = analyzePamFile(parsed);

result.head.x.cpk;          // Cpk X des ganzen Kopfes
result.shafts;              // Kennzahlen je Holder (A, B, …)
parsed.invalidLines;        // nicht auswertbare Zeilen mit Grund
```
