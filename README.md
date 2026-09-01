# Tutor Notes

A local Windows desktop app for tutoring notes: students, topic templates, and a resource library. Nothing is uploaded; everything lives on this computer.

## Run in development

You need [Node.js](https://nodejs.org/) (LTS) and [Rust](https://rustup.rs/) (already required for Tauri).

```bash
npm install
npm run tauri dev
```

## Windows installer

```bash
npm run tauri build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. The `.exe` itself is in `src-tauri/target/release/tutor-notes.exe`.

A copy from the latest successful build may also appear in the `release/` folder (gitignored).

## Backup

Copy this folder to back up students, notes, PDFs, and pasted images:

```
%APPDATA%\com.tutornotes.organizer\
```

Typical full path:

```
C:\Users\<you>\AppData\Roaming\com.tutornotes.organizer\
```

That folder contains `tutor.db`, `media\` (pasted images), and `pdfs\` (imported PDFs). Restore by quitting the app and replacing the folder.

## Import from Google Sheets

1. In Sheets: **File → Download → Microsoft Excel (.xlsx)** (or CSV).
2. In the app, open **Import**.
3. Choose the file, pick the tab, choose Students / Topics / Resources, map columns, import.

You can run the wizard once per tab.

## Shortcuts

- `Ctrl+K` command palette and search
- `Ctrl+1` students
- `Ctrl+2` topics
- `Ctrl+3` resources
