# Block Library

An interactive 2D + 3D block catalog browser for Chamber 19. Browse and preview
DXF (and now DWG) files from the AutoCAD block library using a Three.js viewer
in a Tauri 2 desktop application. The catalog is cached locally in SQLite; the
source of truth is a Google Drive folder tree.

**Architecture role:** UI-first, 3D-aware desktop app — the documented exception
to the backend-first model (per May 2026 architecture). Tauri, React, and the
Three.js viewer remain in production. The DWG → DXF converter lives in
`processor/` as an AutoCAD .NET plugin loaded into `accoreconsole.exe` at
runtime — no server, no ODA dependency, just the AutoCAD install the engineer
already has.

---

## What's new

- **2D + 3D modes** — switch between an orthographic top-down view and a
  perspective orbit view. The 2D mode shows the drawing as it reads on paper;
  the 3D mode honors Z coordinates, `thickness` extrusion, 3DFACE meshes, and
  block reference flattening.
- **DWG previewing via a real AutoCAD .NET plugin** — when you pick a `.dwg`
  file the Rust shell generates a one-shot `.scr` script, spawns
  `accoreconsole.exe /i <input.dwg> /s <script.scr>`, and reads back the DXF
  the plugin wrote to disk. The plugin (`BlockLibrary.AcadPlugin.dll`) is a
  class library that follows the Chamber 19 `AUTOCAD_DOTNET.md` patterns
  exactly: headless `Database`, `ReadDwgFile`, `[CommandMethod]`,
  transaction-ready scaffolding for future block-attribute extraction.
- **Plugin-ready packaging** — the DLL is shipped as a Tauri `resources/`
  bundle entry. If it or AutoCAD is missing in dev, the UI falls back to the
  static "preview not available" message.
- **Layer-aware coloring** — entities are grouped by DXF layer and colored
  deterministically so distinct layers are visually separable.

---

## Why Block Library is different

While most Chamber 19 tools follow the backend-first model (stateless REST
services + universal launcher), Block Library is **UI-first and desktop-native**:

| Aspect | Backend Services | Block Library |
| --- | --- | --- |
| **Deployment** | Python FastAPI on localhost | Tauri 2 desktop binary |
| **Graphics** | REST API responses | Interactive Three.js viewer |
| **State** | Stateless | Local SQLite cache |
| **Catalog** | HTTP endpoints | Google Drive sync + local SQLite |
| **DWG support** | n/a | AutoCAD .NET plugin loaded into `accoreconsole.exe` (`processor/`) |

Three.js rendering and interactive 3D geometry cannot be effectively delivered
via REST. Streaming geometry data, handling camera controls, and managing GPU
memory all require a local, stateful 3D context. The AutoCAD .NET plugin keeps
DWG conversion local too — there's no server in the loop, and the conversion
runs in whatever AutoCAD version the engineer already has installed.

---

## Drive folder structure

The app expects a flat two-level hierarchy under a single root Drive folder:

```text
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

Each top-level subfolder maps to a catalog category. Files are `.dxf` or
`.dwg` directly inside the category folder (no further nesting).

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Enable the **Google Drive API** for the project.
4. Go to **Credentials** and create an **API key**.
5. Under **API restrictions**, restrict the key to the **Google Drive API** only.
6. Under **Application restrictions**, restrict to the platforms you deploy
   from (or leave unrestricted for an internal tool).
7. Share the root Drive folder (read-only) with the API key's associated
   project, or make it accessible to anyone with the link if the catalog is
   not sensitive.

The root folder ID is the long string in the Drive URL when you open the folder:
`https://drive.google.com/drive/folders/<DRIVE_ROOT_FOLDER_ID>`

## Build environment variables

Set both variables in your shell (or in a `.env.build` file that is gitignored)
before building:

```bash
export DRIVE_ROOT_FOLDER_ID=your_folder_id_here
export DRIVE_API_KEY=your_api_key_here
```

`build.rs` reads these at compile time and XOR-obfuscates the values before
embedding them in the binary. They are not present in plain text in the
compiled output.

## Running in development

```bash
cd frontend
npm install
npm run desktop
```

This starts the Vite dev server and the Tauri shell together. DWG conversion
is disabled unless `BlockLibrary.AcadPlugin.dll` is built and AutoCAD is
installed locally — see the next section.

## DWG plugin setup (one-time)

To enable DWG previewing in dev or production builds:

```powershell
# From the repo root — requires AutoCAD installed locally.
cd processor
dotnet build DwgConverter.sln -c Release

# Copy the built DLL into Tauri's resources slot so the bundler picks it up.
copy DwgConverter\bin\Release\net8.0-windows\BlockLibrary.AcadPlugin.dll `
     ..\frontend\src-tauri\resources\BlockLibrary.AcadPlugin.dll
```

If you're on AutoCAD 2025 (or any year other than 2026), override the
install path:

```powershell
dotnet build DwgConverter.sln -c Release `
    -p:AcadInstallPath="C:\Program Files\Autodesk\AutoCAD 2025"
```

The full build/install instructions live in
[`processor/README.md`](processor/README.md).

If the DLL is absent or AutoCAD isn't installed, DWG files in the catalog
show "preview not available"; DXF files preview normally.

## Building a release binary

```bash
cd frontend
npm install
npm run desktop:build
```

The installer is written to `frontend/src-tauri/target/release/bundle/`. The
plugin DLL in `resources/` is automatically bundled because of the
`bundle.resources` declaration in `tauri.conf.json`.

## Viewer cheatsheet

| Action | 2D mode | 3D mode |
| --- | --- | --- |
| Pan | drag | right-drag |
| Zoom | scroll | scroll |
| Orbit | — | drag |
| Auto-rotate | n/a | toolbar SPIN button |
| Fit to extents | toolbar FIT button | toolbar FIT button |
| Toggle grid | toolbar GRID button | toolbar GRID button |
| Switch mode | toolbar 2D/3D | toolbar 2D/3D |

## Forbidden additions

See [`AGENTS.md`](AGENTS.md) for the full list of components that must not be
re-introduced (Supabase, Docker, PySide6, nginx, cloud databases). DWG support
is satisfied by the AutoCAD .NET plugin in `processor/`; do not re-add the
ODA SDK or a network-hosted converter.
