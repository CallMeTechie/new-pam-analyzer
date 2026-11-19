# Änderungen

Alle wichtigen Änderungen am PAM Analyzer. Versionen nach [Semantic Versioning](https://semver.org).

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
