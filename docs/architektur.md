# Architektur

## Ziel

- **Server** als eigenständiger Docker-Container: Web-Oberfläche, Benutzer und Rollen, Kunden,
  Historie je Kopf, Suche, Upload-API.
- **Apps** für Windows, Android und iOS, die PAM-Dateien **eigenständig und offline** auswerten und
  die Daten optional per API-Key zum Server hochladen.
- Alle rechnen mit **demselben Rechenkern** (`packages/core`) und kommen daher zu identischen Ergebnissen.

```
  Windows / Android / iOS (Tauri)                Docker-Container
 ┌──────────────────────────────┐           ┌──────────────────────────┐
 │ UI (packages/ui)             │           │ Web-UI (packages/ui)     │
 │ core  → rechnet offline      │  HTTPS    │ REST-API  (API-Key)      │
 │ lokale SQLite (Historie)     │ ────────► │ core  → rechnet erneut   │
 │ Upload-Warteschlange         │  .dat +   │ SQLite  (Volume /data)   │
 └──────────────────────────────┘  Metadaten└──────────────────────────┘
```

## Entscheidungen

| Thema | Entscheidung | Begründung |
|---|---|---|
| Sprache | TypeScript in allen Teilen | Ein Rechenkern für Server, Browser und Apps |
| Rechenkern | Reines TypeScript ohne Abhängigkeiten | Läuft in Node, Browser und App-WebViews |
| Datenbank | SQLite (Drizzle ORM) | ca. 100.000 Datensätze, wenige Schreibzugriffe; eine Datei, einfache Backups |
| Server | Node.js (Hono oder Fastify) im Docker-Container | Ein Image, Daten auf Volume `/data` |
| Apps | Tauri 2 (Windows, Android, iOS) | Gemeinsame Web-Oberfläche, kleine Installer; mobil notfalls Capacitor |
| Gespeichert wird | Originaldatei (komprimiert) + Kennzahlen als Spalten | Diagramme werden bei Bedarf berechnet; Neuberechnung jederzeit möglich |

## Sprachen

- **Englisch ist die Hauptsprache**, Deutsch die zweite Sprache; umschaltbar in Web und Apps.
- Weitere Sprachen kommen später dazu. Deshalb steht jeder sichtbare Text in einem
  **Sprachkatalog** (ein Katalog je Sprache, Schlüssel → Text); Englisch ist der Rückfall, wenn
  ein Text in einer Sprache fehlt. Eine neue Sprache ist ein weiterer Katalog, kein Umbau.
- Einzahl/Mehrzahl über `Intl.PluralRules`, Zahlen über `Intl.NumberFormat` (0.718 bzw. 0,718),
  Datum über `Intl.DateTimeFormat`, jeweils passend zur gewählten Sprache.
- Der **Rechenkern liefert keine Anzeigetexte**, sondern Codes (`ParseWarning.code`,
  `InvalidLine.reason`, `PamParseError.code`, Bewertungen) mit Parametern. Seine `message`-Felder
  sind englisch und nur für Protokolle gedacht.
- Fachbegriffe aus der FUJI-Welt (Head, Total, CPK, Holder) bleiben in allen Sprachen erkennbar.

## Upload von den Apps

- Die App sendet die **Original-`.dat`-Datei** und Metadaten, nicht ihr Ergebnis. Der Server rechnet
  mit seinem Rechenkern und seinen Koeffizienten neu und ist maßgeblich.
- **API-Keys** werden je Benutzer oder Gerät in der Web-Oberfläche erzeugt, nur als Hash gespeichert,
  sind widerrufbar und auf das Hochladen beschränkt.
- Doppelte Dateien werden über den SHA-256-Hash des Inhalts erkannt; ein erneuter Upload ist folgenlos.
- Die Apps sammeln Uploads offline in einer Warteschlange.
- Die Apps bringen die Standard-Koeffizienten mit und holen den aktuellen Stand vom Server.
- Jedes Ergebnis speichert die Version der Berechnung (`ALGORITHM_VERSION`) und den verwendeten Koeffizienten.

## Migration aus dem Alt-System

Das Alt-System speichert keine Originaldateien, sondern nur die geparsten Messpunkte
(`pam_results.data_json`, teils gzip-komprimiert). Die Migration übernimmt diese Punkte, macht das
HTML-Escaping der Kopfdaten rückgängig und berechnet alle Kennzahlen mit dem neuen Rechenkern neu.
Datensätze, deren Werte sich dabei ändern (z. B. AIMEX-DX, siehe [Rechenkern](rechenkern.md)),
werden markiert und behalten den alten Wert zur Nachvollziehbarkeit.
