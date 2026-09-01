# Tutor Notes

A local Windows desktop app for tutoring notes. Uses local storage only. Made with cursor.

## Run in development

You need [Node.js](https://nodejs.org/) (LTS) and [Rust](https://rustup.rs/).

```bash
npm install
npm run tauri dev
```

## Windows installer

```bash
npm run tauri build
```

The installer is written to `src-tauri/target/release/bundle/nsis/`. The `.exe` itself is in `src-tauri/target/release/tutor-notes.exe`.


## Backup

Typical path for storage:

```
%APPDATA%\com.tutornotes.organizer\
```

That folder contains `tutor.db`, `media\`, and `pdfs\`. Restore probably requires a full restart.

## Google Sheets import

Import support for google sheet tables. Rigid, created for my own purposes.

## Shortcuts

- `Ctrl+K` command palette and search
- `Ctrl+1` students
- `Ctrl+2` topics
- `Ctrl+3` resources
