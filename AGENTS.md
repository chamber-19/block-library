# Block Library — Agent Guide

## What this is

Block Library is a Tauri 2 desktop application for browsing the Chamber 19 AutoCAD block catalog stored in Google Drive. Engineers can browse blocks by category, search by name, and preview DXF files in an interactive 3D viewer (Three.js + React Three Fiber). DWG files are listed in the catalog but cannot be previewed — they display "Preview not available."

The catalog is cached in a local SQLite database at `{app_data_dir}/block-library.db`. There is no server to run and no cloud database account required.

## Where blocks live

Blocks are stored in a Google Drive folder tree. The root folder ID and API key are injected at build time:

- Set `DRIVE_ROOT_FOLDER_ID` and `DRIVE_API_KEY` as environment variables before building.
- `build.rs` reads these variables and XOR-obfuscates the values before embedding them in the binary (same pattern as `desktop-toolkit`).
- At runtime the Rust layer decodes the values and uses them for Drive API calls. They are never present in plain text in the compiled binary or in source.

Expected Drive folder structure:

```
[Root folder — DRIVE_ROOT_FOLDER_ID]
├── Relay Panels/
├── Schematic/
├── Wiring/
├── Grounding/
├── Conduit/
├── One-Line/
├── Vendor/
├── Logic/
├── Structural/
├── Equipment/
├── Drafting Standards/
├── Stamps/
└── Logos/
```

Each category folder contains `.dxf` and/or `.dwg` files directly (no further nesting assumed by the catalog sync logic).

## What was retired and why

The previous stack used Docker, Supabase, PySide6, and nginx. This entire stack has been removed and replaced with a self-contained Tauri desktop app.

| Retired component | Reason |
|---|---|
| Docker | Not needed — the app ships as a single native binary |
| Supabase | Replaced by local SQLite; no cloud DB account or network access needed for catalog data |
| PySide6 | Replaced by Tauri 2 + React frontend |
| nginx | Not needed — there is no web server |

Do not re-add any of these components. See **Forbidden** below.

## Three.js decision

Three.js and React Three Fiber live in the `block-library` frontend only. They are **not** added to `desktop-toolkit`.

The 3D DXF viewer is specific to this app's use case. Desktop-toolkit is a shared framework consumed by multiple apps; adding a Three.js dependency there would force it on apps that have no use for 3D rendering.

## DXF-only preview

Only `.dxf` files can be rendered in the 3D viewer. DWG is a proprietary binary format with no open parser available in the browser/WebView context.

When a user selects a `.dwg` file the viewer displays:

> DWG format cannot be previewed directly. Convert to DXF for preview.

DXF files are parsed client-side using the `dxf` npm package (`parseString`). No server-side conversion step is required or permitted.

## Environment verification

```bash
# Type-check the Rust shell (from frontend/src-tauri):
cargo check

# Type-check and bundle the frontend (from frontend/):
npm run build
```

Both commands must pass clean before any PR is considered ready.

## Forbidden

Do not add any of the following to this repository:

- Supabase (client library, project config, or migrations)
- Docker (Dockerfile, docker-compose.yml, .dockerignore for the new stack)
- PySide6 or any Python GUI framework
- nginx or any reverse proxy config
- Any cloud database (Postgres, MySQL, MongoDB, etc.)

Block files live in Google Drive. The local catalog cache lives in SQLite at `{app_data_dir}/block-library.db`. Nothing else.
