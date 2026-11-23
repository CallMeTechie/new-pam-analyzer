# Architektur

## Ziel

- **Server** als eigenständiger Docker-Container: Web-Oberfläche, Firmen mit Benutzern und
  Einladungen und Geräte, Historie je Kopf, Suche, Upload-API. Details: [Server](server.md).
- **Apps** für Windows, Android und iOS, die PAM-Dateien **eigenständig und offline** auswerten und
  die Daten optional zum Server hochladen (verbunden per Einladungs- oder Gerätecode).
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
| Mandanten | Firmen; Benutzer, Geräte, Maschinen und Ergebnisse gehören zu einer Firma | FUJI Service sieht alle Firmen, Firmen nur sich selbst |
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
- **Geräte gehören einem Benutzer.** Die App verbindet sich einmal mit einem kurzlebigen Einmal-Code
  (aus der Einladung oder aus „Mein Konto“) und erhält ein Geräte-Token; ein API-Key oder Passwort ist
  in der App nicht nötig. Wie viele Geräte ein Benutzer gleichzeitig verbinden darf, legt die Firma
  fest. Codes und Tokens werden nur als Hash gespeichert; Trennen oder Deaktivieren beendet die
  Verbindung.
- Doppelte Dateien werden je Firma über den SHA-256-Hash des Inhalts erkannt; ein erneuter Upload ist folgenlos.
- Die Apps sammeln Uploads offline in einer Warteschlange.
- Die Apps bringen die Standard-Koeffizienten mit und holen den aktuellen Stand, die Bewertungsgrenzen und die Zeitzone der Maschinen vom Server.
- Jedes Ergebnis speichert die Version der Berechnung (`ALGORITHM_VERSION`) und den verwendeten Koeffizienten.

## Daten aus dem Alt-System

Es werden keine Daten aus dem alten PAM Analyzer übernommen. Die neue Datenbank beginnt leer;
Ergebnisse kommen über Upload in der Web-Oberfläche oder aus den Apps.
