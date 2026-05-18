# `resources/` — Tauri bundled resources

This directory ships inside the installer. Tauri's `bundle.resources`
declaration in `tauri.conf.json` is responsible for getting everything
here into the right place on the user's machine; the Rust shell finds
each entry through `app.path().resource_dir().join("resources/...")`.

| File | Purpose |
| --- | --- |
| `BlockLibrary.AcadPlugin.dll` | AutoCAD .NET plugin loaded by `accoreconsole.exe` to handle DWG → DXF previewing. Source lives in `../../../processor/DwgConverter/`. |

The real DLL is built from `processor/DwgConverter/` with `dotnet build`
and copied here by the engineer (or by CI) before bundling. See
[`../../../processor/README.md`](../../../processor/README.md) for
the build flow.

A zero-byte placeholder is committed so `cargo check` and `tauri build`
do not fail in fresh clones — Tauri's bundler only validates that the
declared resource paths exist. The runtime in `src/commands/dwg.rs`
detects that the file is a stub at first use (the NETLOAD step fails
inside accoreconsole), the `get_block_dxf` command returns an error,
and the viewer falls back to "preview not available."
