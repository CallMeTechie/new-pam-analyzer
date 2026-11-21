# Changelog of the app

## 0.3.1

### Changed
- Android: package name `com.pamanalyzer.client` (Google Play). An APK installed from GitHub before stays as a separate app and can be uninstalled.

### Fixed
- On foldables and tablets the Cpk value and the rating overlapped on the result page.

## 0.3.0

### Added
- New start page "Overview": a click on the area opens the file dialog; below are the results of the current calendar week.
- After an import the app asks for the customer (with suggestions from earlier customers) and the test date (from the file, today or another date). Both can be changed on the result with "Customer & date" and are sent to the server.
- Progress while importing many files; after the import a short message at the bottom right.
- Results by date, by customer or as a list. A head with several measurements is listed once and opens its head history first.
- Windows: in a wide window the result slides in next to the list, with three holders per row.
- Dark mode (light, dark or like the system).
- Back button on the result and the head history.
- New logo, the same for Windows, the installer and Android.

### Changed
- "Server" is now a tab of the settings; a click on the connection state opens it.
- The button "Open files" is gone; the sidebar no longer shows a second logo.
- Links (e.g. "Made with ♥ by CallMeTechie") open in the default browser.

## 0.2.0

### Added
- Android app for smartphones, tablets and foldables, with the same evaluation, history, server connection and printout as on Windows.
- Android: files through the file picker, "Share" from other apps and "Open with" from file managers; ZIP archives are opened.
- Android: bottom navigation on phones and folded foldables; list and result side by side on tablets and unfolded foldables; tabletop mode of foldables shows the charts above the hinge.
- Android: the result page shows overview, charts and holders as tabs; tapping a holder enlarges it.
- Android: API key and server address can be scanned as QR code from the web.
- Android: updates come through Google Play.

## 0.1.0

### Added
- Evaluates PAM files from NXT, NXT-R and AIMEX on this PC, also without a network, with the same calculation core as the server.
- Files come in through "Open files", drag and drop or a double-click on a `.dat` file in Explorer; ZIP archives are opened.
- Local history with search and filters, result page with head, total, charts, holders and printout as on the web, head history.
- Connection to the server with API key, e-mail and password; uploads the original files, also collected offline, and takes over coefficients and rating limits of the server.
- Updates in the channels Stable and Beta.
