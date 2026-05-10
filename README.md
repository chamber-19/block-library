# Block Library

An interactive 3D block catalog browser for Chamber 19. Browse and preview DXF files from the AutoCAD block library using a Three.js viewer in a Tauri 2 desktop application. The catalog is cached locally in SQLite; the source of truth is a Google Drive folder tree.

**Architecture Role:** UI-first, 3D-aware desktop app (exception to backend-first model per May 2026 architecture). Tauri, React, and Three.js viewer remain in production.

---

## Why Block Library is Different

While most Chamber 19 tools follow the backend-first model (stateless REST services + universal launcher), Block Library is **UI-first and desktop-native**:

| Aspect | Backend Services | Block Library |
| --- | --- | --- |
| **Deployment** | Python FastAPI on localhost | Tauri 2 desktop binary |
| **Graphics** | REST API responses | Interactive Three.js viewer |
| **State** | Stateless | Local SQLite cache |
| **Catalog** | HTTP endpoints | Google Drive sync + local SQLite |

Block Library proves the value of keeping 3D visualization as a desktop-first experience. GPU rendering and interactive 3D controls are better served by a native Tauri app than REST API calls.

---

## Drive Folder Structure

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

Each top-level subfolder maps to a catalog category. Files are `.dxf` or `.dwg` directly inside the category folder (no further nesting).

## Google Cloud setup

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (or use an existing one).
3. Enable the **Google Drive API** for the project.
4. Go to **Credentials** and create an **API key**.
5. Under **API restrictions**, restrict the key to the **Google Drive API** only.
6. Under **Application restrictions**, restrict to the platforms you deploy from (or leave unrestricted for an internal tool).
7. Share the root Drive folder (read-only) with the API key's associated project, or make it accessible to anyone with the link if the catalog is not sensitive.

The root folder ID is the long string in the Drive URL when you open the folder:
`https://drive.google.com/drive/folders/<DRIVE_ROOT_FOLDER_ID>`

## Build environment variables

Set both variables in your shell (or in a `.env.build` file that is gitignored) before building:

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

## DXF preview limitation

Only `.dxf` files can be rendered in the 3D viewer. `.dwg` is a proprietary binary format with no open parser available in the WebView context. When a DWG file is selected the viewer shows:

> DWG format cannot be previewed directly. Convert to DXF for preview.

To preview a DWG file, export it to DXF from AutoCAD (`DXFOUT` command) and place the DXF alongside the original in the same Drive folder.
