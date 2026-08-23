# **Canvas Extractor Tools**

## Draft KB Article

*Replaces: [The eCampus Content Export Tool (Canvas to Google Doc)](https://boisestateecampus.atlassian.net/wiki/spaces/EKB/pages/3503652868/The+eCampus+Content+Export+Tool+Canvas+to+Google+Doc). That article describes the Google Colab Notebook version, which this app supersedes.*

# **Introduction**

The purpose of this tool is to save the IDC time copying and pasting out of Canvas when an instructor would like to reuse material from a previously-taught course.

Canvas Extractor Tools does what the old Content Export notebook did, and adds two more extractions: **quiz questions** and **rubrics**. Those used to require a separate app, separate code, or manual copy and paste.

What the tool produces is a **starting point** for the IDC to organize the blueprint and easily copy/paste the components the FD has indicated as wanting to keep or review. **The extracted content in the blueprint will be reviewed by the IDC and FD.**

The tool is **read-only against Canvas**. It never edits, publishes, or deletes anything in a course. The only thing it creates is a Google Doc in your own Drive.

# **⚒️The Tool**

The old tool was a Google Colab Notebook that ran in a browser tab. **This one is a desktop app that you install on your computer.** It does not require any coding tools or know-how to use.

**Download:** [Canvas Extractor Tools releases page](https://github.com/extrasnow75-bit/canvas-extractor-tools/releases/latest)

Download `Canvas-Extractor-Tools-WINDOWS-<version>.exe` and double-click it to install.

**This app is Windows only.** There is no Mac version. If you work on a Mac, contact the eCampus Center.

**You will see a security warning the first time you open it** — *"Windows protected your PC"*. Click **More info**, then **Run anyway**. The app is distributed directly rather than through the Microsoft Store, so Windows does not recognize the publisher yet. This is expected and it goes away after the first launch.

## 🔑What You Need Before You Start

**1\. A Canvas access token.** A token is a long string of characters that acts as an ID and a password in one. You create your own:

> In Canvas, go to **Account → Settings**, scroll to **Approved Integrations**, click **\+ New Access Token**, give it a purpose such as "Canvas Extractor Tools," leave the expiry blank, and click **Generate Token**. **Copy the token immediately** — Canvas will not show it to you again.

The token gives the app exactly the Canvas access you already have — no more. It is stored encrypted on your own computer and is never sent anywhere except Canvas.

**2\. Google sign-in access — only if you want the Google Doc output.** Google sign-in is currently limited to an approved list of accounts. **Contact the eCampus Center to be added before your first use**, or sign-in will fail with a message about the app not being verified. The alternative output, a local HTML file, needs no Google account at all.

## 🖥️Why a Desktop App and Not a Notebook?

A Canvas token is sensitive: anyone holding it can act as you in Canvas. When a tool like this runs in a web browser — a web app or a Colab Notebook — that token has to live in the browser, alongside every extension, tab, and script that browser is running.

This app keeps the token on your own computer instead, encrypted and tied to your sign-in, and talks to Canvas directly.

# **✅What Is Extracted**

You choose **one** of three extractions each time you run the app. Each one produces its own document.

## Course content

* Content from pages and assignments in the order they appear on the course's **Modules** page
* Home page and syllabus
* Discussions and quiz **instructions** (not quiz questions — that is the second extraction)
* Blueprint markup tags (e.g. **H2**, **H3**, **Assignment**, **Page**...)
* Stylized HTML, named in red bold above the block it applies to (e.g. **\[Callout Box\]**, **\[Styled Dropdown\]**, **\[Styled Table\]**, **\[Alert Box\]**). The styling itself does not survive the trip out of Canvas, so the marker is what tells you a template was used. Anything not built from a template in the **HTML Templates** article — hand-written styling, buttons — comes through unmarked.
* Due-date headers, with the blue Blueprint rules
* Images
* Video URLs
* Links (*not access to*) Canvas Files, course links, etc.

## Quiz questions *(new)*

Every question and answer choice from a **Classic quiz**, with the correct answers marked. Supported question types:

* Multiple Choice
* Multiple Answer (select all that apply)
* True / False
* Essay
* Short Answer
* Fill in Multiple Blanks
* Matching
* Numerical

Any other question type is skipped, and a note at the end of each quiz tells you how many were left out.

## Rubrics *(new)*

Every rubric in the course, as a table — criteria down the side, rating levels across the top, points per criterion, and a total.

# **🛑What Is Not Extracted**

* Settings associated with assignments, quizzes, etc.
* **New Quizzes** questions — Canvas stores New Quizzes differently, and the app does not extract their questions. Each one appears in the document with a note saying so, and the summary tells you how many were found, so none go by unnoticed. Classic quizzes are fully supported.
* Alt tags on images
* H5P content; content stored in Perusall or other LTI apps
* Access to the Files stored in Canvas
* A perfectly formatted blueprint

# **👷What You May Have To Do After The Extraction**

* Add paragraph breaks within pages and assignments
* Clean up some formatting (bold heading text within pages and assignments, for example)
* Get New Quizzes questions through another method or by manual copy and paste
* Add build notes for links that point to Canvas files or course content (e.g.: Add link to Discussion Guidelines page in Course Resources)
* Check any item marked with a purple **"check manually"** note — that item's text came back empty from Canvas

# **📋How To Use It**

**First run only:** paste your Canvas token into the setup panel, and — if you want Google Doc output — click **Sign in with Google**. Both are remembered.

**Every run:**

1. Paste the course URL, e.g. `https://boisestatecanvas.instructure.com/courses/12345`. Copy it from your browser's address bar while you are in the course. The course name appears once the app confirms it.
2. Pick an extraction: **Course content**, **Classic quizzes**, or **Rubrics**.
3. Extract everything, or tick specific items.
4. Choose **Extract all to a Google Doc** or **or save a local copy (.html)**.
5. Wait. A progress line names each item as it is fetched, and **Stop** cancels between items. A large course takes a few minutes.

When it finishes, the Google Doc opens in your browser. It is a normal Doc in your own Drive — edit, share, or move it however you like.

# **🔧Troubleshooting**

| What you see | What to do |
| :---- | :---- |
| "Token expired" or "Action needed" | Canvas tokens can be revoked or expire. Create a new one and paste it in. |
| Google sign-in stops working | Sign in again from the setup panel. The app clears the dead sign-in for you. |
| "Not a recognized Canvas course URL" | The URL must contain `/courses/` followed by the course number. |
| The extraction seems to pause | Canvas limits how fast it answers. The app waits and carries on by itself. Stop still works while it waits. |
| The extraction stops partway | Read the message it shows — rate limiting alone no longer stops a run. Try again, and if it stops the same way, send that message to the eCampus Center. |
| A rubric looks blank | If a rubric genuinely could not be loaded, the document says so in its place. A rubric with no criteria in Canvas comes through empty because it is empty. |
| Text is too small to read | Use the text size buttons in the app's top bar. |

# **🔄Updates**

The app checks for a newer version when it starts and shows a bar at the top if one exists. You can also check any time from **Help Center → Updates → Check for updates**.

Updates are never installed automatically. Download the new installer and run it over the top of the old version — your token and Google sign-in are kept.

**Do not uninstall the old version first, and accept the folder the installer offers.** The installer finds the existing copy and replaces it. If you browse to a different folder instead, you end up with two versions installed side by side and no way to tell which one you are opening. Close the app before you run the installer.

# **📄Related References**

* [Template Blueprint 5.0](https://docs.google.com/document/d/1FONxZaZr2HEIM3sc7GNBcLtsB6U-KtCVJ5S2K3uiEtE/edit?usp=drivesdk) — content extraction
* [Quiz Questions Extraction Template](https://docs.google.com/document/d/1zm9yRGtg4u9C3ddOVX7iNGrGp8gxDCrj9rbFY4GUtDM/edit?tab=t.0#heading=h.qet84pprm5t9) — quiz extraction
* [Required Formatting for Quiz Questions](https://docs.google.com/document/d/1SrLp9OKCKJJm86jJEFGnClhvS86MI6qp1YqhI1jHA4M/edit?usp=drivesdk) — quiz extraction
* [Rubric Example Point Ranges (MS Word version)](https://docs.google.com/document/d/1YAs6TdSfRIpRXyKyQWSFc-VtgZ39gbYgnWdVtHZBDT4/edit?tab=t.0#heading=h.4v5p1vp9zrcz) — rubric extraction

# **💭Feedback**

If you would like to request a new feature or need to report a bug, please fill out the [Feedback Form](https://docs.google.com/forms/d/e/1FAIpQLSdFUggIwFgsqgVtydF8wEy_hnzBq6q3M09n4Hs3CniR_Gx8NQ/viewform).

There is also an [App Suggestions Document](https://docs.google.com/document/d/1-ib0yAB_88SBk2aWnOflGNH8OFe3LQefaHYJSKjea0E/edit?tab=t.0#heading=h.bz7nzkw7vn22) linked from inside the app.

---

# **🔩Maintenance**

*Audience: whoever takes over this app. You do not need a computer science degree — you need to be comfortable installing things, running commands, and reading code with an AI assistant's help. This section explains **why** things are the way they are, because most of the traps here are invisible until you trip over them.*

## Getting it running

**Repo:** [github.com/extrasnow75-bit/canvas-extractor-tools](https://github.com/extrasnow75-bit/canvas-extractor-tools)

You need [Node.js](https://nodejs.org) (the LTS version) and git. Then:

```
git clone https://github.com/extrasnow75-bit/canvas-extractor-tools.git
cd canvas-extractor-tools
npm install
npm run dev
```

`npm run dev` opens the app with live reload — save a file and the window updates. Other commands:

| Command | What it does |
| :---- | :---- |
| `npm run dev` | Run the app locally with live reload |
| `npm run typecheck` | Check for type errors. **Run this before committing.** |
| `npm test` | Run the test suite once. **Also run this before committing.** |
| `npm run test:watch` | Re-run tests automatically as you edit |
| `npm run build` | Build a real installer into `release/` |

`npm run lint` exists in `package.json` but has never worked — eslint is named in the script and was never installed as a dependency. Either install it or delete the script; right now it just fails.

`npm run dev` will not catch every problem — see "Things that only break in the real build" below.

## How the app is put together

It's an **Electron** app: a Chrome browser and a Node.js program bundled together and shipped as a desktop app. That gives you two halves, and the difference between them is the single most important thing to understand here.

| | What it is | Where it lives |
| :---- | :---- | :---- |
| **Main process** | The Node.js half. Can touch the filesystem, the network, and the operating system. | `electron/` |
| **Renderer** | The Chrome half. The user interface — React and Tailwind. | `src/` |

The renderer is **sandboxed**: it cannot make network calls or read files directly. When the UI needs something done, it asks the main process through a small, fixed list of messages defined in `electron/preload.ts`. This is called **IPC** (inter-process communication).

**Every single call to Canvas and Google happens in the main process.** This is not a style preference. The renderer is the part that displays HTML pulled out of Canvas courses, which means it's the part most likely to end up running something it shouldn't. Keeping the tokens and the network on the other side of that wall is what limits the damage. If you find yourself adding a `fetch()` inside `src/`, stop — that's the wall coming down.

## The four rules not to break

These all look like they could be simplified. Each one is load-bearing, and removing any of them fails **silently** — the app keeps working and just becomes unsafe.

**1. Never return a Google token to the renderer.** No IPC handler hands one over; `google:status` returns only the display name and picture. The Canvas token *is* given to the renderer (it's passed back on each extraction call) — that asymmetry is deliberate, but it's exactly why the other three rules matter.

**2. `app:openReleases` takes no URL.** It opens one hardcoded address. The moment you let the renderer pass in a URL, you've handed it a general-purpose "open anything" button.

**3. `openExternalSafely()` allows only `http:` and `https:`.** `shell.openExternal` hands a URL to the operating system, which launches whatever is registered for that scheme. A `file://` URL can reach an executable, and Windows protocol handlers (`ms-msdt:` and friends) have caused real remote-code-execution bugs. Scheme-checking is the whole defense.

**4. `savePaths.ts` — only write to a path the save dialog actually issued.** The renderer sends the save location back as an ordinary string, and a string proves nothing about where it came from. The main process remembers which paths it handed out and refuses anything else.

## If you change the HTML parsing, read this first

Most of this app is regular expressions run over HTML that course authors wrote. That is where
essentially every bug found so far has come from, and they keep arriving in the same two shapes.
Neither is obvious, and both look fine in testing until they don't.

**1. `[^>]*` does not mean "the rest of the tag."** It means "up to the first `>` anywhere,"
including a `>` inside an attribute value. Course authors put `>` in `title` and `aria-label`
attributes all the time. So `<h2 title="a > b">Heading</h2>` matched only as far as that inner
`>`, and the leftover `b">` was carried into the finished document as visible text. The same
defect has now been found and fixed three separate times in this codebase.

The fix is to match quote-aware, which is what `OPEN_TAG_RE` in `styledHtml.ts` and `HEADING_RE`
in `blueprintFormat.ts` do. Copy the shape from one of those rather than writing a new one:

```
(?:[^>"']|"[^"]*"|'[^']*')*
```

Read it as: any character that is not a quote or `>`, **or** a complete double-quoted string,
**or** a complete single-quoted string — repeated. Because a quoted run is consumed whole, a `>`
inside it cannot end the tag.

**2. That same pattern is slow on broken HTML.** When a tag never reaches its closing `>`, the
regex scans to the end of the text from every position it could start at. The cost grows with
the square of the length, so it stops being a delay and becomes a hang: measured at 3.4 seconds
for 176 KB of unterminated heading tags, and roughly nine minutes at 2 MB. This runs on the same
thread as the window, so the app freezes — including the Stop button, so the user cannot even
cancel.

Every such scan is therefore capped by `MAX_SCANNED_BODY_BYTES` (100 KB, defined once in
`styledHtml.ts`). Above the cap the text still comes through in full; only the annotation is
skipped. **If you add a new scan, put it under the same cap.** No real course page is anywhere
near 100 KB, so this costs nothing in practice and removes the whole failure mode.

**3. Escape last, and escape everything.** Where course text is turned into plain text —
`richTextToHtml()` in `rubricExport.ts` is the example — tags are stripped first and *then* every
resulting line is escaped. That ordering is what makes it safe: even if the stripping misses
something malformed, the escape on the way out means no tag from a course can become live markup
in the finished file. A security review threw about 900,000 hostile inputs at it without finding
a way through. Keep the ordering if you touch it.

## Check Canvas's actual responses, not just its documentation

The Canvas API docs are thin in places and occasionally imply something untrue. Two examples
that cost real time, both now pinned by `electron/ipc/__fixtures__/rubrics-list-response.json` —
a real response captured from the demo course:

* `criterion_use_range` comes back as **null**, not `false`, on rubrics that do not use point
  ranges. Code written against a `true`/`false` assumption would be wrong.
* The rubrics **list** endpoint already returns each rubric's full criteria, despite a comment
  in this codebase asserting for a long time that it did not.

When you need to know what a Canvas endpoint really returns, look at it directly. Take any
course URL, change `/courses/` to `/api/v1/courses/`, and open it in a browser where you are
already signed in to Canvas — it returns raw JSON using your existing session, no token needed.
If you are relying on the answer, save it under `__fixtures__` with a note saying which claim it
supports, so the next person does not have to take your word for it.

## Things that only break in the real build

`npm run dev` and the installed app differ in ways that will bite you.

**Every `file://` URL has the origin `"null"`.** This one cost real time. In dev, the UI is served over `http://localhost`, so it has a normal origin. In the packaged app it's loaded from disk with `loadFile`, so its origin is the literal string `"null"` — and so is *every other local file's*. The navigation guard originally compared origins, which meant that in the shipped app, any local file matched. It worked perfectly in dev and protected nothing in production. `isOwnPage()` now compares the full file path instead. **If you touch that function, test it in a packaged build** — `npm run dev` cannot reproduce the bug.

**The Content Security Policy is only injected at build time.** A Vite plugin in `electron.vite.config.ts` adds it with `apply: 'build'`, so live reload isn't broken during development. It also means you won't see CSP violations until you build.

## Where to change things

| If you want to change... | Start here |
| :---- | :---- |
| Blueprint formatting — fonts, colors, tags, spacing | `electron/ipc/blueprintFormat.ts` (all constants and HTML helpers live here) |
| What the course content export includes | `electron/ipc/canvasExport.ts` |
| Quiz question handling and question types | `electron/ipc/quizExport.ts` |
| Rubric tables | `electron/ipc/rubricExport.ts` |
| Talking to Canvas — pagination, retries, cancelling | `electron/ipc/canvasUtils.ts` |
| The formatting pass after upload to Google | `electron/ipc/googleDocs.ts` |
| Help Center text | `src/components/HelpCenter.tsx` |
| The token / sign-in panel | `src/components/SetupPanel.tsx` |
| The app icon | Edit `resources/icon.svg`, then re-run `make-icon.py` |

## Gotchas that cost real time

* **Google Docs cannot import a paragraph border.** Instead of ignoring it, its HTML importer turns one into a separate grey line — so the blue Blueprint rules around each "Due by..." header came out as grey lines above and below. The fix: emit no border CSS on the Drive path, then draw the real blue rules through the Docs API *after* upload (`applyDueHeaderBorders()`). The local HTML extraction keeps the CSS borders, because nothing runs afterwards there.
* **Canvas signals rate limiting with HTTP 403, not 429.** 429 is the normal code for "slow down" everywhere else, so any retry logic you write by habit will be wrong. Key on 403 — but not on 403 alone: a genuine permissions failure carries the same status, and retrying one of those just hammers Canvas and fails anyway. The body is what separates them; Canvas sends the bare string "403 Forbidden (Rate Limit Exceeded)". This is implemented in `canvasUtils`.
* **Google Docs sizes table columns from the first row, and does not expand `rowspan` or `colspan` when it does.** A rubric table used to have a two-row header — "Criteria / Ratings / Points" above the individual level names — using spans. Five columns, but the first row held only three cells, so the last two columns got no width at all and collapsed to about one character wide. A two-page rubric came out as fourteen pages of vertical text. The fix was a single flat header row plus an explicit `<colgroup>`, which states one width per real column where no span can interfere. **If a table comes out with unreadable columns, look at spans in its first row before anything else.**
* **Google Docs repeats a table's header row across page breaks on its own.** `rubricExport.ts` emits no `<thead>`. If you see an "untitled" rubric table, it's the continuation of the one above it, not a bug.
* **Canvas headings inside item bodies** become bold black 11pt text plus a red `(H1)`–`(H6)` tag. That's the Blueprint spec, not a formatting error.
* **Windows builds can fail while extracting `winCodeSign`.** That archive contains macOS symlinks, and standard Windows accounts can't create symlinks. Either turn on Developer Mode, or pre-extract the archive without its `darwin/` folder into `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`.

## Secrets and the Google consent screen

**This is the part most likely to go wrong under a new maintainer.**

The Google client secret is **not** in the repo. On your machine it lives in `.env.local` (which is gitignored) as `MAIN_VITE_GOOGLE_CLIENT_SECRET`. `.env.example` shows the shape with an empty value. When GitHub builds a release, it injects the secret from a **GitHub Actions secret** of the same name.

Two consequences:

1. **GitHub Actions secrets do not follow a repository when it moves.** If this repo is transferred to the eCampus org, `MAIN_VITE_GOOGLE_CLIENT_SECRET` must be added again on the other side, or the builds will quietly ship with Google sign-in broken.
2. **Because the repo and its installers are public, anyone can extract that client secret from a release.** Treat it as public. The actual security boundary is the two controls below.

**Do not publish the OAuth consent screen. It must stay in "Testing."** Every user has to be added by hand under **Test users** in the Google Cloud console — that's why onboarding someone means adding their Google address there. It looks like a limitation to remove; it's the thing that stops the extractable client ID and secret from being usable by anyone outside the approved list. Combined with PKCE, it's what makes public distribution acceptable.

**Keep the Google scope at `drive.file`.** That's "only the files this app created." Anything broader triggers a Google verification review and gives the app far more access to people's Drives than it needs.

## Releasing a new version

1. Bump `version` in `package.json`.
2. Commit, then tag it: `git tag v0.12.0` and `git push origin v0.12.0`.
3. Pushing the tag triggers `.github/workflows/release.yml`, which builds the Windows installer, renames it to the friendly name users see, writes the release notes, and publishes. Takes about three minutes.
4. Check the release page afterwards.

The version number and the tag must match, and **the tag is what actually triggers the build** — pushing a version bump without a tag does nothing.

**Do not skip step 1.** It is the one mistake here that does not announce itself. If you tag a new release without bumping `version` in `package.json`, everything appears to work: the build passes, the release publishes, the installer is on the page and installs correctly. But every copy already out there compares its own version against the newest release, sees the same number, concludes it is current, and never shows the update banner. The fix reaches nobody, and nothing anywhere reports an error. If you are ever unsure whether you bumped it, check the version shown in the app's own window against the newest tag on GitHub.

The workflow runs `npm run typecheck` and `npm test` before it builds, so a broken parser fails the release instead of shipping inside an installer. If a release fails at the Test step, read the failure rather than working around it — those tests exist because each one corresponds to a bug that reached a real document.

If the build job stalls (it has), you can publish by hand: download the workflow artifact, rename it the way the workflow does, create the release, and upload the asset. When there were three assets, uploading them all in a single `gh release create` timed out and left a broken draft behind; with one this is less likely, but upload separately if it happens again.

The in-app update check (`electron/ipc/updateCheck.ts`) reads GitHub's releases API and compares the newest tag against the installed version. It only *notifies* — it never downloads or installs. Real auto-update would need code signing, and the build is unsigned, so an install prompt would appear either way. That's the only reason it isn't there.

## Known gaps and open items

* **New Quizzes questions are not extracted, but not because Canvas can't.** Canvas does publish a New Quizzes API at `/api/quiz/v1/courses/:course_id/quizzes/:assignment_id/items` — a different API surface from the `/api/v1/` one this app uses everywhere else, and keyed by the **assignment** id rather than a quiz id. The app simply doesn't call it yet. Other people have reported difficulty getting these calls to work, so treat feasibility as unproven until someone tests it against Boise State's Canvas with a real token.
* **Classic question banks genuinely have no public API.** Unlike New Quizzes, there's no supported way to list a bank or its contents. Note also that a quiz using a random-draw question group doesn't *contain* questions at all — it stores a rule ("draw 5 from Bank X"), so there's no fixed list to extract. Those quizzes currently come through looking empty, which is misleading.
* **macOS is not supported, and the CI no longer builds for it.** The Mac builds were published for several releases and never worked; nobody has launched one successfully. Keychain-based token storage and the Google sign-in loopback are both untested there, and whether an unsigned build opens at all is unknown. The `mac` target is still configured in `package.json`, so anyone with a Mac to test on can still build one locally — reviving it means restoring the os matrix in `release.yml`.
* **Transfer to the eCampus GitHub org** — remember the Actions secret.
* **Rate-limit backoff and rubric failure reporting are both done.** `canvasUtils` retries on a rate-limit 403 with a backoff that sleeps in slices, so Stop is noticed during a wait rather than after it, and a rubric that cannot be retrieved gets an explicit note in the document saying it is not an empty rubric. Extractions also run four requests at a time rather than strictly serially.
* **The per-rubric detail fetch is redundant and should go.** `buildRubricsHtml` calls the rubrics list endpoint and then fetches each rubric again for its criteria. The list response already carries full `data` — see `electron/ipc/__fixtures__/rubrics-list-response.json`, captured from the demo course. Worse than wasteful: the two endpoints resolve rubrics differently (`index` over the course's own rubrics, `show` through bookmarked rubric associations), so the detail call can 404 on a rubric the list returned fine, producing a "could not be retrieved" note for criteria the app was already holding. Verify that against Canvas source before changing it.
