# Server

REST-API, Datenhaltung und Auslieferung der Web-Oberfläche ([Web-Oberfläche](web.md)). Node.js 22, Hono, SQLite
über Drizzle ORM. Alle Daten liegen in einer Datei auf dem Volume `/data`.

## Betrieb

Fertiges Image (amd64 und arm64), gebaut bei jedem Merge auf `main`:

```bash
docker pull ghcr.io/callmetechie/new-pam-analyzer:latest
```

Tags: `latest` (Stand von `main`), die Version aus `apps/server/package.json` (z. B. `0.2.0` und
`0.2`) und `sha-<commit>`. Zu jeder Version entsteht automatisch das Git-Tag `v0.2.0`.
Selbst bauen: `docker compose up -d --build`.

**Update:** Mit fester Version (z. B. `ghcr.io/callmetechie/new-pam-analyzer:0.2.0`) reicht es,
die Nummer in `docker-compose.yml` zu ändern und das Projekt neu zu erstellen. Mit `latest` lädt
`docker compose pull` das neue Image; der Container Manager einer Synology lädt ein vorhandenes
`latest` dagegen nicht neu.

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | Port im Container |
| `DATA_DIR` | `/data` | Ordner der Datenbank `pam.sqlite` (Volume) |
| `PUBLIC_URL` | – | Öffentliche Adresse; mit `https://` wird das Sitzungs-Cookie als `Secure` markiert |
| `COOKIE_SECURE` | aus `PUBLIC_URL` | Erzwingt `Secure` an (`true`) oder aus (`false`) |
| `TIME_ZONE` | `Europe/Berlin` | Zeitzone der Maschinen; für Datumsangaben aus ZIP-Archiven und den Upload-Zeitpunkt |
| `SESSION_TTL_DAYS` | `7` | Gültigkeit einer Anmeldung, verlängert sich bei Nutzung |
| `MAX_UPLOAD_MB` / `MAX_FILE_MB` | `200` / `10` | Grenze je Upload bzw. je `.dat`-Datei |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | `5` / `15` | Sperre nach Fehlversuchen |
| `SERVICE_COMPANY_NAME` | `FUJI Service` | Name der Service-Firma beim ersten Start |
| `WEB_DIR` | `/app/public` | Gebaute Web-Oberfläche; fehlt der Ordner, läuft nur die API |

**Datenordner:** Der Container startet als root, legt `/data` an, macht den Ordner für den
Server-Benutzer (uid 1000) beschreibbar und startet den Server dann ohne Root-Rechte. Ein
eingebundener Ordner eines NAS (z. B. `/volume1/docker/pam-analyzer/data` auf einer Synology)
braucht deshalb keine Rechte von Hand. Ist der Ordner trotzdem nicht beschreibbar (etwa eine
Netzwerkfreigabe mit `root_squash`), bricht der Start mit einer verständlichen Meldung ab.
Mit `user:` in `docker-compose.yml` startet der Server direkt als dieser Benutzer.

**Sicherung:** Die Datenbank läuft im WAL-Modus; zu ihr gehören `pam.sqlite` sowie die Dateien
`-wal` und `-shm`. Für eine Sicherung den Container anhalten (`docker compose stop`) und den
ganzen Ordner `/data` kopieren.

Der Server gehört hinter einen Reverse-Proxy mit HTTPS (z. B. Caddy, Traefik, nginx).

## Erster Start

Ohne Administrator legt der Server beim Start das Konto `admin@example.com` mit dem Passwort
`admin1234` in der Datenbank an. Bei der ersten Anmeldung müssen E-Mail-Adresse und Passwort
geändert werden (`POST /api/auth/password` mit `newEmail`); bis dahin antwortet der Server auf
alles außer `/api/auth/*` mit `403 password_change_required`. Zugangsdaten in Umgebungsvariablen
gibt es nicht. Die Standard-Zugangsdaten sind öffentlich bekannt: vor dem ersten Login den Server
nicht aus dem Internet erreichbar machen.

## Firmen, Rollen und Rechte

Firmen sind die Mandanten. Benutzer, API-Keys, Maschinen und Ergebnisse gehören zu genau einer
Firma. Eine Firma ist die **Service-Firma** (FUJI Service); ihre Mitglieder sehen alle Firmen.

| | Administrator | Firmen-Admin | Benutzer |
|---|---|---|---|
| Ergebnisse sehen, suchen, hochladen | alle Firmen | eigene Firma¹ | eigene Firma¹ |
| Ergebnisse löschen | alle | eigene Firma | – |
| Benutzer und API-Keys verwalten | alle Firmen | eigene Firma | – |
| Firmen anlegen, Einstellungen | ✓ | – | – |

¹ Mitglieder der Service-Firma sehen und laden für alle Firmen, unabhängig von ihrer Rolle.

- Die Rolle *Administrator* gibt es nur in der Service-Firma; nur Administratoren vergeben sie.
- Niemand ändert die eigene Rolle oder deaktiviert sich selbst; der letzte Administrator bleibt.
- Deaktivierte Benutzer oder Firmen verlieren sofort alle Sitzungen und Geräteverbindungen.
- Neue Benutzer erhalten ein Startpasswort und müssen es bei der ersten Anmeldung ändern. Bis dahin
  beantwortet der Server alles außer `/api/auth/*` mit `403 password_change_required`, und Apps
  können sich mit dem Konto nicht verbinden.

## API-Keys und Geräte

1. Firmen-Admin oder FUJI Service legen einen API-Key mit einer **maximalen Anzahl Geräte** an.
   Der Key wird genau einmal angezeigt.
2. Die App verbindet sich mit `POST /api/app/connect` (Key, E-Mail, Passwort, Installations-ID,
   Gerätename, Plattform). Der Benutzer muss zur Firma des Keys gehören.
3. Die App erhält ein **Geräte-Token** (`pamd_…`) und sendet es als `Authorization: Bearer`.
4. Ist die Grenze erreicht, antwortet der Server mit `409 connection_limit`. Dieselbe Installation
   belegt beim erneuten Verbinden keinen weiteren Platz; das alte Token wird dabei ungültig.
5. Trennen (Firmen-Admin oder App selbst) gibt den Platz frei. Widerruf des Keys trennt alle Geräte.

## Prüfdatum

Kopfzeilen-Zeitstempel (NXT-R) → Änderungsdatum der Datei → Upload-Zeitpunkt. Das
Änderungsdatum kommt aus `File.lastModified` (Browser, als Feld `lastModified` je Datei), aus dem
Eintrag im ZIP-Archiv oder von der App. `dateSource` im Ergebnis sagt, woher das Datum stammt.

## Upload

`POST /api/uploads` als `multipart/form-data` mit `files` (eine oder mehrere `.dat`- oder
ZIP-Dateien, auch verschachtelt), optional `lastModified` je Datei und – nur für FUJI Service –
`companyId`. Jede Datei wird ausgewertet und mit Originaldatei (gzip) und Kennzahlen gespeichert.
Antwort je Datei: `created`, `duplicate` (gleicher Inhalt in derselben Firma) oder `rejected` mit
Grund; nicht unterstützte Dateien stehen unter `skipped`.

Uploads von FUJI Service ohne Firma bleiben ohne Zuordnung und sind nur für den Service sichtbar;
`POST /api/results/assign` ordnet sie später einer Firma zu.

## Endpunkte

Alle Antworten sind JSON. Fehler: `{ "error": { "code": "…", "message": "…" } }`; `code` ist
sprachneutral und wird von Web-Oberfläche und Apps übersetzt, `message` ist englisch.
Zustandsändernde Anfragen mit Sitzungs-Cookie müssen vom eigenen Ursprung kommen (CSRF-Schutz).

| Methode und Pfad | Zweck |
|---|---|
| `POST /api/auth/login`, `POST /api/auth/logout` | Anmelden (Cookie `pam_session`), Abmelden |
| `GET /api/auth/me`, `PATCH /api/auth/me` | Eigenes Profil, Name und Sprache |
| `POST /api/auth/password` | Passwort ändern (meldet andere Sitzungen ab) |
| `GET /api/auth/session` | Sitzung prüfen, ohne Fehlerstatus |
| `GET/POST /api/companies`, `GET/PATCH /api/companies/:id` | Firmen (Anlegen, Ändern, Deaktivieren) |
| `GET /api/companies/:id/machines`, `PATCH /api/machines/:id` | Maschinen einer Firma, Linie setzen |
| `GET/POST /api/users`, `PATCH/DELETE /api/users/:id` | Benutzer |
| `GET/POST /api/api-keys`, `PATCH/DELETE /api/api-keys/:id` | API-Keys mit verbundenen Geräten |
| `DELETE /api/devices/:id` | Gerät trennen |
| `POST /api/app/connect`, `GET /api/app/config`, `DELETE /api/app/connection` | Für die Apps |
| `POST /api/uploads` | Dateien hochladen |
| `GET /api/results` | Liste mit Suche `q`, Filtern `family`, `rating`, `from`, `to`, `machineNo`, `companyId`, Sortierung und Seiten |
| `GET /api/results/:id` | Vollständige Auswertung mit Messpunkten, neu berechnet aus der Originaldatei |
| `GET /api/results/:id/history` | Alle Ergebnisse desselben Kopfes in derselben Firma |
| `GET /api/results/:id/file` | Originaldatei |
| `DELETE /api/results/:id`, `POST /api/results/assign` | Löschen (weich), Firma zuordnen |
| `GET /api/dashboard` | Übersicht: Summen, Ergebnisse je Tag, Bewertungen, neueste Ergebnisse |
| `GET/PUT /api/settings/coefficients` | Koeffizienten; jede Änderung ist eine neue Version |
| `GET/PUT /api/settings/general` | Standard-Anzahl Geräte für neue API-Keys |
| `GET/PUT /api/settings/rating` | Bewertungsgrenzen; Speichern bewertet alle Ergebnisse neu |
| `PUT/GET/DELETE /api/companies/:id/logo` | Firmenlogo (PNG, JPEG, WebP, ≤ 512 KB); Firmen-Admin oder Administrator |
| `GET /api/i18n`, `PUT/DELETE /api/i18n/:code` | Importierte Sprachkataloge (lesen ohne Anmeldung, ändern nur Administratoren) |
| `GET /api/version` | Versionen von Server und Rechenkern (ohne Anmeldung) |

Die Suche teilt `q` in Wörter; jedes Wort muss in Maschinennummer, Kopftyp, Kopf-Seriennummer,
Werkzeug-Seriennummer, Dateiname, Linie oder Firmenname vorkommen.

## Koeffizienten

Jede Änderung der Koeffizienten wird als neue Version gespeichert. Ergebnisse merken sich die
Version, mit der sie ausgewertet wurden, und werden in der Detailansicht mit genau dieser Version
neu berechnet. Neue Uploads verwenden die aktuelle Version.
