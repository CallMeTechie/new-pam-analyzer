# Changelog

## 0.11.1 – 2026-11-24

### Changed
- Drag & drop onto the whole dashboard: files, ZIP archives and folders can be dropped anywhere on the page (an overlay shows it), not only on the dashed area; a file dropped next to it is no longer opened by the browser. Files in subfolders are included.
- The list before uploading shows the path of each file in its folder and how many PAM files each ZIP archive holds (all subfolders), with the total; sizes in KB or MB.

## 0.11.0 – 2026-11-23

### Changed
- **Upload in the background, in any size.** The upload runs in the background: you can keep working and switch pages; a toast shows files, MB and percent, a bar runs along the bottom edge, and the upload can be cancelled. ZIP archives of any size (also ZIP64) and any number of files: the browser unpacks the archives one entry at a time and sends the files in portions; a portion that fails because of the network is sent again. The outcome opens from the toast ("Details").
- The separate upload page is gone; uploading is done in the drop zone of the dashboard (`/upload` leads there).
- The mail server for invitations is set up under **Settings → E-mail** (with test e-mail); it wins over the `SMTP_*` environment variables.
- The service company is marked "Service" under Companies, with an explanation of what it sees.
- Counts in texts are formatted for the language (9,677 / 9.677).

### Added
- **Naming the service company** is the second step of a new installation, right after the default credentials are replaced (`POST /api/auth/service-company`); `SERVICE_COMPANY_NAME` is only the suggestion. Existing installations keep their name.
- **Customer & date** on the web: change the customer and test date of a result afterwards.
- `GET/PUT /api/settings/mail`, `POST /api/settings/mail/test`; `GET /api/version` reports the upload limits; uploads accept `modifiedLocal` (date of a ZIP entry, wall-clock time of the machines).

## 0.10.0 – 2026-11-23

### Changed
- **Invitations instead of API keys.** Inviting a member creates a one-time invitation with QR code, link and code (valid for 7 days): with the link the member chooses a password in the browser, with the QR code they connect their first device in the app. Lost invitations are simply replaced. With a mail server configured (`SMTP_HOST`, optional) the invitation can be sent by e-mail.
- **Connect another device:** every user creates a QR code under "My account" (valid for 10 minutes, once) and sees and disconnects their devices there.
- The number of devices is limited per user (default under Settings → Security, per company under Team → Devices) instead of per API key.
- API keys are removed (web, API and database). Devices connected so far keep working with their token.
- Result lists include who uploaded a result and with which device (for the server view of the apps).

### Fixed
- Database migrations that rebuild a table no longer clear the references of other tables to it.

## 0.9.0 – 2026-11-23

### Added
- Crash reports of the apps: connected apps send them (`POST /api/app/crash-reports`); administrators see, copy and delete them under Settings → Crash reports (`GET`/`DELETE /api/crash-reports`).

## 0.8.0 – 2026-11-23

### Changed
- Dashboard shows the current calendar week (Monday to Sunday), like the app: results per weekday, critical results and ratings of the week.
- The cards above the table are the three most recently uploaded results; the table below lists the results of this and last calendar week.
- Results can be grouped by test date or by customer, or shown as a plain list; sorting still applies within each group. The choice is remembered.

### Added
- `GET /api/dashboard` takes a fixed period (`from`, `to`), `GET /api/results` takes `group=date|customer`.

## 0.7.0 – 2026-11-23

### Changed
- New design of the web interface (like the Windows app): narrow icon bar instead of the sidebar (phones keep the slide-in menu with labels), indigo header band on every page, DM Sans typeface.
- Dashboard: period, results per day and the number of critical results in the header band; upload and ratings on the right; latest results as pastel cards.

## 0.6.0 – 2026-11-21

### Added
- Results have a customer. It is sent per file with the upload (`customer`) or set later; the search finds it.
- The test date can be entered by hand (`testDate` with the upload, source "set by hand").
- `GET /api/results/customers` returns the customers used so far, for the autocompletion of the apps.
- `PATCH /api/results/:id` changes customer and test date.
- New logo, the same on the web, Windows and Android.

### Changed
- "Made with ♥ by CallMeTechie" links to LinkedIn.

## 0.5.0 – 2026-11-19

### Added
- A new API key is also shown as QR code with the server address, for the Android app to scan.

### Changed
- The result page can show its sections as tabs and enlarge holders (used by the Android app).

## 0.4.0 – 2026-11-19

### Added
- Windows app (versioned separately, see the app changelog): evaluates PAM files offline and uploads them when connected.

### Changed
- `GET /api/app/config` and `POST /api/app/connect` also return the time zone of the machines, so the app determines the same test date as the server.
- The web pages "Result" and "Head history" are shared with the app.

## 0.3.0 – 2026-11-19

### Added
- The machine number is split into module type and serial number: "M6IIIXNo2149" shows as "M6III · S/N 2149", "NXTR-1R-Xno0000184" as "NXTR-1R · S/N 0000184".

### Changed
- Reworked printout: page 1 shows the result header, Head, Total and both overall charts; the holders follow from page 2, at most 12 per page.
- In the printout, coefficient and components are part of the result header; the "CPK coefficient & components" and file notice boxes, the page header and the overall view caption are gone.
- Print date, calculation core, rating limits and page number are in the footer of every page.
- A result without a company prints without company and logo.
- The Docker image is also published with its version number (e.g. `0.3.0`), and every version gets a git tag.

## 0.2.0 – 2026-11-19

### New
- Print view for PAM results (A4, with company logo).
- Company logo (PNG, JPEG or WebP) for every company.
- Rating thresholds can be changed in the settings; all results are rated again at once.
- Languages: export a language file and import new or improved ones.
- Settings: new tabs "Manual" and "Version" with this changelog.
- Administrators can move users to another company; the user dialog shows the company.

### Changed
- The Docker image prepares the data folder itself; no manual rights are needed on a NAS.
- Clear error message if the database cannot be opened.
- Footer stays visible; "Made with ♥ by CallMeTechie".
- Explanations moved behind (i) icons.
- Compact coefficient settings in one table per head type.
- Long company names are shown completely.
- Texts no longer name a fixed service company.

### Removed
- The collective coefficient entries `1-HEAD` … `12-HEAD`. H12, H12S, H01V and RH01 got their own entries with the same values.

## 0.1.0 – 2026-11-19

### New
- Calculation core for NXT, NXT-R and AIMEX, verified against the old PAM Analyzer.
- Server with companies, roles, API keys with device limits, upload, search and head history.
- Web interface in English and German.
- Docker image on ghcr.io (amd64 and arm64).
- Default administrator `admin@example.com` / `admin1234`; e-mail address and password must be changed at the first sign-in.
