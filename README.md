# Tutor Notes

A local Windows desktop app for tutoring notes. Made with cursor.

Live data stays in `%APPDATA%\com.tutornotes.organizer\` (`tutor.db`, `media\`, `pdfs\`). Imported scans and large photos are compressed and stored once by content hash.

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

## Sync between computers

1. On the first computer, open **Settings → Sync**, choose a folder inside OneDrive, Dropbox, or another already-synced drive, then **Push this computer**.
2. On the second computer, choose that same folder (its local OneDrive/Dropbox path) and **Pull (replace this PC)** the first time.
3. After that, this computer pulls on startup if the folder is newer and you have not edited locally, and pushes on quit and about once a minute while you hold the lock.

Keep the working copy in AppData. Do not point the live `tutor.db` at the cloud folder by hand (WAL + two open copies can corrupt it). Do not copy `tutor.db-wal` or `tutor.db-shm`.

If both copies are open, the computer that holds `tutor.lock` is the writer. The other copy can stay open but will not push. Use **Take over lock** if the other app was left open or crashed.

**Optimize library** recompresses existing scan PDFs and drops duplicate files. New imports are optimized automatically.

## Google Sheets import

Import support for google sheet tables. Rigid, created for my own purposes.

## Shortcuts

- `Ctrl+K` command palette and search
- `Ctrl+1` students
- `Ctrl+2` topics
- `Ctrl+3` resources
