# Änderungen

## 0.11.1 – 24.11.2026

### Geändert
- Drag & Drop: Sobald Dateien ins Browserfenster gezogen werden, ist der Upload-Bereich als Ablagefläche markiert (gestrichelter Rahmen in Akzentfarbe, „Dateien hier ablegen“). Er nimmt Dateien, ZIP-Archive und Ordner an, auch Dateien in Unterordnern; eine daneben abgelegte Datei öffnet der Browser nicht mehr.
- **Upload-Dialog statt Kasten „Dateien bereit“:** Direkt nach dem Auswählen oder Ablegen fragt ein Dialog nach
  - **Firma / Kunde** in einem Feld: Beim Tippen werden die Firmen im System und die schon verwendeten Kunden gesucht; eine Firma im System bekommt die Ergebnisse (ihre Mitarbeiter sehen sie), jeder andere Name wird als Kunde gespeichert. Die Firmenauswahl über der Ablagefläche entfällt.
  - **Prüfdatum:** bei einer Datei Datum und Uhrzeit der Messung aus der Datei, vorausgefüllt und änderbar; bei mehreren behält jede ihr eigenes Datum (Zeitraum wird angezeigt) oder ein Datum für alle (die Uhrzeit bleibt die aus der Datei).
  - Nichts ist Pflicht: **Überspringen** lädt ohne Angaben hoch. „Liste anzeigen“ zeigt die Dateien mit Pfad und die PAM-Dateien je ZIP-Archiv.
- Uploads nehmen `testDay` je Datei an (`YYYY-MM-DD`: nur der Tag wird gesetzt, die Uhrzeit bleibt die aus der Datei).

## 0.11.0 – 23.11.2026

### Geändert
- **Upload im Hintergrund, in jeder Größe.** Der Upload läuft im Hintergrund: Man kann weiterarbeiten und die Seite wechseln; eine Meldung zeigt Dateien, MB und Prozent, am unteren Rand läuft ein Fortschrittsbalken, und der Upload lässt sich abbrechen. ZIP-Archive jeder Größe (auch ZIP64) und beliebig viele Dateien: Der Browser entpackt die Archive Eintrag für Eintrag und schickt die Dateien in Portionen; scheitert eine Portion am Netz, wird sie erneut gesendet. Das Ergebnis öffnet sich aus der Meldung („Details“).
- Die eigene Upload-Seite entfällt; hochgeladen wird in der Ablagefläche des Dashboards (`/upload` führt dorthin).
- Der Mailserver für Einladungen wird unter **Einstellungen → E-Mail** eingerichtet (mit Test-E-Mail); er gilt vor den Umgebungsvariablen `SMTP_*`.
- Die Service-Firma ist unter Firmen mit „Service“ markiert, mit Erklärung, was sie sieht.
- Zahlen in Texten erscheinen im Format der Sprache (9.677 / 9,677).

### Neu
- **Service-Firma benennen** ist der zweite Schritt einer neuen Installation, direkt nach dem Ändern der Standard-Zugangsdaten (`POST /api/auth/service-company`); `SERVICE_COMPANY_NAME` ist nur noch der Vorschlag. Bestehende Installationen behalten ihren Namen.
- **Kunde & Datum** im Web: Kunde und Prüfdatum eines Ergebnisses nachträglich ändern.
- `GET/PUT /api/settings/mail`, `POST /api/settings/mail/test`; `GET /api/version` nennt die Upload-Grenzen; Uploads nehmen `modifiedLocal` an (Datum eines ZIP-Eintrags, Ortszeit der Maschinen).

## 0.10.0 – 23.11.2026

### Geändert
- **Einladungen statt API-Keys.** Beim Einladen eines Mitglieds entsteht eine Einladung mit QR-Code, Link und Code (7 Tage gültig, einmal verwendbar): Mit dem Link legt das Mitglied im Browser sein Passwort fest, mit dem QR-Code verbindet es in der App sein erstes Gerät. Verlorene Einladungen werden einfach ersetzt. Mit einem Mailserver (`SMTP_HOST`, optional) kann die Einladung per E-Mail verschickt werden.
- **Weiteres Gerät verbinden:** Jeder Benutzer erzeugt unter „Mein Konto“ einen QR-Code (10 Minuten gültig, einmal verwendbar) und sieht und trennt dort seine Geräte.
- Die Zahl der Geräte ist je Benutzer begrenzt (Standard unter Einstellungen → Sicherheit, je Firma unter Team → Geräte) statt je API-Key.
- API-Keys sind entfernt (Web, API und Datenbank). Bereits verbundene Geräte laufen mit ihrem Token weiter.
- Ergebnislisten enthalten, wer ein Ergebnis mit welchem Gerät hochgeladen hat (für die Server-Ansicht der Apps).

### Behoben
- Datenbank-Migrationen, die eine Tabelle neu aufbauen, löschen nicht mehr die Verweise anderer Tabellen darauf.

## 0.9.0 – 23.11.2026

### Neu
- Absturzberichte der Apps: Verbundene Apps senden sie (`POST /api/app/crash-reports`); Administratoren sehen, kopieren und löschen sie unter Einstellungen → Absturzberichte (`GET`/`DELETE /api/crash-reports`).

## 0.8.0 – 23.11.2026

### Geändert
- Das Dashboard zeigt wie die App die aktuelle Kalenderwoche (Montag bis Sonntag): Ergebnisse je Wochentag, kritische Ergebnisse und Bewertungen der Woche.
- Die Karten über der Tabelle sind die drei zuletzt hochgeladenen Ergebnisse; die Tabelle darunter zeigt die Ergebnisse dieser und der letzten Kalenderwoche.
- Ergebnisse lassen sich nach Prüfdatum oder Kunde gruppieren oder als Liste zeigen; die Sortierung gilt innerhalb jeder Gruppe. Die Wahl wird gemerkt.

### Neu
- `GET /api/dashboard` nimmt einen festen Zeitraum (`from`, `to`), `GET /api/results` nimmt `group=date|customer`.

## 0.7.0 – 23.11.2026

### Geändert
- Neues Design der Weboberfläche (wie die Windows-App): schmale Symbolleiste statt Seitenleiste (auf dem Handy weiter das ausklappbare Menü mit Beschriftung), indigoblaues Kopfband auf allen Seiten, Schrift DM Sans.
- Dashboard: Zeitraum, Ergebnisse je Tag und Summe kritischer Ergebnisse im Kopfband; rechts Hochladen und Bewertungen; neueste Ergebnisse als Pastellkarten.

## 0.6.0 – 21.11.2026

### Neu
- Ergebnisse haben einen Kunden. Er wird beim Upload je Datei mitgegeben (`customer`) oder später gesetzt; die Suche findet ihn.
- Das Prüfdatum kann von Hand angegeben werden (`testDate` beim Upload, Quelle „von Hand gesetzt“).
- `GET /api/results/customers` liefert die bisher verwendeten Kunden für die Autovervollständigung der Apps.
- `PATCH /api/results/:id` ändert Kunde und Prüfdatum.
- Neues Logo, gleich in Web, Windows und Android.

### Geändert
- „Made with ♥ by CallMeTechie“ verweist auf LinkedIn.

## 0.5.0 – 19.11.2026

### Neu
- Ein neuer API-Key wird zusätzlich als QR-Code mit der Serveradresse gezeigt, zum Scannen mit der Android-App.

### Geändert
- Die Ergebnisseite kann ihre Bereiche als Reiter zeigen und Holder vergrößern (für die Android-App).

## 0.4.0 – 19.11.2026

### Neu
- Windows-App (eigene Versionen, siehe Änderungen der App): wertet PAM-Dateien offline aus und lädt sie verbunden hoch.

### Geändert
- `GET /api/app/config` und `POST /api/app/connect` liefern zusätzlich die Zeitzone der Maschinen, damit die App dasselbe Prüfdatum ermittelt wie der Server.
- Die Web-Seiten „Ergebnis“ und „Kopf-Historie“ werden von der App mitbenutzt.

## 0.3.0 – 19.11.2026

### Neu
- Die Maschinennummer wird in Modultyp und Seriennummer zerlegt: „M6IIIXNo2149“ erscheint als „M6III · S/N 2149“, „NXTR-1R-Xno0000184“ als „NXTR-1R · S/N 0000184“.

### Geändert
- Druckansicht überarbeitet: Seite 1 zeigt Kopfdaten, Head, Total und beide Gesamtdiagramme, ab Seite 2 folgen die Holder mit höchstens 12 je Seite.
- Im Ausdruck stehen Koeffizient und Bauteile bei den Kopfdaten; die Kästen „CPK-Koeffizient & Bauteile“ und „Hinweis zur Datei“, die Kopfzeile und die Zeile zur Gesamtansicht entfallen.
- Druckdatum, Rechenkern, Bewertungsgrenzen und Seitenzahl stehen in der Fußzeile jeder Seite.
- Ist dem Ergebnis keine Firma zugeordnet, zeigt der Ausdruck weder Firma noch Logo.
- Das Docker-Image wird zusätzlich mit der Versionsnummer veröffentlicht (z. B. `0.3.0`), und jede Version erhält einen Git-Tag.

## 0.2.0 – 19.11.2026

### Neu
- Druckansicht für PAM-Ergebnisse (A4, mit Firmenlogo).
- Firmenlogo (PNG, JPEG oder WebP) für jede Firma.
- Bewertungsgrenzen sind in den Einstellungen änderbar; alle Ergebnisse werden sofort neu bewertet.
- Sprachen: Sprachdatei exportieren und neue oder verbesserte importieren.
- Einstellungen: neue Reiter „Handbuch“ und „Version“ mit dieser Änderungsliste.
- Administratoren können Benutzer in eine andere Firma verschieben; der Benutzerdialog zeigt die Firma.

### Geändert
- Das Docker-Image richtet den Datenordner selbst ein; auf einem NAS sind keine Rechte mehr von Hand nötig.
- Verständliche Fehlermeldung, wenn die Datenbank nicht geöffnet werden kann.
- Der Footer bleibt sichtbar; „Made with ♥ by CallMeTechie“.
- Erklärungen stehen hinter (i)-Symbolen.
- Kompakte Koeffizienten-Einstellungen in einer Tabelle je Kopftyp.
- Lange Firmennamen werden vollständig angezeigt.
- Texte nennen keine feste Service-Firma mehr.

### Entfernt
- Die Sammeleinträge `1-HEAD` … `12-HEAD` bei den Koeffizienten. H12, H12S, H01V und RH01 haben eigene Einträge mit denselben Werten erhalten.

## 0.1.0 – 19.11.2026

### Neu
- Rechenkern für NXT, NXT-R und AIMEX, abgeglichen mit dem alten PAM Analyzer.
- Server mit Firmen, Rollen, API-Keys mit Gerätegrenze, Upload, Suche und Kopf-Historie.
- Web-Oberfläche auf Englisch und Deutsch.
- Docker-Image auf ghcr.io (amd64 und arm64).
- Standard-Administrator `admin@example.com` / `admin1234`; E-Mail-Adresse und Passwort müssen bei der ersten Anmeldung geändert werden.
