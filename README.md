# Canvas Extractor Tools

Desktop app for Boise State eCampus that extracts a Canvas course to Google Docs, formatted
to match the Blueprint template so QA staff can read it without reformatting.

Three extractions, each producing one document:

| Tool | Contents |
| --- | --- |
| Course content | Home page, syllabus, and every module item in Modules-page order — pages, assignments, discussions, quiz instructions, files, external links |
| Classic quizzes | Every question and answer, with correct-answer designations |
| Rubrics | Every rubric as a table, with criteria and rating levels |

Output goes to Google Drive as a native Google Doc (opened in your browser), or to a local
`.html` file if you would rather not sign in to Google.

## Requirements

- Windows 10 or later. **Windows only** — CI publishes no macOS build. The `mac` target is
  still configured in `package.json`, so `npm run build` on a Mac still produces a `.dmg`,
  but nobody has ever launched one successfully; treat it as unverified, not as a release.
- A Canvas API access token
  ([how to create one](https://community.instructure.com/en/kb/articles/662901-how-do-i-manage-api-access-tokens-in-my-user-account))
- A Google account, only if you want the Drive extraction

## Running from source

```
npm install
npm run dev
```

Google sign-in needs an OAuth client secret that is not in this repo. Copy `.env.example`
to `.env.local` and fill in `MAIN_VITE_GOOGLE_CLIENT_SECRET`. Everything else — the Canvas
extraction and the local `.html` output — works without it.

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
sandboxed and reaches it only through the narrow API exposed in `electron/preload.ts`. The
Canvas token and the Google OAuth tokens are stored with Electron's `safeStorage`, which
uses the OS keychain.

The two credentials are not equally contained, and the difference is deliberate. The
**Google** tokens never leave the main process — no IPC handler returns one, and
`getAccessToken()` has no caller outside `electron/ipc/`. The **Canvas** token does reach
the renderer: `credentials:load` returns it and the UI passes it back on each extraction call.
So a renderer compromise would expose the Canvas token but not the Google session. Treat
that asymmetry as intentional and keep the Google side of it intact.

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

- **New Quiz questions are not extracted.** The quiz tool handles Classic Quizzes only. A New
  Quiz is listed in the document with a note saying so, and counted separately in the summary,
  but its questions are not retrieved — Canvas models New Quizzes as an assignment submitted
  through the Quizzes.Next LTI tool, and the questions sit behind an API this app does not use.
  In a content extraction the same item arrives as an assignment, so what you get is whatever
  the instructor put in its description.
- **Builds are unsigned**, so Windows SmartScreen warns on first run: **More info → Run anyway**.
  (Windows-only support is covered under [Requirements](#requirements).)
- **Item bodies over 100 KB skip annotation.** Above that ceiling a body is passed through
  without heading conversion or stylized-HTML markers. The text itself is complete; only the
  markers are missing. The limit exists because the tag scans degrade quadratically on
  malformed HTML, and they run on the same thread as the window.
- **Rubric rating descriptions lose inline formatting.** Where a rubric stores HTML rather than
  plain text — usually one that arrived by course copy — bold, italics and links are flattened
  to plain text. Paragraph breaks and list bullets are preserved. This is deliberate: passing
  course-authored markup into a file that opens from disk would carry its styling and scripts
  with it.
- **A large course can take a few minutes.** Requests run four at a time rather than one after
  another, but Canvas meters them with a leaky bucket and answers an exhausted one with a 403.
  The app backs off and retries rather than failing, which is correct but slow. Stop is
  responsive during a backoff, not just between items.

## Documentation

`docs/confluence-draft.md` is the user-facing article — how to get a Canvas token, install,
run each extraction, and troubleshoot — followed by a maintainer section covering the security
boundary, the OAuth consent-screen constraints, the release process, and the open items.

## License

MIT — see [LICENSE](LICENSE).
