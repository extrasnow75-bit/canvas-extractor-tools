# Privacy Policy: Canvas Extractor Tools

_Last updated: November 4, 2026_

Canvas Extractor Tools is a desktop app. It runs on your own computer and copies the content of a Canvas course into a document, spreadsheet or file that you choose. This page explains what information the app uses and where it goes.

## The short version

- The app runs on your computer. It has no server of its own.
- The developer does not receive, see or store your Canvas content, your Google files, or your sign-in details.
- The app does not use analytics, advertising or tracking.

## What the app uses, and why

**Your Canvas access token.** You paste a Canvas API token into the app so it can read the course you choose. The token is stored on your computer, encrypted with your operating system's secure storage (the Windows Credential Manager or the macOS Keychain). It is sent only to your Canvas site. You can remove it at any time with the "Remove token" button in the app.

**Your Canvas course content.** The app reads course content (pages, assignments, discussions, quizzes, rubrics and settings) from your Canvas site, using your token. This happens on your computer. The content is turned into a file that is saved on your computer, or into a Google Doc or Google Sheet in your own Google Drive.

**Your Google account (optional).** If you choose to sign in with Google, the app asks for these permissions:

- `drive.file`: to create files in your Google Drive and to open only the files the app itself created. The app cannot see any other file in your Drive.
- `openid`, `email` and `profile`: to show your name, email address and picture in the app so you can see which account is signed in.

Your Google sign-in is stored on your computer, encrypted with your operating system's secure storage. You can sign out in the app at any time, and you can remove the app's access in your Google Account settings under "Third-party apps & services".

**Checking for updates.** The app asks GitHub for the version number of the latest release, so it can tell you when a newer version is available. This is an ordinary web request to GitHub. No information about you or your courses is included.

## What the app does not do

- It does not send your Canvas content, Google files or sign-in details to the developer or to any other party.
- It does not read or change any Google Drive file other than the ones it creates.
- It does not change anything in your Canvas courses.
- It does not sell or share information, and it does not show advertising.

## Google API Services User Data Policy

The app's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

## How long information is kept

The app keeps your sign-in details on your computer until you sign out, remove the token, or uninstall the app. Files the app creates in your Google Drive or on your computer belong to you and stay until you delete them.

## Changes to this policy

If this policy changes, the updated version will be posted at this address with a new date at the top.

## Contact

Questions about this policy: please open an issue at https://github.com/extrasnow75-bit/canvas-extractor-tools/issues
