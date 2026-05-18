# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased] — 2026-05-17 (later)

### Verified end-to-end against AutoCAD 2027

- `BLPING` loads cleanly in both interactive `acad.exe` and headless
  `accoreconsole.exe` and prints `BL_OK: BlockLibrary.AcadPlugin alive`.
- `BLDWG2DXF` produces a valid DXF on disk (smoke-tested with the bundled
  `Assembly Sample.dwg` from AutoCAD 2027 — output: 940 KB, valid DXF
  header).

### Plugin csproj wiring discovered during integration

Three properties are required to make `NETLOAD` succeed under AutoCAD
2027's `accoreconsole.exe` — without any of them the loader reports
"Unable to load assembly" with no further diagnostic:

- `<EnableDynamicLoading>true</EnableDynamicLoading>`
- `<GenerateRuntimeConfigurationFiles>true</GenerateRuntimeConfigurationFiles>`
- `<FrameworkReference Include="Microsoft.WindowsDesktop.App" />`

Also: the namespace `BlockLibrary.*` collides with a top-level
`BlockLibrary` type exported by Acmgd.dll, so the plugin namespace is
`Chamber19.BlockLibrary.AcadPlugin` (matches the DLL name).

### accoreconsole.exe-specific script requirements

The generated `.scr` script now prefixes the NETLOAD with `SECURELOAD 0`.
Without it, `accoreconsole.exe` boots with no user profile, `TRUSTEDPATHS`
is empty, and any NETLOAD silently fails. `SECURELOAD 1` is restored at
the end of the script for hygiene. `FILEDIA 0` / `CMDDIA 0` added to
suppress any modal dialogs that the runtime might throw mid-conversion.

### Rust improvements

- `commands/dwg.rs` no longer relies on stdout marker parsing — it checks
  for the output DXF file's existence as the primary success signal. The
  stdout/stderr are only decoded (with UTF-16 LE detection — accoreconsole
  writes its console output as UTF-16) for surfacing error diagnostics
  when the conversion fails.
- New `decode_console_output` helper handles both UTF-16 LE (BOM-marked or
  NUL-padded-ASCII pattern) and UTF-8 stdout streams.
- Dev-fallback path now scans both `net10.0-windows` (AutoCAD 2027) and
  `net8.0-windows` (AutoCAD 2025/2026) build outputs so the discovered DLL
  works regardless of which AutoCAD year the engineer built against.

### Defaults bumped to AutoCAD 2027 + .NET 10

- `Directory.Build.props`: `AcadInstallPath` defaults to
  `C:\Program Files\Autodesk\AutoCAD 2027`.
- `DwgConverter.csproj`: `TargetFramework` defaults to `net10.0-windows`.
- Rust `find_accoreconsole`: scans AutoCAD 2027 first.

For AutoCAD 2025/2026 (.NET 8), pass both
`-p:AcadInstallPath="...AutoCAD 2026"` and
`-p:TargetFramework=net8.0-windows` on the `dotnet build` invocation.

### Changed — DWG conversion now uses AutoCAD .NET, not ODA

- **Replaced the ODA-based standalone EXE with a real AutoCAD .NET plugin.**
  The previous design shipped a self-contained `DwgConverter.exe` built
  against the Open Design Alliance Drawings SDK (`OdaMgd` NuGet package
  from `nuget.opendesign.com`). That redistributable required an ODA
  developer account to build and added a multi-megabyte native runtime to
  the installer. Since engineers already have AutoCAD licenses, we now
  drive the conversion through the AutoCAD install they already have.
- **New plugin: `processor/DwgConverter/` → `BlockLibrary.AcadPlugin.dll`.**
  A .NET 8 class library targeting `acdbmgd` / `acmgd` / `accoremgd` (all
  `Copy Local = False`, per `AUTOCAD_DOTNET.md`). Exposes two commands:
  - `[CommandMethod("BLDWG2DXF")]` — prompts for input + output paths,
    runs `new Database(false, true)` + `ReadDwgFile` + `DxfOut` in the
    documented headless pattern. Future block-attribute / layer-audit
    work can extend this class without restructuring.
  - `[CommandMethod("BLPING")]` — sidecar health check.
- **New `processor/Directory.Build.props`** declaring an `AcadInstallPath`
  property that defaults to AutoCAD 2026 and can be overridden on the
  command line for other AutoCAD years.
- **`commands/dwg.rs` rewritten** to drive `accoreconsole.exe` directly
  via `std::process::Command`. It locates accoreconsole from a list of
  standard install paths (AutoCAD 2023 through 2027) with a
  `BLOCK_LIBRARY_ACCORECONSOLE` env-var override, resolves the bundled
  plugin DLL through Tauri's `resource_dir` (or a dev fallback to
  `processor/.../bin/{Release,Debug}/`), generates a one-shot `.scr`
  script, spawns accoreconsole, and parses stdout for the plugin's
  `BL_OK:` / `BL_ERROR:` markers.
- **Dropped `tauri-plugin-shell`** — we no longer need Tauri's permission
  system for spawning a bundled sidecar EXE. The Rust shell uses
  `std::process` directly. Removed from `Cargo.toml`, `lib.rs`, and the
  `capabilities/default.json` allowlist.
- **`tauri.conf.json`**: replaced `bundle.externalBin` with
  `bundle.resources` pointing at `resources/BlockLibrary.AcadPlugin.dll`.
- **Removed `frontend/src-tauri/binaries/`**; added
  `frontend/src-tauri/resources/` with a zero-byte placeholder DLL and a
  README explaining the build/install flow.
- **Deleted `processor/NuGet.Config`** — no ODA feed needed.
- **Docs updated** — `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`,
  and `processor/README.md` all rewritten to reflect the AutoCAD .NET
  plugin path. ODA references and "Open Design Alliance" mentions
  removed throughout. `AGENTS.md` now explicitly forbids re-adding ODA.

### Verified

- `cargo check --offline` — clean.
- `tsc --noEmit` — unchanged (still clean).
- `npm run build` — unchanged (still clean).
- `dotnet build` on the new plugin not run from this worktree (requires
  AutoCAD installed); plugin code follows the documented patterns
  exactly and is ready for an `dotnet build -p:AcadInstallPath=...`
  invocation on a machine with AutoCAD.

## [Unreleased] — 2026-05-17

### Added

- **2D + 3D viewer modes** — `BlockViewer` now offers a toolbar with mode
  toggle (2D / 3D), fit-to-extents, grid toggle, and auto-rotate. The 2D
  viewer uses an orthographic top-down camera with `MapControls` (pan/zoom
  only); the 3D viewer uses a perspective camera with `OrbitControls` and a
  corner axis gizmo (`GizmoHelper` + `GizmoViewport`).
- **DWG → DXF conversion via a bundled .NET 8 sidecar** — `processor/DwgConverter`
  is now wired into the Tauri shell through `tauri-plugin-shell` and
  `externalBin`. The Rust side downloads DWG bytes from Drive, spawns the
  sidecar with a JSON request on stdin, reads the DXF response on stdout, and
  caches the result the same way native DXFs are cached.
- **Layer-aware coloring** — DXF entities are grouped by layer and rendered
  with deterministic per-layer colors from a 10-color palette (system layer
  `0`/`Defpoints` fall back to the accent color).
- **Thickness extrusion and 3DFACE meshes** — In 3D mode, entities with a
  non-zero `thickness` extrude into Z, closed polylines become prisms,
  circles become cylinders, and `3DFACE`/`SOLID`/`TRACE` entities render as
  triangle/quad meshes with `MeshStandardMaterial`.
- **INSERT (block reference) flattening** — Block references resolve against
  `parsed.blocks` and apply translation, rotation, and scale through a
  `Matrix4`.
- **Bulge approximation for LWPOLYLINE vertices** — Arc-bulged segments
  expand into a 12-segment arc rather than a chord.
- **`dwg_converter_available` Tauri command** — The frontend can probe the
  sidecar's presence and switch UI state accordingly.
- **`drive::download_file_bytes`** — Raw byte download path so DWG and other
  binary formats round-trip without UTF-8 corruption.
- **`disposeGroup` helper in `lib/dxf-geometry.ts`** — Explicit GPU disposal
  walk used by both viewers on unmount.

### Changed

- `lib/dxf-geometry.ts` rewritten as `buildDxfScene(dxfText, opts)` returning
  `{ group, layers, bbox, counts }`. The old `dxfToGroup` is preserved as a
  thin wrapper for backwards compatibility.
- `get_block_dxf` now handles DWG inputs by routing through the sidecar
  instead of returning an error. DXF inputs continue to flow through the
  existing cache + Drive download path.
- `open_block_in_autocad` writes raw bytes via `download_file_bytes` so DWG
  files survive the round-trip to disk uncorrupted, and now sanitizes the
  destination filename to keep it inside `temp_dir`.
- `BlockViewer` props now include `converting` and `errorMessage` so the UI
  can distinguish "DWG conversion running" from "fetch in progress" and
  surface specific errors from the sidecar.
- Right panel widened from 380px → 420px to accommodate the viewer toolbar.

### Fixed

- `invoke('get_block_dxf', { blockId })` corrected to
  `invoke('get_block_dxf', { driveFileId })` — the Rust handler reads
  `drive_file_id`, which Tauri exposes as `driveFileId` on the JS side. The
  previous mismatch made every DXF fetch fail at the Tauri boundary.
- `invoke('open_block_in_autocad', { blockId })` corrected to use both
  `driveFileId` and `fileName` to match the Rust signature.
- Stale-response guard added in `App.tsx` — clicking through blocks rapidly
  no longer races stale fetches into the viewer.

### Plugin-readiness audit (superseded by the Option B switch above)

The first iteration of this work shipped an ODA-based standalone EXE
(`DwgConverter.exe`) with self-contained `win-x64` publish and a
JSON-over-stdin/stdout protocol. That design was replaced later the same
day by the AutoCAD .NET plugin path documented in the section above.
Everything in this block is historical context only.

### Docs

- README rewritten to describe the 2D + 3D viewer, the DWG sidecar pipeline,
  and the one-time `dotnet publish` step that installs the sidecar binary.
- `docs/ARCHITECTURE.md` updated with the new data flow (Drive → bytes →
  sidecar → DXF → cache → viewer) and the rendering pipeline reference
  (supported entity types, layer materials, GPU disposal).
- New `processor/README.md` covers the build/publish workflow, the Tauri
  sidecar slot path, and a local smoke-test command. (Rewritten in the
  Option B switch to drop ODA in favor of AutoCAD .NET.)
- `AGENTS.md` updated — DWG previewing is now supported via a local
  process, not a server; the no-server-side-conversion rule still applies.
