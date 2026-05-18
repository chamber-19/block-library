# Block Library — Agent Guide

## What this is

Block Library is a Tauri 2 desktop application for browsing the Chamber 19 AutoCAD block catalog stored in Google Drive. Engineers can browse blocks by category, search by name, and preview both DXF and DWG files in an interactive viewer with **2D (orthographic top-down) and 3D (perspective orbit) modes** powered by Three.js + React Three Fiber. DWG files are converted to DXF on the fly by an AutoCAD .NET plugin (`processor/DwgConverter` → `BlockLibrary.AcadPlugin.dll`) that the Rust shell loads into `accoreconsole.exe` via NETLOAD. When AutoCAD or the plugin DLL is unavailable, the UI falls back to "Preview not available."

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

## DXF rendering + DWG via local AutoCAD plugin

DXF files are parsed client-side using the `dxf` npm package (`parseString`)
and rendered with Three.js. There is no server-side conversion — that ban
still stands.

DWG support is handled by a **local AutoCAD .NET plugin**, not a server:

- `processor/DwgConverter/` — .NET 8 class library targeting the Autodesk
  `acdbmgd` / `acmgd` / `accoremgd` assemblies (`Copy Local = False`). It
  exposes `[CommandMethod("BLDWG2DXF")]` and `[CommandMethod("BLPING")]`.
- The Rust side downloads the DWG bytes from Drive, writes a sanitized
  temp file, generates a one-shot `.scr` script that NETLOADs the plugin
  and invokes `_BLDWG2DXF <input> <output>`, then spawns
  `accoreconsole.exe`. It scrapes stdout for the plugin's `BL_OK:` /
  `BL_ERROR:` markers and reads the resulting DXF from disk. The
  returned DXF is cached in the same `dxf_cache` table as native DXFs.
- If `frontend/src-tauri/resources/BlockLibrary.AcadPlugin.dll` is absent
  *or* `accoreconsole.exe` is not in a known AutoCAD install path, the
  `dwg_converter_available` Tauri command returns false and the viewer
  shows "preview not available" instead of attempting conversion.
- The plugin follows the Chamber 19 AutoCAD .NET conventions from
  `AUTOCAD_DOTNET.md` (headless `Database`, `ReadDwgFile`, transaction
  wrapping for any future entity modifications, no COM, `Copy Local = False`
  on Autodesk assemblies). See `processor/README.md` for build and
  packaging instructions.

ODA is **not** a dependency. Do not re-add the OdaMgd NuGet feed or the
Teigha namespace.

## Environment verification

```bash
# Type-check the Rust shell (from frontend/src-tauri):
cargo check

# Type-check and bundle the frontend (from frontend/):
npm run build

# Build the AutoCAD .NET plugin (from processor/, requires AutoCAD installed):
dotnet build DwgConverter.sln
```

All three commands must pass clean before any PR is considered ready.
The .NET build is only required when you touched `processor/`, and only
works on a machine with AutoCAD installed (it references host-loaded
Autodesk assemblies from the AutoCAD install directory).

## Forbidden

Do not add any of the following to this repository:

- Supabase (client library, project config, or migrations)
- Docker (Dockerfile, docker-compose.yml, .dockerignore for the new stack)
- PySide6 or any Python GUI framework
- nginx or any reverse proxy config
- Any cloud database (Postgres, MySQL, MongoDB, etc.)

Block files live in Google Drive. The local catalog cache lives in SQLite at `{app_data_dir}/block-library.db`. Nothing else.
