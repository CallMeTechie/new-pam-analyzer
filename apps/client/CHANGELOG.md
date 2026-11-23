# Changelog of the app

## 0.4.0

### Added
- Windows: new design – narrow icon bar instead of the sidebar, indigo header band on every page, DM Sans typeface, light and dark.
- Windows overview as a dashboard: this week's measurements per day, Ø Cpk and critical heads in the header band, filters by family and "critical", adding files and server state on the right, Cpk trend of the week, best head and critical heads as cards.
- Crash reports: when the app crashes (Windows or Android), it stores a report and sends it to the server once connected. Administrators find them on the web under Settings → Crash reports.
- Android (Google Play): "Check now" asks Google Play for a new version and shows it; "Install" starts the update through Google Play.

### Fixed
- Android: the camera button next to the API key crashed the app. Scanning now uses the QR scanner of Google Play services – its own camera screen, no camera permission needed. If the scanner module is still missing, the app downloads it through Google Play and starts the scanner afterwards. If the scanner fails, the app shows the exact reason.

### Fixed
- Android: the camera button next to the API key opens the camera again. The app now asks for the camera permission first; while scanning a frame and "Cancel" are shown. If access was refused, a link leads to the app settings.

## 0.3.5

### Changed
- Tablets and unfolded foldables: an open result uses the full width. Tapping "Results" in the navigation rail slides the list in from the left; choosing a result or tapping beside it closes it again.

## 0.3.4

### Changed
- Android: as long as the app is not yet published in Google Play, each new version is created there as a draft.

## 0.3.3

### Changed
- Android: new versions are sent to Google Play automatically.

## 0.3.2

### Changed
- Texts say "this device" instead of "this PC", so they also fit Android.
- The overview lists the measurements with a test date in the current calendar week, no longer everything imported this week.

### Fixed
- Windows: the first entry of the sidebar has its top spacing again.

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
