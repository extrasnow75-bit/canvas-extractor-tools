# Canvas Extractor Tools

*Draft for Confluence. Everything below the "For maintainers" heading is aimed at a
developer, not at course staff — consider putting it on a child page.*

---

Canvas Extractor Tools is a desktop app that copies a Canvas course into a Google Doc
already formatted to the Blueprint template. It replaces the copy-paste-and-reformat pass
that QA review used to require.

It is **read-only against Canvas.** The app never edits, publishes, or deletes anything in
a course. The only thing it creates is a Google Doc in your own Drive.

## What it exports

You choose one of three exports each time you run it. Each produces one document.

| Export | What lands in the document |
| --- | --- |
| **Course content** | The home page, the syllabus, and every module item in the order the Modules page shows them — pages, assignments, discussions, quiz instructions, files, and external links. Due-date headers get the blue Blueprint rules; Canvas tool names (Page, Assignment, …) get the grey chip. |
| **Classic quizzes** | Every question and every answer choice, with the correct answers marked. |
| **Rubrics** | Every rubric in the course as a table — criteria down the side, rating levels across, points per criterion and a total. |

You can export the whole course or tick a subset of items.

Output goes to **Google Drive** as a real Google Doc, which opens in your browser when it
finishes. If you would rather not sign in to Google, you can save a **local `.html` file**
instead and open it in Word or a browser. The formatting is the same either way, with one
exception noted under Known limitations.

## Before you start

You need two things.

**1. A Canvas access token.** This is a long password-like string that lets the app read
courses as you. You make one yourself:

> In Canvas, click **Account → Settings**, scroll to **Approved Integrations**, click
> **+ New Access Token**, give it a purpose like "Canvas Extractor Tools", leave the expiry
> blank, and click **Generate Token**. **Copy the token immediately** — Canvas will not
> show it again.

The token gives the app exactly the access you already have — no more. It is stored
encrypted on your own computer, tied to your Windows sign-in, and is never sent anywhere
except Canvas.

**2. Access to Google sign-in — only if you want the Drive export.** Google sign-in is
currently limited to an approved list of accounts. **Contact the eCampus Center to be added
before your first use**, or sign-in will fail with a message about the app not being
verified. The local `.html` export needs no Google account at all.

## Installing

1. Go to the releases page:
   **https://github.com/extrasnow75-bit/canvas-extractor-tools/releases/latest**
2. Under **Assets**, download the file for your computer:

   | Your computer | Download |
   | --- | --- |
   | Windows | `1-Canvas-Extractor-Tools-WINDOWS-<version>.exe` |
   | Mac with Apple silicon (M1/M2/M3/M4) | `2-Canvas-Extractor-Tools-MAC-Apple-Silicon-<version>.dmg` |
   | Older Intel Mac | `3-Canvas-Extractor-Tools-MAC-Intel-<version>.dmg` |

   Not sure which Mac you have? Click the Apple menu → **About This Mac**. If the Chip line
   says "Apple", take the Apple Silicon file.
3. Open the downloaded file and follow the prompts.

**You will see a warning the first time.** This app is distributed directly rather than
through the Microsoft or Apple stores, so the operating system does not recognise the
publisher yet. It is expected, and it goes away after the first launch.

- **Windows** — a blue box saying *"Windows protected your PC"*. Click **More info**, then
  **Run anyway**.
- **Mac** — a message that the app *"cannot be opened"*. Go to **System Settings → Privacy
  & Security**, scroll down to the message about Canvas Extractor Tools, and click
  **Open Anyway**.

> Mac note: the Mac builds have not yet been tested on a real Mac. If you are the first
> Mac user, please report what happens.

## Using it

**First run — initial setup.** Paste your Canvas access token into the setup panel, and, if
you want Drive output, click **Sign in with Google**. That opens your normal browser for
the Google consent screen. Both are remembered, so you only do this once.

The Google permission requested is the narrow one: the app can only see and manage the
files it creates itself. It cannot read the rest of your Drive.

**Every run after that:**

1. Paste the course URL — anything of the form
   `https://boisestatecanvas.instructure.com/courses/12345`. The course name appears once
   the app confirms it.
2. Pick an export: Course content, Classic quizzes, or Rubrics.
3. Either export everything, or click to choose specific items.
4. Choose **Export to Google Drive** or **Save as HTML file**.
5. Wait. A progress line names each item as it is fetched, and **Stop** cancels between
   items. A large course takes a few minutes — the app makes one request per item and
   Canvas limits how fast it will answer.

When it finishes, the Doc opens in your browser. It is a normal Google Doc in your own
Drive — edit, share, or move it however you like.

## If something goes wrong

**"Token expired" or "Action needed" on the setup panel.** Canvas tokens can be revoked or
expire. Make a new one (see above) and paste it in.

**Google sign-in stops working after a while.** Sign in again from the initial setup panel.
The app clears the dead sign-in automatically, so the button will be waiting for you.

**"Not a recognised Canvas course URL."** The URL must contain `/courses/` followed by the
course number. Copy it from your browser's address bar while you are on the course.

**A purple "check manually" note appears in the document.** That item's text came back
empty from Canvas. It is usually a New Quiz (see below) or a genuinely empty item — open it
in Canvas and confirm.

**The export stops partway with an error.** Most often this is Canvas rate limiting after a
burst of requests. Wait a minute and run it again.

## Known limitations

- **New Quizzes are only partly supported.** The Classic quizzes export covers Classic
  quizzes fully. Canvas stores a New Quiz differently, and the app can usually only reach
  its description, not its questions.
- **The local `.html` export is a plain file**, not a Google Doc. It opens fine in Word or a
  browser, and its formatting matches, but there is no sharing or commenting.
- **A rubric that fails to load** is currently rendered as an empty rubric worth 0 points
  rather than as an error. If a rubric looks blank, check it in Canvas.
- **Exports are one-at-a-time and sequential**, so long courses take minutes.

## Updates

The app checks for a newer version when it starts, and shows a blue bar at the top if one
exists. Click **Download** and it opens the releases page — then install it the same way you
installed the first one, over the top of the old version. There is no automatic install; you
are always the one who decides.

Do not uninstall the old version first. The installer finds the existing copy and replaces
it, keeping your Canvas token and Google sign-in. Two things to watch:

- **Accept the install folder the installer offers.** It lets you change it, and choosing a
  different folder installs a second copy alongside the first rather than replacing it.
- **Close the app before installing**, or Windows reports files in use.

On a Mac, drag the app onto Applications and choose **Replace**, not **Keep Both**.

---

# For maintainers

*Audience: whoever inherits this app. Assumes Node, git, and GitHub Actions.*

**Repo:** https://github.com/extrasnow75-bit/canvas-extractor-tools — currently public,
under the personal account `extrasnow75-bit`. The intent is to transfer it to the eCampus
org eventually; see the warning about secrets below before you do.

**Stack:** Electron + React + TypeScript, built by `electron-vite` into `out/`, packaged by
`electron-builder` into `release/`.

**Ownership:** owned by Boise State University (eCampus Center), released under the MIT
license. The repo currently sits under a personal GitHub account for convenience; ownership
does not follow the account, and the transfer to the eCampus org is an outstanding item
rather than a change of owner.

```
npm install
npm run dev         # live-reloading app
npm run typecheck   # both tsconfigs — main process and renderer
npm run build       # packaged app + installer into release/
```

## Architecture, and the one rule that matters

**Every Canvas and Google network call happens in the main process.** The renderer is
sandboxed (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) and reaches
the main process only through the narrow API in `electron/preload.ts`.

The **Google** tokens are never handed to the renderer — no IPC handler returns one, and
`google:status` returns only the display fields. **Do not weaken that for convenience.** The
**Canvas** token is different: `credentials:load` returns it and the renderer passes it back
on each export call, so a renderer compromise would cost the user their Canvas token. That
asymmetry is deliberate, but it is the reason the renderer's inputs are worth guarding.

Three related defences, each of which would be quietly fatal to remove:

- `app:openReleases` takes **no URL argument**, so the renderer cannot use it as a general
  "open any link" capability.
- `openExternalSafely()` in `main.ts` allows only `http:`/`https:`. `shell.openExternal`
  launches whatever the OS registered for a scheme, so an unfiltered call is a "run
  something" primitive — `file://` reaches executables, and Windows protocol handlers have
  produced RCE more than once.
- `savePaths.ts` — the export handlers write only to a path the save dialog actually issued.
  The renderer supplies that path as a plain string, and nothing else proves its origin.

One trap worth knowing: **every `file://` URL has the origin `"null"`.** The `will-navigate`
guard originally compared origins, which works in dev (an http origin) and silently permits
*any* local file in the packaged build, where the UI is loaded with `loadFile`. `isOwnPage()`
now compares the full path under `file://`. If you touch that function, test it in a
packaged build, not `npm run dev` — the dev path cannot reproduce the failure.

Tokens are stored via Electron's `safeStorage` (Windows DPAPI / macOS Keychain) in
`app.getPath('userData')`. Because DPAPI keys to the Windows account, a credentials file
copied to another machine is not decryptable there — which is why installers carry no
credentials even when built on a machine that has them.

Google sign-in is OAuth 2.0 + PKCE per RFC 8252: system browser plus a short-lived
`127.0.0.1` listener. Scope is `drive.file` only.

Key files:

| File | Role |
| --- | --- |
| `electron/ipc/blueprintFormat.ts` | All Blueprint constants and HTML helpers. Formatting changes start here. |
| `electron/ipc/canvasExport.ts` | Course content export |
| `electron/ipc/quizExport.ts` | Classic quizzes export |
| `electron/ipc/rubricExport.ts` | Rubrics export |
| `electron/ipc/googleDocs.ts` | Post-upload Docs API pass |
| `electron/ipc/canvasUtils.ts` | Canvas fetch, pagination, cancellation, token verification |
| `resources/icon.svg` + `make-icon.py` | Icon source. Edit the SVG, re-run the script (stdlib-only Python). |

## Gotchas that cost real time

- **Google Docs' HTML importer cannot represent a paragraph border.** Rather than dropping
  it, it renders one as a separate grey rule — so the blue Blueprint rules around each
  "Due by …" header, if emitted as CSS, come out as grey lines above and below. The fix in
  place: `dueHeader(title, cssBorders)` emits no border CSS on the Drive path, and
  `applyDueHeaderBorders()` draws the real blue rules through the Docs API after upload.
  The local `.html` path keeps `cssBorders: true`, because nothing runs afterwards there.
- **Google Docs repeats a table's header row across page breaks by itself** when the row is
  made of `<th>` cells. `rubricExport.ts` emits no `<thead>` and does not need one. If you
  see an "untitled" rubric table, it is the continuation of the one above it.
- **Canvas signals rate limiting with HTTP 403, not 429.** Any retry logic must key on 403.
- **Canvas headings inside item bodies** are converted to bold black 11pt text plus a red
  `(H1)`–`(H6)` tag — that is the Blueprint spec, not a bug.
- **Windows builds may fail extracting electron-builder's `winCodeSign`**, because that
  archive contains macOS symlinks and standard accounts cannot create symlinks. Either
  enable Developer Mode, or pre-extract the archive without its `darwin/` tree into
  `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`.

## Secrets and the OAuth consent screen

**The Google client secret is not in the repo.** Locally it lives in gitignored
`.env.local` as `MAIN_VITE_GOOGLE_CLIENT_SECRET`; `.env.example` documents it with an empty
value. CI injects it from the GitHub Actions secret of the same name at build time.

Two consequences:

1. **Repository secrets do not follow a repository transfer.** If this repo moves to the
   eCampus org, `MAIN_VITE_GOOGLE_CLIENT_SECRET` must be re-added there, or the builds will
   silently ship a broken Google sign-in.
2. **Because the repo and its release assets are public, the client secret is extractable
   from an installer.** That is tolerable only because of the two controls below. Do not
   treat it as confidential; treat the controls as the actual security boundary.

**The OAuth consent screen must stay in "Testing" — do not publish it.** Every user has to
be added individually under **Test users** in the Google Cloud console. This is deliberate:
it is what stops the extractable client ID/secret from being usable by anyone else.
Onboarding a new user means adding their Google address there. Combined with PKCE, this is
what makes public distribution acceptable.

**Keep the scope at `drive.file`.** Anything broader would require Google verification and
would give the app far more access than it needs.

## Releasing

1. Bump `version` in `package.json`, commit, and tag `vX.Y.Z`.
2. Push the tag. `.github/workflows/release.yml` builds Windows and macOS on a matrix,
   renames the installers to the layperson-friendly names, generates release notes from a
   template, and publishes.
3. Check the release page — the notes lead with a "Which file do I download?" table, and
   the install steps name the exact on-screen warning each OS shows.

If the release job stalls (it has), you can publish by hand: download the workflow
artifacts, rename them by the same rules the workflow uses, create the release, and upload
assets **one at a time** — uploading all three in a single `gh release create` has timed
out and left a draft behind.

The in-app update check (`electron/ipc/updateCheck.ts`) reads the GitHub releases API for
the newest tag and compares it against `app.getVersion()`. It only notifies; it does not
download or install anything. If full auto-update is ever wanted, `electron-updater` would
need code signing on both platforms, which needs a paid Apple Developer account — that was
the reason it was not done.

## Open items

- The Mac builds have never been launched. macOS `safeStorage`/Keychain and the OAuth
  loopback listener are unverified there, as is whether an unsigned arm64 build opens at all.
- Transfer to the eCampus GitHub org — remember the secret.
- Rate-limit backoff (403) and surfacing rubric fetch failures as errors are both still to do.
