# Block Library

A Tauri 2 desktop application for browsing the Chamber 19 AutoCAD block catalog. Engineers can browse and search blocks organized by category and preview DXF files in an interactive 3D viewer built with Three.js and React Three Fiber. DWG files are listed in the catalog and can be converted to DXF for preview via the bundled .NET sidecar (`processor/`). The catalog is cached locally in SQLite; the source of truth is a Google Drive folder tree. No server, no cloud database account required.

## Repository layout

```
block-library/
├── frontend/          # Tauri 2 + React + TypeScript desktop app
│   ├── src/           # React source (components, Three.js viewer, DXF parser)
│   └── src-tauri/     # Rust backend (Tauri commands, SQLite cache, Drive API)
└── processor/         # .NET 8 sidecar for headless DWG → DXF conversion
    └── DwgConverter/
```

## Drive folder structure

The app expects a flat two-level hierarchy under a single root Drive folder:

```
[Root folder — DRIVE_ROOT_FOLDER_ID]
├── Relay Panels/
│   ├── some-relay.dxf
│   └── another-relay.dwg
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

Each top-level subfolder maps to a catalog category. Files are `.dxf` or `.dwg` directly inside the category folder (no further nesting).

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Enable the **Google Drive API** for the project.
4. Go to **Credentials** and create an **API key**.
5. Under **API restrictions**, restrict the key to the **Google Drive API** only.
6. Share the root Drive folder (read-only) with anyone with the link, or restrict to your org.

The root folder ID is the long string in the Drive URL:
`https://drive.google.com/drive/folders/<DRIVE_ROOT_FOLDER_ID>`

## Build environment variables

Set both variables before building:

```bash
export DRIVE_ROOT_FOLDER_ID=your_folder_id_here
export DRIVE_API_KEY=your_api_key_here
```

`build.rs` reads these at compile time and XOR-obfuscates the values before embedding them in the binary. They are not present in plain text in the compiled output.

## Running in development

```bash
cd frontend
npm install
npm run desktop
```

This starts the Vite dev server and the Tauri shell together.

## Building a release binary

```bash
cd frontend
npm install
npm run desktop:build
```

The installer is written to `frontend/src-tauri/target/release/bundle/`.

## DXF preview

Only `.dxf` files can be rendered directly in the 3D viewer — DXF is parsed client-side by the `dxf` npm package. `.dwg` files are listed in the catalog and can be converted to DXF on demand using the `processor/` sidecar (see below).

## DWG → DXF conversion sidecar

`processor/DwgConverter` is a self-contained .NET 8 console app that converts DWG files to DXF using the ODA Platform managed API. It communicates over stdin/stdout with JSON:

**Input** (one line on stdin):
```json
{"action": "convert", "dwg_path": "C:\\path\\to\\file.dwg"}
```

**Output** (one line on stdout):
```json
{"status": "ok", "dxf": "  0\nSECTION\n..."}
```

or on error:
```json
{"status": "error", "message": "File not found: ..."}
```

### Building the sidecar

The sidecar requires the [ODA Platform .NET SDK](https://www.opendesign.com/). Add the ODA NuGet feed and restore packages:

```bash
cd processor
dotnet restore
dotnet build -c Release
```

The ODA NuGet source (`https://nuget.opendesign.com/`) is pre-configured in `processor/NuGet.Config`. You will need an ODA developer account to access the packages.

