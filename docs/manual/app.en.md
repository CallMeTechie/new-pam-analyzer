# Manual of the app (Windows and Android)

The app evaluates PAM files from NXT, NXT-R and AIMEX directly on this PC, also without a network. It uses the same calculation core as the server and therefore comes to the same results.

## Evaluating files

- **Open files** selects one or more `.dat` files or ZIP archives.
- **Drag and drop**: drag files onto the window, on any page.
- A **double-click** on a `.dat` file in Explorer opens it in the app, also while the app is running.

Every file is evaluated right away and stored under **Results**. The same file is recognised by its content and not stored twice. Files that cannot be read are reported with the reason.

## Results

The list shows all results on this PC, the newest test date first. Search for head type, serial number, machine or file name; filter by machine family and rating.

The result page is the same as on the web: head, total, adjustable coefficient, overall charts, a view per holder and **Print**. **Head history** shows all measurements of the same head on this PC. **Show in Explorer** opens the folder of the original file.

## Server

Connected, the app also uploads every file to the server. To connect you need:

- the **server address**, e.g. `https://pam.example.com`,
- an **API key** of your company (the company administrator creates it on the web under "Team & API keys"),
- your **e-mail address** and **password** from the web.

The password is not stored, only a device token in the Windows Credential Manager. Whoever still has the initial password changes it on the web first.

- The **original file** is always uploaded; the server evaluates it itself and is authoritative.
- If the server cannot be reached, the app collects the files in the **upload queue** and tries again every minute.
- When connecting, all files evaluated only locally so far are uploaded as well.
- The app takes over **coefficients and rating limits** from the server. When the server changes them, the app rates all results on this PC again.
- **Disconnect** frees the device slot of the API key. The results stay on the PC.

The column on the right of the list shows per result: **Uploaded**, **Waiting for upload**, **Only on this PC** or **Not accepted** (with the reason; "Try again" under Server).

## Settings

- **General**: language, update channel, location of the data.
- **Coefficients** and **Rating**: read only. Connected they come from the server, otherwise the defaults apply.
- **Manual** and **Version** (changelog of the app).

## Updates

The app looks for a new version at every start and shows it with its changes. **Update now** downloads the update, checks its signature, installs it and restarts the app. The data on the PC is kept.

- **Stable**: tested versions, recommended for daily work.
- **Beta**: new features earlier, but less tested; also receives every stable version.

Whoever switches back from Beta to Stable keeps the installed version until a newer stable version appears.

## Android

The app runs on smartphones, tablets and foldables and can do the same as on Windows.

- **Files:** through "Open" (Android file picker, also USB sticks and cloud apps), through
  **Share → PAM Analyzer** in another app (file manager, e-mail, Teams …) or by tapping a `.dat`
  in a file manager ("Open with PAM Analyzer").
- **Phone:** navigation at the bottom. The result shows the tabs Overview, Charts and Holders;
  tap a holder to enlarge it.
- **Tablet and unfolded foldable:** list on the left, result on the right.
- **Foldable half open (tabletop):** charts above, controls below.
- **Print:** opens the Android print dialog, including **Save as PDF**.
- **Connect to the server:** as on Windows. The API key can be scanned: the web shows a QR code
  when the key is created; in the app tap the camera symbol under Server.
- **Updates:** the APK from GitHub looks for updates at start (channels Stable and Beta). At the
  first update Android asks whether PAM Analyzer may install apps; after that "Update now" is
  enough. The version from Google Play is updated by Play.

### Installation (APK)

Download `PAM-Analyzer_<version>_android.apk` from the releases of the project on GitHub and
open it. Android asks once whether the browser or file manager may install apps.

## Installation

The installer is available under the releases of the project on GitHub (`PAM.Analyzer_<version>_x64-setup.exe`). As it has no purchased code signing certificate, Windows SmartScreen warns at the first start: **More info → Run anyway**. The app is installed for the signed-in user; no administrator rights are needed.

The data is stored under `%APPDATA%\com.callmetechie.pamanalyzer`.
