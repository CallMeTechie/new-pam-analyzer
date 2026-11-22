# Änderungen der App

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
