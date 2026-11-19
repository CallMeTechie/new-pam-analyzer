# Web-Oberfläche

React 19 mit Vite, ausgeliefert vom Server als statische Dateien (`apps/web/dist` → `/app/public`
im Docker-Image). Gestaltung nach den freigegebenen Entwürfen: Schrift Geist (lokal eingebunden,
keine externen Quellen), Akzent Blau, vier Bewertungsfarben.

## Ansichten

| Ansicht | Für | Inhalt |
|---|---|---|
| Dashboard | alle | Drei neueste Ergebnisse, Ergebnisse je Tag (mit kritischen), Verteilung der Bewertungen, neueste Ergebnisse je Maschinenfamilie |
| Ergebnisse | alle | Live-Suche über Kopf, Seriennummer, Maschine, Linie und Dateiname; Filter Familie, Bewertung, Zeitraum; Sortierung; Filter bleiben in der Adresse |
| Ergebnis | alle | Messuhr Cpk XY, Boxen HEAD / TOTAL / Koeffizient & Bauteile, Gesamtansicht nach Winkel und Holder, Einzelansicht je Holder; Koeffizient zum Ausprobieren änderbar (wird nicht gespeichert); Originaldatei |
| Kopf-Historie | alle | Linie Cpk XY über dem Prüfdatum, gefüllter Punkt = Datum aus der Datei, hohler Punkt = Upload-Datum; Liste aller Prüfungen |
| Hochladen | alle | Dateien, ZIP-Archive und ganze Ordner per Auswahl oder Ziehen; FUJI Service wählt die Firma |
| Team & API-Keys | Firmen-Admin | Mitglieder einladen und verwalten, API-Keys mit max. Geräten anlegen, Geräte trennen, Linien der Maschinen |
| Firmen | FUJI Service | Firmen anlegen und bearbeiten, Keys, Benutzer, Maschinen; **Firmenansicht öffnen** |
| Benutzer, Einstellungen | Administrator | Alle Konten; Koeffizienten (versioniert), Bewertung, Sprachen, Standard für max. Geräte |

**Firmenansicht:** FUJI Service öffnet unter *Firmen* jede Firma genau so, wie deren Mitarbeiter
sie sehen (`/companies/:id/view/…`). Ein dunkles Band zeigt das an und führt zurück.

## Sprachen

Kataloge in `src/i18n/` (`en.ts` Hauptsprache, `de.ts`). Eine weitere Sprache ist ein weiterer
Katalog plus ein Eintrag in `CATALOGS`; der Typ von `de.ts` verlangt alle Schlüssel, und ein Test
prüft Schlüssel, Platzhalter und Mehrzahlformen. Die Sprache gehört zum Benutzerprofil und gilt
auf allen Geräten. Fehler des Servers kommen als Code und werden über `error.<code>` übersetzt.

## Tests

- `pnpm --filter @pam/web test`: Sprachkataloge und Formatierung.
- `pnpm --filter @pam/web e2e`: Playwright gegen den gebauten Server mit leerer Datenbank:
  erste Anmeldung mit Passwortwechsel, Firma anlegen, Firmenansicht, Mitglied einladen, API-Key,
  Upload, Suche, Detail, Kopf-Historie, Anmeldung als Mitglied, Sprachwechsel.
  Vorher `pnpm build` ausführen.
