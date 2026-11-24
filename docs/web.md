# Web-Oberfläche

React 19 mit Vite, ausgeliefert vom Server als statische Dateien (`apps/web/dist` → `/app/public`
im Docker-Image). Gestaltung nach den freigegebenen Entwürfen: Schrift Geist (lokal eingebunden,
keine externen Quellen), Akzent Blau, vier Bewertungsfarben.

## Ansichten

| Ansicht | Für | Inhalt |
|---|---|---|
| Dashboard | alle | Aktuelle Kalenderwoche, drei neueste Ergebnisse, Verteilung der Bewertungen; **Upload**: Dateien, ZIP-Archive und ganze Ordner per Auswahl oder Ziehen, FUJI Service wählt die Firma |
| Ergebnisse | alle | Live-Suche über Kopf, Seriennummer, Maschine, Linie und Dateiname; Filter Familie, Bewertung, Zeitraum; Sortierung; Filter bleiben in der Adresse |
| Ergebnis | alle | Messuhr Cpk XY, Boxen HEAD / TOTAL / Koeffizient & Bauteile, Gesamtansicht nach Winkel und Holder, Einzelansicht je Holder; Koeffizient zum Ausprobieren änderbar (wird nicht gespeichert); Originaldatei |
| Kopf-Historie | alle | Linie Cpk XY über dem Prüfdatum, gefüllter Punkt = Datum aus der Datei, hohler Punkt = Upload-Datum; Liste aller Prüfungen |
| Team | Firmen-Admin | Mitglieder einladen (QR-Code, Link, optional E-Mail), Geräte trennen, Geräte je Mitglied, Linien der Maschinen |
| Firmen | FUJI Service | Firmen anlegen und bearbeiten, Keys, Benutzer, Maschinen; **Firmenansicht öffnen** |
| Benutzer, Einstellungen | Administrator | Alle Konten; Koeffizienten (versioniert), Bewertung, Sprachen, E-Mail (SMTP mit Test-E-Mail), Standard für max. Geräte und Aufbewahrung der Logs; **Logs & Monitoring** (Zustand von Server und Apps, Protokoll mit Filtern, Details und Export) |

**Upload im Hintergrund:** Der Browser entpackt ZIP-Archive selbst (`lib/zip.ts`: nur das
Inhaltsverzeichnis und je ein Eintrag im Speicher, ZIP64, ohne Größengrenze) und schickt die `.dat`-Dateien
in Portionen (höchstens 300 Dateien bzw. 40 MB, unter `MAX_UPLOAD_MB`) an `POST /api/uploads`
(`lib/uploadQueue.ts`); Netzfehler werden bis zu dreimal wiederholt. Der Zustand liegt außerhalb der
Seiten (`lib/backgroundUpload.ts`), deshalb läuft der Upload beim Seitenwechsel weiter; `UploadToast`
zeigt Fortschritt, Abbrechen und am Ende die Details. Beim Schließen des Tabs warnt der Browser.

**Firmenansicht:** FUJI Service öffnet unter *Firmen* jede Firma genau so, wie deren Mitarbeiter
sie sehen (`/companies/:id/view/…`). Ein dunkles Band zeigt das an und führt zurück.

## Bedienung

- Erklärungen stehen hinter (i)-Symbolen und erscheinen beim Zeigen oder Antippen.
- Der Footer bleibt beim Scrollen sichtbar.
- **Drucken** im Ergebnis druckt auf A4: Kopf mit Firmenlogo, Messuhr, HEAD/TOTAL, Koeffizient,
  Gesamtansicht und Holder.

## Handbuch und Änderungen

- Das Handbuch steht in `docs/manual/de.md` und `docs/manual/en.md` und erscheint in der
  Oberfläche unter **Einstellungen → Handbuch**. Jede Änderung an Funktionen aktualisiert es mit.
- Die Änderungen jeder Version stehen in `CHANGELOG.md` und `CHANGELOG.de.md` und erscheinen
  unter **Einstellungen → Version**. Die Versionsnummer steht in den `package.json`-Dateien.

## Sprachen

Kataloge in `src/i18n/` (`en.ts` Hauptsprache, `de.ts`). Weitere Sprachen importiert ein
Administrator ohne Programmierung unter **Einstellungen → Sprachen**: englische Vorlage
exportieren, übersetzen, als JSON (`code`, `name`, `messages`) importieren. Die Oberfläche prüft
Platzhalter vor dem Import; fehlende Texte erscheinen auf Englisch. Eine Sprache fest einbauen:
weiterer Katalog plus Eintrag in `CATALOGS`; der Typ von `de.ts` verlangt alle Schlüssel, und ein Test
prüft Schlüssel, Platzhalter und Mehrzahlformen. Die Sprache gehört zum Benutzerprofil und gilt
auf allen Geräten. Fehler des Servers kommen als Code und werden über `error.<code>` übersetzt.

## Tests

- `pnpm --filter @pam/web test`: Sprachkataloge und Formatierung.
- `pnpm --filter @pam/web e2e`: Playwright gegen den gebauten Server mit leerer Datenbank:
  erste Anmeldung mit Passwortwechsel, Firma anlegen, Firmenansicht, Mitglied einladen (QR-Code,
  Link), Geräte je Mitglied, Upload, Suche, Detail, Kopf-Historie, Einladungslink mit Passwort,
  Anmeldung als Mitglied, Code für ein weiteres Gerät, Sprachwechsel.
  Vorher `pnpm build` ausführen.
