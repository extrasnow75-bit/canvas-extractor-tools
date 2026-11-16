# Privacy Policy: Canvas Extractor Tools

_Last updated: November 16, 2026_

Canvas Extractor Tools is a desktop app. It runs on your own computer and copies the content of a Canvas course into a document, spreadsheet or file that you choose. This page explains what information the app uses and where it goes.

## The short version

- The app runs on your computer. It has no server of its own.
- The developer does not receive, see or store your Canvas content, your Google files, or your sign-in details.
- The app does not use analytics, advertising or tracking.

## What the app uses, and why

**Your Canvas access token.** You paste a Canvas API token into the app so it can read the course you choose. The token is stored on your computer, encrypted with your operating system's secure storage (the Windows Credential Manager or the macOS Keychain). It is sent only to your Canvas site. The Boise State Canvas site is trusted by default; for any other Canvas address, the app asks you once, in a pop-up window, whether your token may be sent there. You can remove the token at any time with the "Remove token" button in the app.

**Your Canvas course content.** The app reads course content (pages, assignments, discussions, quizzes, rubrics and settings) from your Canvas site, using your token. This happens on your computer. The content is turned into a file that is saved on your computer, or into a Google Doc or Google Sheet in your own Google Drive.

**Your list of courses.** If you use "Choose from my courses", the app asks your Canvas site for the list of courses where you are a teacher, a teaching assistant or a designer, and the name of your role in each, so you can pick a course instead of pasting its web address. The list is shown in the app. It is not saved and is not sent anywhere else.

**Your Google account (optional).** If you choose to sign in with Google, the app asks for these permissions:

- `drive.file`: to create files in your Google Drive and to open only the files the app itself created. The app cannot see any other file in your Drive.
- `openid`, `email` and `profile`: to show your name, email address and picture in the app so you can see which account is signed in.

The app also edits the Google Docs it created, for example to turn the Canvas tool names and icon labels into dropdown menus, to start modules on a new page and to draw the blue lines above and below "Due by" headings. It does not open or edit any other document.

Your Google sign-in is stored on your computer, encrypted with your operating system's secure storage. You can sign out in the app at any time, and you can remove the app's access in your Google Account settings under "Third-party apps & services".

**Checking that videos still exist.** When a course page links to or embeds a YouTube or Vimeo video, the app asks that service whether the video still exists, so a deleted video can be marked in the document, and so a video the course did not name can be given its title. Only the video's public web address is sent. Your Canvas token, your Google sign-in, the course name and your name are not. If the service cannot be reached, nothing is marked or renamed. Videos on other services, such as Panopto, are not checked.

**Checking for updates.** The app asks GitHub for the version number of the latest release, so it can tell you when a newer version is available. This is an ordinary web request to GitHub. No information about you or your courses is included.

## What the app does not do

- It does not send your Canvas content, Google files or sign-in details to the developer or to any other party. The only things it sends to anyone other than Canvas, Google and GitHub are the public web addresses of YouTube and Vimeo videos, to check that they still exist.
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
