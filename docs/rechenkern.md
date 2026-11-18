# Rechenkern und Dateiformat

Der Rechenkern (`packages/core`) ersetzt `assets/logic/nxt.php` des alten PAM Analyzers. Er ist
gegen das Alt-System abgesichert: Für alle 89 Testdateien liefert er **bitgenau dieselben
Kennzahlen** (Ausnahme: die unten dokumentierten Korrekturen).

## Dateiformat

### Kopfzeile (tabulatorgetrennt, leere Felder sind möglich)

| Feld | NXT (`M6`, 18 Felder) | AIMEX (17 Felder) | NXT-R (13 Felder) |
|---|---|---|---|
| 0 | `M6` | `AIMEX` | `NXTR` |
| 1 | Maschine, z. B. `M6IIIXNo9001` | Maschine, z. B. `AIMEX2s-SA-XNo900013` | Maschine, z. B. `NXTR-1R-Xno9000001` |
| 2 | Kopftyp (`V12`, `H08M`, `DX` …) | Kopftyp | Kopftyp (`RH02` … `RH28`) |
| 3 | Kopf-Seriennummer | Kopf-Seriennummer | Kopf-Seriennummer |
| 5 | leer | `SingleRobot` / `DoubleRobot` | leer |
| 14 | DX: Werkzeugtyp (`R12`, `R4`) | DX: Werkzeugtyp | – |
| 15 | DX: Werkzeug-Seriennummer | DX: Werkzeug-Seriennummer (`000000` = keine) | – |
| letztes | – | – | Prüfzeitpunkt `YYYYMMDDhhmmss` |

### Datenzeilen (eine Zeile je Bauteil)

| Spalte | Inhalt |
|---|---|
| 0 | laufende Nummer |
| 1 | Schaft, 0-basiert (wird zu Holder A, B, …) |
| 2 | unbekannt (NXT/AIMEX meist `0`, NXT-R `1`) |
| 3 | Winkel: 0, 90, 180 oder 270 |
| 4, 5, 6 | Versatz X [µm], Y [µm], Q [°] |
| 7 – 11 | nur NXT-R, Bedeutung unbekannt |

Zeilen mit nur 4 Spalten enthalten **keine Messwerte** (Bauteil nicht vermessen). Sie werden als
`missing_measurement` gemeldet.

## Berechnung

Für den ganzen Kopf und für jeden Schaft getrennt, jeweils für X und Y:

- Mittelwert µ, Standardabweichung σ der Stichprobe (n − 1), 3σ
- Toleranz symmetrisch ±k (k = Cpk-Koeffizient in µm)
- Cp = 2k / (2 · 3σ), Cpk = min(k − µ, µ + k) / 3σ
- Cpk XY = kleinerer Wert aus Cpk X und Cpk Y
- Für Q nur µ und 3σ

Ist 3σ = 0, sind Cp und Cpk `null` (Alt-System: Text `'N/A'`).

**Koeffizient k**, in dieser Reihenfolge: manuell gesetzt → Kopftyp → bei DX das Werkzeug
(R12/R4/S1) → generischer Eintrag nach Schaftzahl (`12-HEAD` …) → Standardwert 50.

**Schaftanzahl**: erste Zahl im Kopftyp, bei DX im Werkzeugtyp. Bei genau einem Schaft werden alle
Messungen Holder A zugeordnet.

**Prüfdatum**, in dieser Reihenfolge: Zeitstempel in der Kopfzeile (nur NXT-R) → Änderungsdatum der
Originaldatei → Datum im Dateinamen → unbekannt.

## Abweichungen vom Alt-System

| Thema | Alt-System | Neu |
|---|---|---|
| **AIMEX-DX: Werkzeug und Koeffizient** | Kopfzeile wurde an Leerraum getrennt, leere Felder gingen verloren. Bei AIMEX las das System an Position 12/13 falsche Werte als Werkzeug (`0`/`1`) und rechnete mit dem Standardkoeffizienten 50. **Cpk-Werte waren dadurch 25–50 % zu hoch.** | Tab-getrennt, Werkzeug aus Feld 14/15; Koeffizient R12 = 38, R4 = 40, S1 = 30 |
| DX ohne Werkzeugangabe | Werkzeug `1`, Koeffizient 50 | Liegen alle Messungen auf einem Schaft, wird S1 abgeleitet (mit Warnung) |
| Prüfdatum ohne Quelle | Zeitstempel der hochgeladenen Temp-Datei, also faktisch der Upload-Zeitpunkt | `null` mit `dateSource: 'unknown'`; der Server entscheidet über einen Ersatzwert |
| Ungültige Zeilen | stillschweigend verworfen | in `invalidLines` mit Zeilennummer und Grund |
| Leerzeilen | eine Leerzeile führte dazu, dass die folgende Messzeile verloren ging | werden übersprungen |
| Kopfdaten | vor dem Speichern HTML-escaped | unverändert; Escaping erst bei der Ausgabe |
| Diagrammfarben und -symbole | Teil des Berechnungsergebnisses und in der Datenbank gespeichert | Sache der Oberfläche |

Beispiel AIMEX-DX aus den Testdaten:

| Datei | Alt: k | Alt: Cpk X / Y | Neu: k | Neu: Cpk X / Y |
|---|---|---|---|---|
| DX-R12 | 50 | 3,18 / 2,57 | 38 | 2,41 / 1,93 |
| DX-R4 | 50 | 3,00 / 2,63 | 40 | 2,40 / 2,04 |
| DX (S1) | 50 | 4,59 / 3,74 | 30 | 2,64 / 2,24 |

## Fachlich bestätigt

- DX-Koeffizienten: R12 = 38, R4 = 40, S1 = 30.
- DX ohne Werkzeugangabe in der Kopfzeile und nur ein Schaft in den Daten ⇒ S1-Werkzeug.
- H08M kann Glas- oder Keramik-Bauteile verwenden; mit Keramik werden mehr Bauteile bestückt
  (Keramik 256, Glas 128).

## Offene fachliche Fragen

- Bedeutung von Datenspalte 2 und der NXT-R-Zusatzspalten 7 – 11.
- H08M mit Glas: Die Dateien haben 136 Datenzeilen; die Zeilen 65 – 72 (je Schaft eine, Winkel 0)
  sind in allen Testdateien leer. Sind das Platzhalter-Positionen ohne Bauteil?

## Absicherung

- `packages/core/test/legacy.test.ts` vergleicht jede Testdatei mit dem Ergebnis des Alt-Systems
  (`packages/core/test/legacy/*.json`, erzeugt mit `tools/legacy-reference/generate.php`).
- Die Referenz des Alt-Systems wurde vorab gegen 20 PDF-Ausdrucke aus dem Produktivsystem geprüft:
  Gesamt-Cpk und alle Holder-Cpk stimmten überein.
- `packages/core/test/parse.test.ts` deckt Grenzfälle ab (Datum, ungültige Zeilen, CRLF, Fortsetzungszeilen, DX).
