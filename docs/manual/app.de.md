# Handbuch der App

Die App wertet PAM-Dateien von NXT, NXT-R und AIMEX direkt auf diesem PC aus, auch ohne Netz. Sie rechnet mit demselben Rechenkern wie der Server und kommt deshalb zu denselben Ergebnissen.

## Übersicht

Die Startseite. Unter Windows führt die schmale Symbolleiste links zu Übersicht, Auswertungen und Einstellungen; der Punkt unten zeigt den Verbindungsstatus. Das Kopfband zeigt die Messungen der laufenden Woche je Tag, den Ø-Cpk und die Zahl kritischer Köpfe; mit den Filtern (NXT, NXT-R, AIMEX, kritisch) lässt sich die Liste eingrenzen. Rechts stehen die Fläche zum Hinzufügen von Dateien und der Serverstatus, darunter der Cpk-Verlauf der Woche, der beste Kopf und die Zahl der kritischen Köpfe. Ein Klick auf die Fläche **PAM-Dateien hierher ziehen oder klicken zum Auswählen** öffnet die Dateiauswahl (eine oder mehrere `.dat`-Dateien oder ZIP-Archive). Weitere Wege:

- **Drag & Drop**: Dateien auf das Fenster ziehen, egal auf welcher Seite.
- **Doppelklick** auf eine `.dat`-Datei im Explorer öffnet sie in der App, auch wenn die App schon läuft.

Bei mehreren Dateien zeigt die Fläche den Fortschritt („12 von 40“). Danach meldet ein kurzer Hinweis unten rechts, wie viele Ergebnisse neu sind, welche Dateien schon da waren und welche nicht lesbar sind; er verschwindet nach einigen Sekunden von selbst. Dieselbe Datei wird am Inhalt erkannt und nicht doppelt gespeichert.

Unter der Fläche stehen nur die Messungen mit Prüfdatum in der **laufenden Kalenderwoche**. Ältere finden Sie unter **Auswertungen**.

### Kunde und Prüfdatum

Nach dem Import fragt die App einmal für alle neuen Ergebnisse:

- **Kunde**: Die App schlägt beim Tippen bisher verwendete Kunden vor (von diesem Gerät und, wenn verbunden, vom Server). Ein neuer Kunde wird einfach eingetippt.
- **Prüfdatum**: das Datum aus der Datei übernehmen (Standard), das heutige Datum oder ein anderes Datum.

**Überspringen** lässt beides offen. Kunde und Datum lassen sich später im Ergebnis über **Kunde & Datum** ändern; verbunden werden die Änderungen auch an den Server übertragen.

## Auswertungen

Alle Ergebnisse auf diesem Gerät, umschaltbar:

- **Nach Datum**: je Prüftag eine Gruppe, der neueste Tag oben.
- **Nach Kunde**: je Kunde eine Gruppe, sortiert nach der letzten Messung; Ergebnisse ohne Kunde stehen am Ende unter „Ohne Kunde“.
- **Liste**: alle Köpfe ohne Gruppen.

Hat ein Kopf mehrere Messungen, steht er nur einmal da, mit der Anzahl („3 Messungen“). Ein Klick darauf öffnet zuerst die **Kopf-Historie** mit der neuesten Messung oben; von dort geht es zum einzelnen Ergebnis. Die Suche findet Kopftyp, Seriennummer, Maschine, Kunde und Dateiname; Filter nach Maschinenfamilie und Bewertung.

Die Ergebnisseite ist dieselbe wie im Web: Head, Total, Koeffizient zum Verstellen, Gesamtdiagramme, Einzelansicht je Holder und **Drucken**. **Zurück** führt zur vorherigen Seite. **Im Explorer zeigen** öffnet den Ordner der Originaldatei.

Bei einem breiten, z. B. maximierten Fenster gleitet das Ergebnis von rechts herein und belegt höchstens die halbe Breite; die Liste bleibt daneben bedienbar. Die Holder stehen dann zu dritt nebeneinander. **✕** schließt das Ergebnis, **⤢** zeigt es als ganze Seite. Bei einem schmalen Fenster öffnet sich das Ergebnis als eigene Seite.

## Server

Techniker und Kunden können die App mit einem **FUJI PAM Server** verbinden. Die App lädt dann jede Datei zusätzlich zum Server hoch, wo die Ergebnisse auch im Web zur Verfügung stehen. Kunden können außerdem einen **eigenen Server** erwerben und die Ergebnisse in ihre eigene Umgebung hochladen.

Für den Zugang wenden Sie sich bitte an Ihren **FUJI-Servicerepräsentanten** oder den Admin Ihrer Firma: Sie erhalten eine **Einladung** mit QR-Code. Verbunden wird in den **Einstellungen** unter **Server**: **QR-Code scannen** – oder Serveradresse und Code von Hand eingeben. Für ein weiteres Gerät erzeugen Sie den Code selbst im Web unter **Mein Konto → Weiteres Gerät verbinden**. Ein API-Key oder Passwort wird in der App nicht gebraucht.

Gespeichert wird nur ein Geräte-Token in der Windows-Anmeldeinformationsverwaltung bzw. im geschützten Speicher von Android.

- Hochgeladen wird immer die **Originaldatei**; der Server rechnet selbst und ist maßgeblich.
- Ist der Server nicht erreichbar, sammelt die App die Dateien in der **Warteschlange** und versucht es jede Minute erneut.
- Beim Verbinden werden auch alle bisher nur lokal ausgewerteten Dateien hochgeladen.
- **Koeffizienten und Bewertungsgrenzen** übernimmt die App vom Server. Ändert der Server sie, bewertet die App alle Ergebnisse auf dem Gerät neu.
- **Trennen** gibt den Geräteplatz Ihres Kontos wieder frei. Die Ergebnisse bleiben auf dem Gerät.
- **Auswertungen → Dieses Gerät / Server:** Verbunden zeigt der Umschalter auch die Ergebnisse der ganzen Firma vom Server (alle Geräte und Web-Uploads, mit Angabe, wer sie hochgeladen hat). Sie sind schreibgeschützt; offline sind nur die Ergebnisse des Geräts verfügbar.

Jedes Ergebnis zeigt seinen Stand: **Hochgeladen**, **Warteschlange**, **Nur auf diesem Gerät** oder **Nicht angenommen** (mit Grund; „Erneut versuchen“ unter Einstellungen → Server). Ein Klick auf den Verbindungsstatus unten links öffnet diese Seite.

## Einstellungen

- **Allgemein**: Sprache, Darstellung (Hell, Dunkel oder wie im System), Update-Kanal, Speicherort der Daten.
- **Server**: verbinden, Warteschlange, trennen.
- **Koeffizienten** und **Bewertung**: nur zum Ansehen. Verbunden kommen sie vom Server, sonst gelten die Standardwerte.
- **Handbuch** und **Version** (Änderungsliste der App).

## Updates (Windows)

Die App sucht bei jedem Start nach einer neuen Version und meldet sie mit den Änderungen. **Jetzt aktualisieren** lädt das Update, prüft seine Signatur, installiert es und startet die App neu. Die Daten auf dem PC bleiben erhalten.

- **Stable**: geprüfte Versionen, empfohlen für den Betrieb.
- **Beta**: neue Funktionen früher, dafür weniger getestet; erhält auch jede Stable-Version.

Wer von Beta auf Stable zurückwechselt, behält seine Version, bis eine neuere Stable-Version erscheint.

## Android

Die App läuft auf Smartphones, Tablets und Foldables und kann dasselbe wie unter Windows.

- **Dateien:** durch Antippen der Fläche in der Übersicht (Android-Dateiauswahl, auch USB-Stick und Cloud-Apps), über
  **Teilen → PAM Analyzer** in einer anderen App (Dateimanager, E-Mail, Teams …) oder durch
  Antippen einer `.dat` im Dateimanager („Öffnen mit PAM Analyzer“).
- **Handy:** Navigation unten. Das Ergebnis zeigt die Reiter Übersicht, Diagramme und Holder;
  ein Holder lässt sich durch Antippen vergrößern.
- **Tablet und aufgeklapptes Foldable:** Navigation links. Ein Ergebnis nutzt die ganze Breite; ein Tippen auf „Auswertungen“ schiebt die Liste von links herein, die Auswahl eines anderen Ergebnisses oder ein Tippen daneben schließt sie wieder.
- **Foldable halb aufgeklappt (Tischmodus):** Diagramme oben, Bedienung unten.
- **Drucken:** öffnet den Android-Druckdialog; dort auch **Als PDF speichern**.
- **Server verbinden:** unter Einstellungen → Server auf **QR-Code scannen** tippen und den QR-Code
  der Einladung (oder aus „Mein Konto“ im Web) scannen. Der Scanner kommt von den Google Play-Diensten
  und braucht keine Kamera-Berechtigung der App.
- **Updates:** installiert Google Play automatisch.

### Installation (Google Play)

Die App wird über den **Google Play Store** installiert. Zurzeit befindet sie sich in einem **geschlossenen Test**. Um sie laden zu können:

1. Wenden Sie sich an Ihren **FUJI-Servicerepräsentanten** und bitten Sie um Aufnahme ins Testprogramm.
2. Geben Sie dabei die **E-Mail-Adresse des Google-Kontos** an, das auf dem Smartphone oder Tablet mit dem Play Store verbunden ist, auf dem Sie die App nutzen möchten.
3. Nach der Freischaltung erhalten Sie einen Link zur App im Play Store; dort **Installieren** antippen.

## Installation (Windows)

Den Installer (`PAM Analyzer_<Version>_x64-setup.exe`) erhalten Sie von Ihrem **FUJI-Servicerepräsentanten**. Starten Sie ihn und folgen Sie den Schritten. Die App wird für den angemeldeten Benutzer installiert; Administratorrechte sind nicht nötig. Neue Versionen installiert die App danach selbst (siehe Updates).

Die Daten liegen unter `%APPDATA%\com.callmetechie.pamanalyzer`.
