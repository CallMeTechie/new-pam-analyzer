# PAM Analyzer (Neuentwicklung)

Neuentwicklung des PAM Analyzers zur Auswertung von PAM-Ergebnissen (`.dat`) der
FUJI-Bestückautomaten NXT, NXT-R (APAM) und AIMEX.

Geplante Bestandteile:

- **Server** als Docker-Container (Web-Oberfläche, Historie, Upload-API mit API-Keys)
- **Apps** für Windows, Android und iOS, die eigenständig auswerten und optional
  zum Server hochladen
- ein gemeinsamer **Rechenkern**, der überall identisch rechnet
