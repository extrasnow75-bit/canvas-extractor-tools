## What's new in v1.1.0

Since v1.0.1:

- **New tool: Settings extraction to Google Sheets.** Reads course, assignment, discussion and quiz settings from Canvas and writes them into the eCampus Settings Table layout — one tab per item — as a Google Sheet with working checkboxes and dropdowns, or as a local `.xlsx`. Tabs are formatted like the workbook: blue "finalized" bar, grey primary rows, purple placeholders that turn black once a value is filled in, linked template references. Fields whose Canvas source could not be confirmed keep the template placeholder rather than a guessed value.
- **Canvas tool lines now read `Assignment ⏺ Link to settings tab`** in the content export, matching the updated Blueprint template — on every tool, Page included, with no semicolon. Tool names follow the Blueprint dropdown: Assignment, Assignment (Not Graded), Discussion, Page, Quiz (Classic), Quiz (New).
- **Links back into Canvas are highlighted cyan** in the content export — files, pages, discussions, assignments, anything on the course site — so designers can see at a glance which links QA, Build and CAS will not be able to open and need re-pointing. External links (YouTube, publishers, Drive) and the template's Instructor Information / Course Resources / Course Questions buttons are left alone.
- **Grey highlight on tool names replaced by the ⏺ marker,** which stays visible when a paragraph is later highlighted green for QA.
- **Web addresses inside error messages are now clickable** and reachable by keyboard, and long messages wrap inside the tile instead of stretching it.
- **Mac version now available** for both Apple Silicon and Intel Macs, with the title bar and update check adjusted for macOS. The build is unsigned, so see the Mac install steps below for the one-time first-launch step.
- Build-tool dependency updates flagged by Dependabot.
