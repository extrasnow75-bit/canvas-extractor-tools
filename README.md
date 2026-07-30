# Canvas Extractor Tools

Desktop app for Boise State eCampus that exports a Canvas course to Google Docs, formatted
to match the Blueprint template so QA staff can read it without reformatting.

Three exports, each producing one document:

| Tool | Contents |
| --- | --- |
| Course content | Home page, syllabus, and every module item in Modules-page order — pages, assignments, discussions, quiz instructions, files, external links |
| Classic quizzes | Every question and answer, with correct-answer designations |
| Rubrics | Every rubric as a table, with criteria and rating levels |

Output goes to Google Drive as a native Google Doc (opened in your browser), or to a local
`.html` file if you would rather not sign in to Google.

## Requirements

- Windows 10 or later
- A Canvas API access token
  ([how to create one](https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account))
- A Google account, only if you want the Drive export

## Running from source

```
npm install
npm run dev
```

Google sign-in needs an OAuth client secret that is not in this repo. Copy `.env.example`
to `.env.local` and fill in `MAIN_VITE_GOOGLE_CLIENT_SECRET`. Everything else — the Canvas
export and the local `.html` output — works without it.

```
npm run typecheck   # both tsconfigs (main + renderer)
npm run build       # packaged app and NSIS installer, into release/
```

On Windows, `npm run build` may fail while extracting electron-builder's `winCodeSign`
helper, because that archive contains macOS symlinks and creating symlinks needs a
privilege standard accounts lack. Either enable Windows Developer Mode, or pre-extract the
archive without its `darwin/` tree into
`%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`.

## How it is put together

`electron-vite` builds three bundles: the main process (`electron/`), the preload script,
and the React renderer (`src/`).

Every Canvas and Google network call happens in the **main process**. The renderer is
sandboxed and reaches it only through the narrow API exposed in `electron/preload.ts`, so
no credential is ever present in renderer code. The Canvas token and the Google OAuth
tokens are stored with Electron's `safeStorage`, which uses the OS keychain.

Google sign-in is OAuth 2.0 with PKCE per RFC 8252 — the system browser plus a short-lived
`127.0.0.1` listener. The only scope requested is `drive.file`, so the app can touch only
the documents it creates, never the rest of your Drive.

Blueprint formatting lives in one place, `electron/ipc/blueprintFormat.ts`. One piece of it
cannot be done in HTML: Google Docs' HTML importer drops paragraph borders, and the blue
rules above and below each "Due by …" module header are required by QA. Those are drawn in a
Google Docs API pass after the upload, in `electron/ipc/googleDocs.ts`.

The app icon is generated from `resources/icon.svg` by `resources/make-icon.py`, which uses
only the Python standard library. Edit the SVG, then re-run the script.

## Known limitations

- **New Quiz instructions may not be extracted.** Canvas stores New Quizzes as an
  LTI-backed assignment; the export reads that assignment's description, which is where the
  instructions usually live but not always. When it is empty the document shows a "check
  manually" note instead. Classic Quiz instructions are confirmed working.
- **Canvas rate limiting is not handled.** Canvas signals an exhausted request bucket with
  a 403, which currently aborts the whole export rather than backing off and retrying.
- **Rubric fetch failures are silent.** A rubric whose detail fetch fails is rendered as an
  empty rubric with 0 points rather than reported as an error.
- Exports are sequential — one Canvas request per module item — so a large course takes
  minutes. The Stop button cancels between items.
- Builds are unsigned, so Windows SmartScreen warns on first run: **More info → Run anyway**.
