# Referenz aus dem Alt-System

`generate.php` lässt alle Testdateien durch die **unveränderte** Berechnung des alten PAM Analyzers
(`assets/logic/nxt.php` aus `CallMeTechie/PAM-Analyzer`) laufen und schreibt die Ergebnisse nach
`packages/core/test/legacy/`. Sie sind der Abnahmetest für den neuen Rechenkern.

Neu erzeugen (PHP ≥ 8.1, Alt-Repository lokal ausgecheckt):

```bash
php tools/legacy-reference/generate.php ../PAM-Analyzer packages/core/test/fixtures packages/core/test/legacy
```

Erzeugt mit Alt-Repository-Stand `3a844ce`.
