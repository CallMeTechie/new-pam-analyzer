# Changelog

All notable changes to the PAM Analyzer. Versions follow [Semantic Versioning](https://semver.org).

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
