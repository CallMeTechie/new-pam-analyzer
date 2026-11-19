# Architektur

## Ziel

- **Server** als eigenständiger Docker-Container: Web-Oberfläche, Firmen mit Benutzern und
  API-Keys, Historie je Kopf, Suche, Upload-API. Details: [Server](server.md).
- **Apps** für Windows, Android und iOS, die PAM-Dateien **eigenständig und offline** auswerten und
  die Daten optional per API-Key zum Server hochladen.
- Alle rechnen mit **demselben Rechenkern** (`packages/core`) und kommen daher zu identischen Ergebnissen.

```
  Windows / Android / iOS (Tauri)                Docker-Container
 ┌──────────────────────────────┐           ┌──────────────────────────┐
 │ UI (aus apps/web)            │           │ Web-UI (apps/web)        │
 │ core  → rechnet offline      │  HTTPS    │ REST-API (Geräte-Token)  │
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
| Server | Node.js mit Hono im Docker-Container | Ein Image, Daten auf Volume `/data` |
| Mandanten | Firmen; Benutzer, API-Keys, Maschinen und Ergebnisse gehören zu einer Firma | FUJI Service sieht alle Firmen, Firmen nur sich selbst |
| Apps | Tauri 2 (Windows fertig, Android und iOS folgen) | Gemeinsame Web-Oberfläche, kleine Installer; mobil notfalls Capacitor. Details: [App](app.md) |
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
- **API-Keys gehören einer Firma.** Der Firmen-Admin (oder FUJI Service) legt sie an und legt fest,
  wie viele Geräte gleichzeitig verbunden sein dürfen. Jeder Benutzer der Firma kann sich mit jedem
  Key der Firma verbinden: Die App meldet sich einmal mit Key, E-Mail und Passwort an und erhält ein
  Geräte-Token. Keys und Tokens werden nur als Hash gespeichert und sind widerrufbar.
- Doppelte Dateien werden je Firma über den SHA-256-Hash des Inhalts erkannt; ein erneuter Upload ist folgenlos.
- Die Apps sammeln Uploads offline in einer Warteschlange.
- Die Apps bringen die Standard-Koeffizienten mit und holen den aktuellen Stand, die Bewertungsgrenzen und die Zeitzone der Maschinen vom Server.
- Jedes Ergebnis speichert die Version der Berechnung (`ALGORITHM_VERSION`) und den verwendeten Koeffizienten.

## Daten aus dem Alt-System

Es werden keine Daten aus dem alten PAM Analyzer übernommen. Die neue Datenbank beginnt leer;
Ergebnisse kommen über Upload in der Web-Oberfläche oder aus den Apps.
