# Manual

The PAM Analyzer evaluates PAM results (`.dat`) of FUJI NXT, NXT-R and AIMEX machines, stores them and shows them separately for every company.

## Getting started

1. On the first start there is the account `admin@example.com` with the password `admin1234`.
2. At the first sign-in you choose your own e-mail address and a password with at least 12 characters. The default credentials stop working afterwards.
3. Right after that you name the **service company** (step 2 of 2). It can be renamed later under Companies.
4. Create the customer companies under **Companies** and the accounts under **Users**.
5. Upload the first PAM files in the upload area of the **Dashboard**.

## Roles

- **Administrator**: belongs to the service company and manages all companies, users and settings.
- **Company admin**: invites members, manages their devices, the machines and the logo of their company.
- **User**: sees the results of their company and uploads new ones.

Members of the service company see the results of all companies. The **service company** is created by the server on its first start and named by the first administrator right after the default credentials are replaced (suggested name: `SERVICE_COMPANY_NAME`, default "FUJI Service"). It is marked "Service" under Companies; there is exactly one. Every other company only ever sees and uploads its own results.

## Uploading results

- In the upload area of the **Dashboard**, choose files, ZIP archives or whole folders, or drag them onto it: as soon as files are dragged into the browser window, the area is marked as drop zone. Files in subfolders, of folders and of ZIP archives alike, are included; the list shows the path of each file and how many PAM files each ZIP archive holds. There is no limit on the size of a ZIP archive or the number of files: archives are unpacked in the browser and the files go to the server in portions.
- The upload runs **in the background**: you can keep working and switch pages. A message at the bottom right shows files, MB and percent, a bar runs along the bottom edge; ✕ cancels (what was uploaded until then is kept). Do not close or reload the browser tab while it runs.
- When it is finished, **Details** shows every file: new, already stored, not readable or skipped.
- A dialog then opens: **Company / customer** (typing suggests the companies in the system and customers used before; a company in the system gets the results, its members see them) and **Test date** (filled in from the file, changeable; for several files optionally one date for all). Nothing is required: **Skip** uploads without it.
- Files already stored in the company are recognized and skipped.
- **Test date**: the timestamp in the file (NXT-R), otherwise the modification date of the file (inside a ZIP: of the entry), otherwise the upload date.
- **Customer & date** in a result changes its customer and test date afterwards (file date, today or another day).

## Finding results

- The **Dashboard** shows the latest results, results per day and the distribution of ratings.
- Under **Results**, search by head, serial number, machine, line or file name. Several words narrow the search, e.g. `V12 900026`.
- Filters: machine family, rating, period, sorting.

## Reading a result

- **Gauge**: Cpk XY of the whole head with its rating.
- **HEAD**: |average| + 3σ, CP and CPK for X and Y.
- **TOTAL**: average, 3σ, maximum and minimum.
- **CPK coefficient & components**: the tolerance ±µm used for the calculation and the number of measured components. You can change the coefficient to try something out; it is not saved.
- **Overall view**: all components by angle and by holder. A holder in the legend highlights its points.
- **Individual view per holder**: Cpk XY and rating per holder, sortable, filterable to holders that need attention.
- **Print**: prints the result on A4. Page 1 shows the result header, Head, Total and the overall charts; the holders follow from page 2 (at most 12 per page). The company logo appears when the result belongs to a company.
- **Original file**: downloads the uploaded `.dat` file.

## Rating

Cpk values are rated in four levels: critical, warning, good, excellent. An administrator sets the thresholds under **Settings → Rating**; all results are rated again at once.

The rating is based on the spread of all components of a holder, not on each component. A single outlier far outside the tolerance increases the spread (3σ) a lot and can lower the Cpk of a holder considerably.

## Head history

**Head history** in a result shows all tests of the same head in the company: Cpk XY as a line over time and the list of all tests. A filled dot means "date from the file", a hollow dot "date = upload".

## Companies, team and devices

- **Companies** (service company): create companies, upload logos, manage users, devices and machines. **Open company view** shows the company exactly as its members see it.
- **Team** (company admin): invite members, disconnect devices, set the number of devices per member, enter the line of each machine.
- **Invite member:** enter name, e-mail address and role. You get an **invitation** with QR code, link and code (valid for 7 days, single use). With the link the member chooses a password in the browser; with the QR code they connect their first device in the app. With a mail server configured, the invitation can be sent by e-mail right away. Lost? **Invitation** in the member list creates a new one; the old one stops working.
- **Connect another device:** each member under **My account**. The QR code shown there is valid for 10 minutes and once. That page also lists your devices and lets you disconnect them.

## Settings (administrators)

- **Coefficients**: tolerance and expected components per head type, plus the DX tools. Every change is saved as a new version; existing results keep their version.
- **Rating**: thresholds of the four rating levels.
- **Languages**: export a language file, translate it and import it again. Missing texts appear in English.
- **E-mail**: mail server (SMTP) for sending invitations, with a test e-mail. Settings made here win over the environment variables `SMTP_*`; the password is never shown again.
- **Security & data**: default number of devices per member (a company can set its own limit under Team).
- **Version**: installed version and changes.

## Operation

- Docker image: `ghcr.io/callmetechie/new-pam-analyzer:latest`.
- All data is in the folder `/data` of the container. For a backup, stop the container and copy the folder.
- Behind a reverse proxy, `PUBLIC_URL` must be exactly the address shown in the browser, e.g. `https://pam.example.com`.
