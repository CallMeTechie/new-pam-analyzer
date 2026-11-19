# Changelog

All notable changes to the PAM Analyzer. Versions follow [Semantic Versioning](https://semver.org).

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
