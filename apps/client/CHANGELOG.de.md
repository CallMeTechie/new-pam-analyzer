# Änderungen der App

## 0.4.0

### Neu
- Windows: neues Design – schmale Symbolleiste statt Seitenleiste, indigoblaues Kopfband auf allen Seiten, Schrift DM Sans, hell und dunkel.
- Windows-Übersicht als Dashboard: Messungen der Woche je Tag, Ø-Cpk und kritische Köpfe im Kopfband, Filter nach Familie und „kritisch“, rechts Dateien hinzufügen und Serverstatus, Cpk-Verlauf der Woche, bester Kopf und kritische Köpfe als Karten.
- Absturzberichte: Stürzt die App ab (Windows oder Android), speichert sie einen Bericht und sendet ihn an den Server, sobald sie verbunden ist. Administratoren sehen die Berichte im Web unter Einstellungen → Absturzberichte.
- Android (Google Play): „Jetzt suchen“ prüft, ob Google Play eine neue Version anbietet, und zeigt sie an; „Installieren“ startet das Update über Google Play.
- **Verbinden mit Code statt API-Key:** Unter Einstellungen → Server den QR-Code der Einladung (oder aus „Mein Konto“ im Web) scannen – die App verbindet sich sofort. Alternativ Serveradresse und Code eingeben. E-Mail-Adresse, Passwort und API-Key braucht die App nicht mehr (Server 0.10 oder neuer).
- **Auswertungen: „Dieses Gerät“ / „Server“.** Verbunden zeigt der Umschalter auch die Ergebnisse der ganzen Firma vom Server, mit Angabe, wer sie mit welchem Gerät hochgeladen hat; schreibgeschützt, gruppiert nach Datum oder Kunde.

### Behoben
- Android: Das Kamerasymbol beim API-Key ließ die App abstürzen. Gescannt wird jetzt mit dem QR-Scanner von Google Play-Diensten – eigene Kameraansicht, keine Kamera-Berechtigung nötig. Fehlt das Scanner-Modul noch, lädt die App es über Google Play herunter und startet den Scanner danach. Schlägt der Scanner fehl, zeigt die App den genauen Grund an. In der Play-Version schlug der Scanner fehl, weil die Code-Optimierung (R8) Teile der Google Play-Dienste entfernt hatte.

### Behoben
- Android: Das Kamerasymbol beim API-Key öffnet die Kamera wieder. Die App fragt jetzt zuerst nach der Kamera-Berechtigung; beim Scannen erscheinen ein Rahmen und „Abbrechen“. Wurde der Zugriff verweigert, führt ein Link zu den App-Einstellungen.

## 0.3.5

### Geändert
- Tablets und aufgeklappte Foldables: Ein geöffnetes Ergebnis nutzt die ganze Breite. Ein Tippen auf „Auswertungen“ in der Navigationsleiste schiebt die Liste von links herein; die Auswahl eines Ergebnisses oder ein Tippen daneben schließt sie wieder.

## 0.3.4

### Geändert
- Android: Solange die App in Google Play noch nicht veröffentlicht ist, wird jede neue Version dort als Entwurf angelegt.

## 0.3.3

### Geändert
- Android: Neue Versionen werden automatisch an Google Play übertragen.

## 0.3.2

### Geändert
- Texte sprechen von „diesem Gerät“ statt „diesem PC“ und passen damit auch zu Android.
- Die Übersicht zeigt die Messungen mit Prüfdatum in der laufenden Kalenderwoche, nicht mehr alles, was diese Woche importiert wurde.

### Behoben
- Windows: Der erste Eintrag der Seitenleiste hat wieder Abstand nach oben.

## 0.3.1

### Geändert
- Android: Paketname `com.pamanalyzer.client` (Google Play). Eine bisher aus GitHub installierte APK bleibt als eigene App bestehen und kann deinstalliert werden.

### Behoben
- Auf Foldables und Tablets überlappten sich in der Ergebnisansicht Cpk-Wert und Bewertung.

## 0.3.0

### Neu
- Neue Startseite „Übersicht“: Ein Klick auf die Fläche öffnet die Dateiauswahl; darunter stehen die Ergebnisse der laufenden Kalenderwoche.
- Nach dem Import fragt die App nach Kunde (mit Vorschlägen aus bisherigen Kunden) und Prüfdatum (aus der Datei, heute oder ein anderes Datum). Beides lässt sich im Ergebnis über „Kunde & Datum“ ändern und wird an den Server übertragen.
- Fortschritt beim Import vieler Dateien; nach dem Import ein kurzer Hinweis unten rechts.
- Auswertungen nach Datum, nach Kunde oder als Liste. Ein Kopf mit mehreren Messungen steht nur einmal da und öffnet zuerst seine Kopf-Historie.
- Windows: Bei breitem Fenster gleitet das Ergebnis neben der Liste herein, mit drei Holdern je Zeile.
- Dunkelmodus (Hell, Dunkel oder wie im System).
- Zurück-Knopf auf Ergebnis und Kopf-Historie.
- Neues Logo, gleich für Windows, Installer und Android.

### Geändert
- „Server“ ist jetzt ein Reiter der Einstellungen; ein Klick auf den Verbindungsstatus öffnet ihn.
- Der Knopf „Dateien öffnen“ entfällt; die Seitenleiste zeigt kein zweites Logo mehr.
- Links (z. B. „Made with ♥ by CallMeTechie“) öffnen sich im Standardbrowser.

## 0.2.0

### Neu
- Android-App für Smartphones, Tablets und Foldables, mit derselben Auswertung, Historie, Serververbindung und demselben Ausdruck wie unter Windows.
- Android: Dateien über die Dateiauswahl, „Teilen“ aus anderen Apps und „Öffnen mit“ aus Dateimanagern; ZIP-Archive werden geöffnet.
- Android: Navigation unten auf Handys und zugeklappten Foldables; Liste und Ergebnis nebeneinander auf Tablets und aufgeklappten Foldables; im Tischmodus von Foldables stehen die Diagramme über dem Falz.
- Android: Die Ergebnisseite zeigt Übersicht, Diagramme und Holder als Reiter; Antippen vergrößert einen Holder.
- Android: API-Key und Serveradresse lassen sich als QR-Code aus dem Web scannen.
- Android: Updates kommen über Google Play.

## 0.1.0

### Neu
- Wertet PAM-Dateien von NXT, NXT-R und AIMEX auf diesem PC aus, auch ohne Netz, mit demselben Rechenkern wie der Server.
- Dateien kommen per „Dateien öffnen“, Drag & Drop oder Doppelklick auf eine `.dat`-Datei im Explorer; ZIP-Archive werden geöffnet.
- Lokale Historie mit Suche und Filtern, Ergebnisseite mit Head, Total, Diagrammen, Holdern und Ausdruck wie im Web, Kopf-Historie.
- Verbindung zum Server mit API-Key, E-Mail und Passwort; lädt die Originaldateien hoch, auch offline gesammelt, und übernimmt Koeffizienten und Bewertungsgrenzen des Servers.
- Updates in den Kanälen Stable und Beta.
