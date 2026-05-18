# Block Library — Reference Architecture

**Status:** UI-first, desktop-native, with a local AutoCAD .NET plugin for
DWG conversion (May 2026, updated for 2D + 3D viewer + accoreconsole wiring).

Block Library is the exception to the backend-first architecture model.
Here's why and how it fits.

## Why Block Library is different

**The problem:** Three.js rendering and interactive 3D geometry cannot be
effectively delivered via REST API. Streaming geometry data, handling camera
controls, and managing GPU memory all require a local, stateful 3D context.
DWG conversion has the same property — round-tripping a multi-megabyte binary
file through a server hop is wasteful when the conversion can happen in
~1 second on the same machine.

**The solution:** Keep the viewer and DWG conversion local. The Tauri 2 shell
hosts:

1. A React UI for browsing the catalog (left sidebar / center grid / right
   inspector).
2. A 2D + 3D Three.js viewer that parses DXF in the WebView.
3. A local SQLite cache for the catalog and downloaded DXFs.
4. A bundled `.NET 8` plugin DLL (`processor/DwgConverter` →
   `BlockLibrary.AcadPlugin.dll`) that AutoCAD's `accoreconsole.exe` loads
   via NETLOAD to perform the headless DWG → DXF conversion.

## Architecture diagram

```text
┌────────────────────────────────────────────────────────────────────┐
│ Block Library (Tauri 2 + React)                                    │
│                                                                    │
│   React UI                                                         │
│   ├─ CategorySidebar / BlockGrid / BlockDetail                     │
│   └─ BlockViewer                                                   │
│      ├─ Viewer2D  (ortho top-down, MapControls pan/zoom)           │
│      ├─ Viewer3D  (perspective, OrbitControls, axis gizmo)         │
│      └─ ViewerToolbar (2D/3D · FIT · GRID · SPIN)                  │
│                                                                    │
│   Rust shell (src-tauri)                                           │
│   ├─ commands/catalog.rs                                           │
│   │   list_categories, list_blocks, get_block_dxf,                 │
│   │   sync_catalog, search_blocks, open_block_in_autocad,          │
│   │   dwg_converter_available                                      │
│   ├─ commands/cache.rs       (SQLite — categories, blocks, dxf)    │
│   ├─ commands/drive.rs       (Google Drive REST — list / download) │
│   └─ commands/dwg.rs         (drives accoreconsole.exe)            │
│                                                                    │
│   SQLite cache  ({app_data_dir}/block-library.db)                  │
│                                                                    │
│   Google Drive (read-only catalog; bytes streamed lazily)          │
└────────────────────────────────────────────────────────────────────┘
                        │ spawns: accoreconsole.exe /i <dwg> /s <scr>
                        ▼
┌────────────────────────────────────────────────────────────────────┐
│ accoreconsole.exe (AutoCAD headless host, ships with AutoCAD)      │
│                                                                    │
│   NETLOAD → BlockLibrary.AcadPlugin.dll                            │
│   ├─ [CommandMethod("BLDWG2DXF")]  →  Database.DxfOut(...)         │
│   └─ [CommandMethod("BLPING")]     →  health-check                 │
│                                                                    │
│   Headless: new Database(false, true) + ReadDwgFile                │
│   References acdbmgd / acmgd / accoremgd  (Copy Local = False)     │
│   Patterns match Chamber 19 AUTOCAD_DOTNET.md skill                │
└────────────────────────────────────────────────────────────────────┘
```

Distinct from backend services:

- No REST API (local only)
- No long-running subprocess — `accoreconsole.exe` is spawned per
  conversion and exits when its `.scr` script terminates with `_QUIT`
- No HTTP routing
- No multi-user server
- No third-party redistributable — uses the AutoCAD install the engineer
  already has on the machine

## Data flow

1. **On startup:** Tauri app reads `DRIVE_ROOT_FOLDER_ID` and `DRIVE_API_KEY`
   from embedded XOR-obfuscated secrets and initializes SQLite at
   `{app_data_dir}/block-library.db`.
2. **Sync:** App walks the Drive folder tree, upserts categories + blocks,
   and rebuilds the FTS5 index. Progress is emitted as `sync-progress` events.
3. **Browse:** User selects a category → app queries SQLite → grid shows the
   blocks. Search runs against the FTS5 index entirely locally.
4. **Preview — DXF:** Rust serves from the `dxf_cache` table on a hit;
   downloads via `drive::download_file` on a miss and caches the result.
5. **Preview — DWG:** Rust downloads the raw bytes via
   `drive::download_file_bytes`, writes a sanitized temp DWG, generates a
   one-shot `.scr` script (`_NETLOAD` of `BlockLibrary.AcadPlugin.dll`
   followed by `_BLDWG2DXF <input> <output>` followed by `_QUIT _Y`), and
   spawns `accoreconsole.exe /i <input.dwg> /s <script.scr>`. It parses
   stdout for the plugin's `BL_OK:` / `BL_ERROR:` markers, reads the output
   DXF from disk, caches it, and returns the text to the WebView. If
   AutoCAD or the plugin DLL is missing the call returns an error and the
   viewer shows a fallback message.
6. **Render:** The viewer parses DXF in the WebView using the `dxf` npm
   package, builds a `THREE.Group` with per-layer line/mesh materials, and
   composes either an `OrthographicCamera`-based 2D scene or a
   `PerspectiveCamera` + `OrbitControls` 3D scene.

## Three.js → DXF rendering pipeline

`frontend/src/lib/dxf-geometry.ts` is the single shared parser. It produces
a `DxfBuildResult` containing a fully populated `THREE.Group`, a bounding
box, a layer list, and per-type entity counts.

Supported entity types:

- **Lines, polylines (with bulge approximation), arcs, circles, ellipses, splines**
  — drawn as `LineSegments` per layer (one geometry buffer per layer for
  GPU efficiency).
- **3DFACE, SOLID, TRACE** — emitted as triangle/quad meshes with
  `MeshStandardMaterial` and computed vertex normals.
- **INSERT** — block references are flattened by walking
  `parsed.blocks[name].entities` with the insert's translation, rotation, and
  scale applied through a `Matrix4`.
- **Thickness extrusion** — DXF entities with a non-zero `thickness`
  attribute extrude into Z in 3D mode (lines become walls, closed
  polylines become prisms, circles become cylinders).
- **TEXT / MTEXT** — rendered as a baseline tick + bounding underline
  placeholder. Full text rasterization is deferred — the BlockDetail panel
  shows the textual content in the inspector instead.

Skipped entities: HATCH, DIMENSION, LEADER, IMAGE. These can be added by
extending the switch in `buildEntities`.

## GPU memory management

Three.js resources are explicitly disposed when a built group leaves the
scene. `disposeGroup` (exported from `dxf-geometry.ts`) traverses the group
and calls `geometry.dispose()` and `material.dispose()` on every node.
`Viewer2D.tsx` and `Viewer3D.tsx` register this disposal in their
`useEffect` cleanup so navigating between blocks does not leak VRAM.

## Plugin readiness

"Plugin usage" here means two things:

1. **The Tauri app installs cleanly** — the release bundle includes the
   plugin DLL, the Tauri shell, and the React UI. The only external
   dependency is AutoCAD itself (which the engineer already has).
2. **`BlockLibrary.AcadPlugin.dll` is a real AutoCAD .NET plugin** — same
   `[CommandMethod]` / `Database` / transaction conventions as any
   in-process plugin you'd write for AutoCAD directly. New commands can
   be added (e.g. block-attribute extraction, layer audits) without
   restructuring the codebase. See `processor/README.md` for the exact
   transaction-model rules that apply when extending the plugin.

## Launcher integration

Block Library is still accessible from the `chamber-19/launcher`, but differs
from backend services:

- **Not a URL route** — Block Library is a separate Tauri binary
- **Catalog integration** (future): could expose a `GET /api/catalog/list`
  endpoint for other apps to discover blocks
- **No Tauri IPC** — already a desktop app, no nested IPC needed
- **Standalone installer** — distributed as its own Windows installer (not
  bundled with launcher)

## When to stay UI-first

Block Library is the template for when UI-first is appropriate:

**Use UI-first when:**

- Real-time 3D rendering required
- Complex interactive state (camera, selection, animation)
- GPU memory management needed
- Low-latency mouse/keyboard response critical
- Conversion or processing is a single-machine operation with no shared state

**Don't use UI-first for:**

- Data CRUD operations (use backend service)
- Multi-user coordination (use backend service)
- Stateless read endpoints (use backend service)

## Future optimization (optional)

If the catalog grows large, consider a hybrid:

1. Keep the Three.js viewer and the accoreconsole-backed converter in Tauri
   (UI-first core stays).
2. Extract catalog sync to an optional Python backend service:
   - `POST /api/catalog/sync` — triggers Google Drive scan
   - `GET /api/catalog/list` — returns cached metadata
   - `GET /api/catalog/download/{id}` — downloads DXF to client cache

This lets other apps (launcher, drawing-list-manager) discover and share
blocks without losing the 3D viewer's responsiveness.

## Deployment

**Development:**

```bash
cd frontend
npm install
npm run desktop
```

**Production:**

```bash
cd frontend
npm run desktop:build
# Outputs: frontend/src-tauri/target/release/bundle/msi-bundle/
#          frontend/src-tauri/target/release/bundle/app/
```

The installer is signed and distributable independently from the launcher.

## References

- **Three.js documentation:** [Three.js docs](https://threejs.org/docs/)
- **React Three Fiber:** [R3F docs](https://docs.pmnd.rs/react-three-fiber/)
- **DXF npm package:** [dxf npm](https://www.npmjs.com/package/dxf)
- **Tauri 2 docs:** [Tauri](https://tauri.app/)
- **AutoCAD .NET API reference:** Autodesk Help — `AcDb*`, `AcGe*`, `AcEd*`
- **Chamber 19 AutoCAD .NET skill:** `.github/docs/skills/AUTOCAD_DOTNET.md`
