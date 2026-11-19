# Handbuch der Windows-App

Die App wertet PAM-Dateien von NXT, NXT-R und AIMEX direkt auf diesem PC aus, auch ohne Netz. Sie rechnet mit demselben Rechenkern wie der Server und kommt deshalb zu denselben Ergebnissen.

## Dateien auswerten

- **Dateien öffnen**: wählt eine oder mehrere `.dat`-Dateien oder ZIP-Archive.
- **Drag & Drop**: Dateien auf das Fenster ziehen, egal auf welcher Seite.
- **Doppelklick** auf eine `.dat`-Datei im Explorer öffnet sie in der App, auch wenn die App schon läuft.

Jede Datei wird sofort ausgewertet und unter **Auswertungen** gespeichert. Dieselbe Datei wird am Inhalt erkannt und nicht doppelt gespeichert. Nicht lesbare Dateien werden mit Grund gemeldet.

## Auswertungen

Die Liste zeigt alle Ergebnisse auf diesem PC, das neueste Prüfdatum zuerst. Suche nach Kopftyp, Seriennummer, Maschine oder Dateiname; Filter nach Maschinenfamilie und Bewertung.

Die Ergebnisseite ist dieselbe wie im Web: Head, Total, Koeffizient zum Verstellen, Gesamtdiagramme, Einzelansicht je Holder und **Drucken**. **Kopf-Historie** zeigt alle Messungen desselben Kopfes auf diesem PC. **Im Explorer zeigen** öffnet den Ordner der Originaldatei.

## Server

Verbunden lädt die App jede Datei zusätzlich zum Server hoch. Zum Verbinden brauchen Sie:

- die **Serveradresse**, z. B. `https://pam.example.com`,
- einen **API-Key** Ihrer Firma (legt der Firmen-Admin im Web unter „Team & API-Keys“ an),
- Ihre **E-Mail-Adresse** und Ihr **Passwort** aus dem Web.

Das Passwort wird nicht gespeichert, nur ein Geräte-Token in der Windows-Anmeldeinformationsverwaltung. Wer noch das Startpasswort hat, ändert es zuerst im Web.

- Hochgeladen wird immer die **Originaldatei**; der Server rechnet selbst und ist maßgeblich.
- Ist der Server nicht erreichbar, sammelt die App die Dateien in der **Warteschlange** und versucht es jede Minute erneut.
- Beim Verbinden werden auch alle bisher nur lokal ausgewerteten Dateien hochgeladen.
- **Koeffizienten und Bewertungsgrenzen** übernimmt die App vom Server. Ändert der Server sie, bewertet die App alle Ergebnisse auf dem PC neu.
- **Trennen** gibt den Geräteplatz des API-Keys wieder frei. Die Ergebnisse bleiben auf dem PC.

Die Spalte rechts in der Liste zeigt je Ergebnis: **Hochgeladen**, **Warteschlange**, **Nur auf diesem PC** oder **Nicht angenommen** (mit Grund; „Erneut versuchen“ unter Server).

## Einstellungen

- **Allgemein**: Sprache, Update-Kanal, Speicherort der Daten.
- **Koeffizienten** und **Bewertung**: nur zum Ansehen. Verbunden kommen sie vom Server, sonst gelten die Standardwerte.
- **Handbuch** und **Version** (Änderungsliste der App).

## Updates

Die App sucht bei jedem Start nach einer neuen Version und meldet sie mit den Änderungen. **Jetzt aktualisieren** lädt das Update, prüft seine Signatur, installiert es und startet die App neu. Die Daten auf dem PC bleiben erhalten.

- **Stable**: geprüfte Versionen, empfohlen für den Betrieb.
- **Beta**: neue Funktionen früher, dafür weniger getestet; erhält auch jede Stable-Version.

Wer von Beta auf Stable zurückwechselt, behält seine Version, bis eine neuere Stable-Version erscheint.

## Installation

Den Installer gibt es unter den Releases des Projekts auf GitHub (`PAM.Analyzer_<Version>_x64-setup.exe`). Weil er kein gekauftes Code-Signing-Zertifikat hat, warnt Windows SmartScreen beim ersten Start: **Weitere Informationen → Trotzdem ausführen**. Die App wird für den angemeldeten Benutzer installiert; Administratorrechte sind nicht nötig.

Die Daten liegen unter `%APPDATA%\com.callmetechie.pamanalyzer`.
