# PAM Analyzer (Neuentwicklung)

Neuentwicklung des PAM Analyzers zur Auswertung von PAM-Ergebnissen (`.dat`) der
FUJI-Bestückautomaten NXT, NXT-R (APAM) und AIMEX.

## Bestandteile

| Pfad | Inhalt | Stand |
|---|---|---|
| `packages/core` | Rechenkern: Parser und Cpk-Berechnung, ohne Abhängigkeiten | ✅ fertig, gegen das Alt-System abgesichert |
| `packages/ui` | Gemeinsame Oberfläche für Web und Apps | geplant |
| `apps/server` | Server als Docker-Container mit Web-Oberfläche und Upload-API | geplant |
| `apps/client` | Apps für Windows, Android und iOS (Tauri) | geplant |

Details: [Architektur](docs/architektur.md) · [Rechenkern und Dateiformat](docs/rechenkern.md)

## Entwicklung

Voraussetzungen: Node.js ≥ 22, pnpm 10 (`corepack enable`).

```bash
pnpm install
pnpm test        # Tests aller Pakete
pnpm typecheck
pnpm lint
pnpm build
```

## Rechenkern verwenden

```ts
import { analyzePamFile, parsePamFile } from '@pam/core';

const parsed = parsePamFile(content, file.name, { lastModified: new Date(file.lastModified) });
const result = analyzePamFile(parsed);

result.head.x.cpk;          // Cpk X des ganzen Kopfes
result.shafts;              // Kennzahlen je Holder (A, B, …)
parsed.invalidLines;        // nicht auswertbare Zeilen mit Grund
```
