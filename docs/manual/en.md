# Manual

The PAM Analyzer evaluates PAM results (`.dat`) of FUJI NXT, NXT-R and AIMEX machines, stores them and shows them separately for every company.

## Getting started

1. On the first start there is the account `admin@example.com` with the password `admin1234`.
2. At the first sign-in you choose your own e-mail address and a password with at least 12 characters. The default credentials stop working afterwards.
3. Create the customer companies under **Companies** and the accounts under **Users**.
4. Upload the first PAM files under **Upload**.

## Roles

- **Administrator**: belongs to the service company and manages all companies, users, API keys and settings.
- **Company admin**: manages the users, API keys, machines and logo of their company.
- **User**: sees the results of their company and uploads new ones.

Members of the service company see the results of all companies.

## Uploading results

- Under **Upload**, choose files, ZIP archives or whole folders, or drop them onto the area.
- The service company first chooses the company the results belong to.
- Files already stored in the company are recognized and skipped.
- **Test date**: the timestamp in the file (NXT-R), otherwise the modification date of the file, otherwise the upload date.

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
- **Print**: prints the result on A4, with the company logo.
- **Original file**: downloads the uploaded `.dat` file.

## Rating

Cpk values are rated in four levels: critical, warning, good, excellent. An administrator sets the thresholds under **Settings → Rating**; all results are rated again at once.

The rating is based on the spread of all components of a holder, not on each component. A single outlier far outside the tolerance increases the spread (3σ) a lot and can lower the Cpk of a holder considerably.

## Head history

**Head history** in a result shows all tests of the same head in the company: Cpk XY as a line over time and the list of all tests. A filled dot means "date from the file", a hollow dot "date = upload".

## Companies, team and API keys

- **Companies** (service company): create companies, upload logos, manage users, API keys and machines. **Open company view** shows the company exactly as its members see it.
- **Team & API keys** (company admin): invite members, create API keys, disconnect devices, enter the line of each machine.
- **API keys** connect the Windows, Android and iOS apps. Every member of the company can use every key of the company. A key allows at most the set number of devices. The key is shown only when it is created.

## Settings (administrators)

- **Coefficients**: tolerance and expected components per head type, plus the DX tools. Every change is saved as a new version; existing results keep their version.
- **Rating**: thresholds of the four rating levels.
- **Languages**: export a language file, translate it and import it again. Missing texts appear in English.
- **Security & data**: default maximum number of devices for new API keys.
- **Version**: installed version and changes.

## Operation

- Docker image: `ghcr.io/callmetechie/new-pam-analyzer:latest`.
- All data is in the folder `/data` of the container. For a backup, stop the container and copy the folder.
- Behind a reverse proxy, `PUBLIC_URL` must be exactly the address shown in the browser, e.g. `https://pam.example.com`.
