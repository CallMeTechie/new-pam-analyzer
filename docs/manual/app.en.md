# Manual of the app

The app evaluates PAM files from NXT, NXT-R and AIMEX directly on this PC, also without a network. It uses the same calculation core as the server and therefore comes to the same results.

## Overview

The start page. On Windows the narrow icon bar on the left leads to Overview, Results and Settings; the dot at the bottom shows the connection state. The header band shows this week's measurements per day, the Ø Cpk and the number of critical heads; the filters (NXT, NXT-R, AIMEX, critical) narrow the list. On the right are the area for adding files and the server state, below the Cpk trend of the week, the best head and the number of critical heads. A click on the area **Drag PAM files here or click to choose** opens the file dialog (one or more `.dat` files or ZIP archives). Other ways:

- **Drag and drop**: drag files onto the window, on any page.
- A **double-click** on a `.dat` file in Explorer opens it in the app, also while the app is running.

With several files the area shows the progress ("12 of 40"). Afterwards a short message at the bottom right tells how many results are new, which files were already there and which could not be read; it disappears by itself after a few seconds. The same file is recognised by its content and not stored twice.

Below the area only the measurements with a test date in the **current calendar week** are listed. Older ones are under **Results**.

### Customer and test date

After an import the app asks once for all new results:

- **Customer**: while typing, the app suggests customers used before (from this device and, when connected, from the server). A new customer is simply typed in.
- **Test date**: take the date from the file (default), today's date or another date.

**Skip** leaves both open. Customer and date can be changed later on the result with **Customer & date**; when connected, the changes are sent to the server as well.

## Results

All results on this device, switchable:

- **By date**: one group per test day, the newest day on top.
- **By customer**: one group per customer, ordered by the latest measurement; results without customer come last under "No customer".
- **List**: all heads without groups.

A head with several measurements is listed once, with the number ("3 measurements"). A click on it opens the **head history** first, the newest measurement on top; from there you open the single result. The search finds head type, serial number, machine, customer and file name; filter by machine family and rating.

The result page is the same as on the web: head, total, adjustable coefficient, overall charts, a view per holder and **Print**. **Back** returns to the previous page. **Show in Explorer** opens the folder of the original file.

In a wide, e.g. maximized window the result slides in from the right and takes at most half the width; the list next to it stays usable. The holders are then shown three side by side. **✕** closes the result, **⤢** shows it as a full page. In a narrow window the result opens as a page of its own.

## Server

Technicians and customers can connect the app to a **FUJI PAM Server**. The app then also uploads every file to the server, where the results are available on the web as well. Customers can also purchase a **server of their own** and upload the results to their own environment.

For access (server address, API key and user account) please contact your **FUJI service representative**. You connect in **Settings** under **Server**.

The password is not stored, only a device token in the Windows Credential Manager or the protected storage of Android.

- The **original file** is always uploaded; the server evaluates it itself and is authoritative.
- If the server cannot be reached, the app collects the files in the **upload queue** and tries again every minute.
- When connecting, all files evaluated only locally so far are uploaded as well.
- The app takes over **coefficients and rating limits** from the server. When the server changes them, the app rates all results on this device again.
- **Disconnect** frees the device slot of the API key. The results stay on the device.

Every result shows its state: **Uploaded**, **Waiting for upload**, **Only on this device** or **Not accepted** (with the reason; "Try again" under Settings → Server). A click on the connection state at the bottom left opens this page.

## Settings

- **General**: language, appearance (light, dark or like the system), update channel, location of the data.
- **Server**: connect, upload queue, disconnect.
- **Coefficients** and **Rating**: read only. Connected they come from the server, otherwise the defaults apply.
- **Manual** and **Version** (changelog of the app).

## Updates (Windows)

The app looks for a new version at every start and shows it with its changes. **Update now** downloads the update, checks its signature, installs it and restarts the app. The data on the PC is kept.

- **Stable**: tested versions, recommended for daily work.
- **Beta**: new features earlier, but less tested; also receives every stable version.

Whoever switches back from Beta to Stable keeps the installed version until a newer stable version appears.

## Android

The app runs on smartphones, tablets and foldables and can do the same as on Windows.

- **Files:** by tapping the area on the overview (Android file picker, also USB sticks and cloud apps), through
  **Share → PAM Analyzer** in another app (file manager, e-mail, Teams …) or by tapping a `.dat`
  in a file manager ("Open with PAM Analyzer").
- **Phone:** navigation at the bottom. The result shows the tabs Overview, Charts and Holders;
  tap a holder to enlarge it.
- **Tablet and unfolded foldable:** navigation on the left. A result uses the full width; tapping "Results" slides the list in from the left, choosing another result or tapping beside it closes it again.
- **Foldable half open (tabletop):** charts above, controls below.
- **Print:** opens the Android print dialog, including **Save as PDF**.
- **Connect to the server:** as on Windows. The API key can be scanned: the web shows a QR code
  when the key is created; in the app tap the camera symbol under Settings → Server.
- **Updates:** installed automatically by Google Play.

### Installation (Google Play)

The app is installed from the **Google Play Store**. At the moment it is in a **closed test**. To get it:

1. Contact your **FUJI service representative** and ask to be added to the test programme.
2. Give the **e-mail address of the Google account** that is connected to the Play Store on the smartphone or tablet you want to use the app on.
3. Once you are added, you receive a link to the app in the Play Store; tap **Install** there.

## Installation (Windows)

You receive the installer (`PAM Analyzer_<version>_x64-setup.exe`) from your **FUJI service representative**. Start it and follow the steps. The app is installed for the signed-in user; no administrator rights are needed. After that the app installs new versions by itself (see Updates).

The data is stored under `%APPDATA%\com.callmetechie.pamanalyzer`.
