# Handbuch

Der PAM Analyzer wertet PAM-Ergebnisse (`.dat`) von FUJI NXT, NXT-R und AIMEX aus, speichert sie und zeigt sie für jede Firma getrennt an.

## Erste Schritte

1. Beim ersten Start gibt es das Konto `admin@example.com` mit dem Passwort `admin1234`.
2. Bei der ersten Anmeldung wählen Sie eine eigene E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen. Danach gelten die Standard-Zugangsdaten nicht mehr.
3. Unter **Firmen** legen Sie die Kundenfirmen an, unter **Benutzer** die Konten.
4. Unter **Hochladen** laden Sie die ersten PAM-Dateien hoch.

## Rollen

- **Administrator**: gehört zur Service-Firma und verwaltet alle Firmen, Benutzer, API-Keys und Einstellungen.
- **Firmen-Admin**: verwaltet die Benutzer, API-Keys, Maschinen und das Logo seiner Firma.
- **Benutzer**: sieht die Ergebnisse seiner Firma und lädt neue hoch.

Mitglieder der Service-Firma sehen die Ergebnisse aller Firmen.

## Ergebnisse hochladen

- Unter **Hochladen** Dateien, ZIP-Archive oder ganze Ordner auswählen oder in die Fläche ziehen.
- Die Service-Firma wählt vorher die Firma, zu der die Ergebnisse gehören.
- Dateien, die in der Firma schon gespeichert sind, werden erkannt und übersprungen.
- **Prüfdatum**: der Zeitstempel in der Datei (NXT-R), sonst das Änderungsdatum der Datei, sonst das Upload-Datum.

## Ergebnisse finden

- Das **Dashboard** zeigt die neuesten Ergebnisse, die Ergebnisse je Tag und die Verteilung der Bewertungen.
- Unter **Ergebnisse** suchen Sie nach Kopf, Seriennummer, Maschine, Linie oder Dateiname. Mehrere Wörter grenzen weiter ein, z. B. `V12 900026`.
- Filter: Maschinenfamilie, Bewertung, Zeitraum, Sortierung.

## Ergebnis lesen

- **Messuhr**: Cpk XY des ganzen Kopfes mit Bewertung.
- **HEAD**: |Mittelwert| + 3σ, CP und CPK für X und Y.
- **TOTAL**: Mittelwert, 3σ, Maximum und Minimum.
- **CPK-Koeffizient & Bauteile**: die Toleranz ±µm, die für die Berechnung gilt, und die Anzahl gemessener Bauteile. Den Koeffizienten können Sie zum Ausprobieren ändern; gespeichert wird das nicht.
- **Gesamtansicht**: alle Bauteile nach Winkel und nach Holder. Ein Holder in der Legende hebt seine Punkte hervor.
- **Einzelansicht je Holder**: Cpk XY und Bewertung je Holder, sortierbar, auf auffällige Holder filterbar.
- **Drucken**: druckt das Ergebnis auf A4, mit Firmenlogo.
- **Originaldatei**: lädt die hochgeladene `.dat`-Datei herunter.

## Bewertung

Cpk-Werte werden in vier Stufen bewertet: kritisch, Warnung, gut, sehr gut. Die Grenzen stellt ein Administrator unter **Einstellungen → Bewertung** ein; alle Ergebnisse werden danach sofort neu bewertet.

Bewertet wird die Streuung aller Bauteile eines Holders, nicht jedes Bauteil einzeln. Ein einzelner Ausreißer weit außerhalb der Toleranz vergrößert die Streuung (3σ) stark und kann den Cpk eines Holders deutlich senken.

## Kopf-Historie

Ein Klick auf **Kopf-Historie** im Ergebnis zeigt alle Prüfungen desselben Kopfes in der Firma: Cpk XY als Linie über der Zeit und die Liste aller Prüfungen. Ein gefüllter Punkt bedeutet „Datum aus der Datei“, ein hohler „Datum = Upload“.

## Firmen, Team und API-Keys

- **Firmen** (Service-Firma): Firmen anlegen, Logo hochladen, Benutzer, API-Keys und Maschinen verwalten. **Firmenansicht öffnen** zeigt die Firma genau so, wie ihre Mitarbeiter sie sehen.
- **Team & API-Keys** (Firmen-Admin): Mitglieder einladen, API-Keys erstellen, Geräte trennen, Linien der Maschinen eintragen.
- **API-Keys** verbinden die Apps für Windows, Android und iOS. Jedes Mitglied der Firma kann jeden Key der Firma nutzen. Ein Key erlaubt höchstens die eingestellte Anzahl Geräte. Der Key wird nur beim Erstellen angezeigt.

## Einstellungen (Administratoren)

- **Koeffizienten**: Toleranz und erwartete Bauteile je Kopftyp, dazu die DX-Werkzeuge. Jede Änderung wird als neue Version gespeichert; vorhandene Ergebnisse behalten ihre Version.
- **Bewertung**: Grenzen der vier Bewertungsstufen.
- **Sprachen**: Sprachdatei exportieren, übersetzen und wieder importieren. Fehlende Texte erscheinen auf Englisch.
- **Sicherheit & Daten**: Standard für die maximale Anzahl Geräte neuer API-Keys.
- **Version**: installierte Version und Änderungen.

## Betrieb

- Docker-Image: `ghcr.io/callmetechie/new-pam-analyzer:latest`.
- Alle Daten liegen im Ordner `/data` des Containers. Für eine Sicherung den Container anhalten und den Ordner kopieren.
- Hinter einem Reverse Proxy muss `PUBLIC_URL` genau die Adresse sein, die im Browser steht, z. B. `https://pam.example.com`.
