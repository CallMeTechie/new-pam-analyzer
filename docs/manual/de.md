# Handbuch

Der PAM Analyzer wertet PAM-Ergebnisse (`.dat`) von FUJI NXT, NXT-R und AIMEX aus, speichert sie und zeigt sie für jede Firma getrennt an.

## Erste Schritte

1. Beim ersten Start gibt es das Konto `admin@example.com` mit dem Passwort `admin1234`.
2. Bei der ersten Anmeldung wählen Sie eine eigene E-Mail-Adresse und ein Passwort mit mindestens 12 Zeichen. Danach gelten die Standard-Zugangsdaten nicht mehr.
3. Direkt danach geben Sie der **Service-Firma** ihren Namen (Schritt 2 von 2). Er lässt sich später unter Firmen ändern.
4. Unter **Firmen** legen Sie die Kundenfirmen an, unter **Benutzer** die Konten.
5. Im Upload-Bereich des **Dashboards** laden Sie die ersten PAM-Dateien hoch.

## Rollen

- **Administrator**: gehört zur Service-Firma und verwaltet alle Firmen, Benutzer und Einstellungen.
- **Firmen-Admin**: lädt Mitglieder ein, verwaltet ihre Geräte, die Maschinen und das Logo seiner Firma.
- **Benutzer**: sieht die Ergebnisse seiner Firma und lädt neue hoch.

Mitglieder der Service-Firma sehen die Ergebnisse aller Firmen. Die **Service-Firma** legt der Server beim ersten Start an; ihren Namen vergibt der erste Administrator direkt nach dem Ändern der Standard-Zugangsdaten (Vorschlag: `SERVICE_COMPANY_NAME`, Standard „FUJI Service“). Sie ist unter Firmen mit „Service“ markiert; es gibt genau eine. Jede andere Firma sieht und lädt immer nur ihre eigenen Ergebnisse.

## Ergebnisse hochladen

- Im Upload-Bereich des **Dashboards** Dateien, ZIP-Archive oder ganze Ordner auswählen oder darauf ziehen: Sobald Dateien ins Browserfenster gezogen werden, ist der Bereich als Ablagefläche markiert. Dateien in Unterordnern – von Ordnern wie von ZIP-Archiven – werden mitgenommen; die Liste zeigt den Pfad jeder Datei und wie viele PAM-Dateien jedes ZIP-Archiv enthält. Größe der ZIP-Archive und Zahl der Dateien sind nicht begrenzt: Archive werden im Browser entpackt, die Dateien gehen in Portionen zum Server.
- Der Upload läuft **im Hintergrund**: Sie können weiterarbeiten und die Seite wechseln. Eine Meldung unten rechts zeigt Dateien, MB und Prozent, an ihrem unteren Rand läuft ein grüner Fortschrittsbalken; ✕ bricht ab (bis dahin Hochgeladenes bleibt gespeichert). Den Browser-Tab währenddessen nicht schließen oder neu laden.
- Ist er fertig, zeigt **Details** jede Datei: neu, schon gespeichert, nicht lesbar oder übersprungen.
- Danach öffnet sich ein Dialog: **Firma / Kunde** (beim Tippen werden angelegte Firmen und schon verwendete Kunden vorgeschlagen; eine angelegte Firma bekommt die Ergebnisse, ihre Mitarbeiter sehen sie) und **Prüfdatum** (aus der Datei vorausgefüllt, änderbar; bei mehreren Dateien wahlweise ein Datum für alle). Nichts davon ist Pflicht: **Überspringen** lädt ohne Angaben hoch.
- Dateien, die in der Firma schon gespeichert sind, werden erkannt und übersprungen.
- **Prüfdatum**: der Zeitstempel in der Datei (NXT-R), sonst das Änderungsdatum der Datei (im ZIP: des Eintrags), sonst das Upload-Datum.
- **Kunde & Datum** im Ergebnis ändert Kunde und Prüfdatum nachträglich (Datum aus der Datei, heute oder ein anderer Tag).

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
- **Drucken**: druckt das Ergebnis auf A4. Seite 1 zeigt Kopfdaten, Head, Total und die Gesamtdiagramme, ab Seite 2 folgen die Holder (höchstens 12 je Seite). Das Firmenlogo erscheint, wenn dem Ergebnis eine Firma zugeordnet ist.
- **Originaldatei**: lädt die hochgeladene `.dat`-Datei herunter.

## Bewertung

Cpk-Werte werden in vier Stufen bewertet: kritisch, Warnung, gut, sehr gut. Die Grenzen stellt ein Administrator unter **Einstellungen → Bewertung** ein; alle Ergebnisse werden danach sofort neu bewertet.

Bewertet wird die Streuung aller Bauteile eines Holders, nicht jedes Bauteil einzeln. Ein einzelner Ausreißer weit außerhalb der Toleranz vergrößert die Streuung (3σ) stark und kann den Cpk eines Holders deutlich senken.

## Kopf-Historie

Ein Klick auf **Kopf-Historie** im Ergebnis zeigt alle Prüfungen desselben Kopfes in der Firma: Cpk XY als Linie über der Zeit und die Liste aller Prüfungen. Ein gefüllter Punkt bedeutet „Datum aus der Datei“, ein hohler „Datum = Upload“.

## Firmen, Team und Geräte

- **Firmen** (Service-Firma): Firmen anlegen, Logo hochladen, Benutzer, Geräte und Maschinen verwalten. **Firmenansicht öffnen** zeigt die Firma genau so, wie ihre Mitarbeiter sie sehen.
- **Team** (Firmen-Admin): Mitglieder einladen, Geräte trennen, die Zahl der Geräte je Mitglied festlegen, Linien der Maschinen eintragen.
- **Mitglied einladen:** Name, E-Mail-Adresse und Rolle eingeben. Es entsteht eine **Einladung** mit QR-Code, Link und Code (7 Tage gültig, einmal verwendbar). Mit dem Link legt das Mitglied im Browser sein Passwort fest; mit dem QR-Code verbindet es in der App sein erstes Gerät. Ist ein Mailserver eingerichtet, kann die Einladung direkt per E-Mail verschickt werden. Verloren? **Einladung** in der Mitgliederliste erzeugt eine neue, die alte wird ungültig.
- **Weiteres Gerät verbinden:** jedes Mitglied selbst unter **Mein Konto**. Der angezeigte QR-Code gilt 10 Minuten und nur einmal. Dort sieht man auch seine Geräte und kann sie trennen.

## Einstellungen (Administratoren)

- **Koeffizienten**: Toleranz und erwartete Bauteile je Kopftyp, dazu die DX-Werkzeuge. Jede Änderung wird als neue Version gespeichert; vorhandene Ergebnisse behalten ihre Version.
- **Bewertung**: Grenzen der vier Bewertungsstufen.
- **Sprachen**: Sprachdatei exportieren, übersetzen und wieder importieren. Fehlende Texte erscheinen auf Englisch.
- **E-Mail**: Mailserver (SMTP) für den Versand der Einladungen, mit Test-E-Mail. Was hier eingetragen ist, gilt vor den Umgebungsvariablen `SMTP_*`; das Passwort wird nie wieder angezeigt.
- **Sicherheit & Daten**: Standard für die Zahl der Geräte je Mitglied (eine Firma kann im Team eine eigene Grenze setzen), wie viele Tage Protokolleinträge aufbewahrt werden (Standard 30).
- **Logs & Monitoring**: zum Debuggen des Servers und der Apps. Oben der Zustand: Server und Laufzeit, Speicher, Uploads und Fehler der letzten 24 Stunden, verbundene Apps und ihre Versionen, Mailserver, Dateien, die in den Apps noch warten. Darunter das Protokoll des Servers (unerwartete Fehler, Start, nicht zugestellte E-Mails, gesperrte Konten, wenig Speicher, geänderte Einstellungen, unlesbare Dateien) und der verbundenen Apps (Abstürze, Fehler, Warnungen, in der App gemeldete Probleme) – filterbar nach Quelle, Stufe, Zeitraum, Firma und Text. Ein Eintrag öffnet sich mit Stacktrace, dem Protokoll der App davor und wie oft dieselbe Meldung kam; kopieren, herunterladen, alle des Geräts zeigen, löschen. Export als `.jsonl`.
- **Version**: installierte Version und Änderungen.

## Betrieb

- Docker-Image: `ghcr.io/callmetechie/new-pam-analyzer:latest`.
- Alle Daten liegen im Ordner `/data` des Containers. Für eine Sicherung den Container anhalten und den Ordner kopieren.
- Hinter einem Reverse Proxy muss `PUBLIC_URL` genau die Adresse sein, die im Browser steht, z. B. `https://pam.example.com`.
