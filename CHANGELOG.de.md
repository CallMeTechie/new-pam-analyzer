# Änderungen

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
