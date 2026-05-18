# BlockLibrary.AcadPlugin — DWG → DXF converter

An AutoCAD .NET plugin (class library) that the Tauri shell loads into
`accoreconsole.exe` via `NETLOAD` to convert DWG files to DXF on demand.
The Three.js viewer in `frontend/` only knows how to render DXF; this
plugin is what makes DWG files in the Drive catalog previewable.

## Why a plugin (not a standalone EXE)

The previous iteration shipped a self-contained EXE built against the
Open Design Alliance Drawings SDK (ODA). We replaced it with a real
AutoCAD .NET plugin because:

- Engineers in this org already have AutoCAD licenses, so the ODA
  redistributable doesn't earn its keep.
- The plugin pattern matches the Chamber 19 `AUTOCAD_DOTNET.md` skill
  directly — transactions, `CommandMethod`, headless `Database`. The
  same patterns can be reused for future block-attribute extraction,
  layer audits, etc.
- No more ODA NuGet feed or developer-account dependency.

## Runtime — Autodesk AutoCAD .NET

The plugin uses three host-loaded assemblies from the AutoCAD install:

- `acdbmgd.dll` — `Autodesk.AutoCAD.DatabaseServices`
- `acmgd.dll` — `Autodesk.AutoCAD.ApplicationServices`
- `accoremgd.dll` — `Autodesk.AutoCAD.EditorInput` + core runtime

All three are referenced with **`Copy Local = False`** per the
`AUTOCAD_DOTNET.md` rules. They're owned by `accoreconsole.exe` at
runtime; copying them next to our DLL leads to loader conflicts.

### .NET version per AutoCAD year

The csproj defaults to **.NET 10** + **AutoCAD 2027**. For older AutoCAD
versions, override both at build time:

| AutoCAD release | Internal | .NET runtime | csproj override |
|---|---|---|---|
| AutoCAD 2027 | R26.0 | .NET 10 | (default) |
| AutoCAD 2026 | R25.1 | .NET 8  | `-p:TargetFramework=net8.0-windows -p:AcadInstallPath="...AutoCAD 2026"` |
| AutoCAD 2025 | R25.0 | .NET 8  | `-p:TargetFramework=net8.0-windows -p:AcadInstallPath="...AutoCAD 2025"` |
| AutoCAD 2024 | R24.x | .NET Framework 4.8 | not supported by this csproj — use `net48` instead |

The plugin csproj sets three properties that are mandatory for .NET 8+
AutoCAD plugins:

- `<EnableDynamicLoading>true</EnableDynamicLoading>` — generates the
  `.runtimeconfig.json` AutoCAD reads on NETLOAD.
- `<GenerateRuntimeConfigurationFiles>true</GenerateRuntimeConfigurationFiles>`
  — required alongside the above for AutoCAD 2027's loader.
- `<FrameworkReference Include="Microsoft.WindowsDesktop.App" />` — the
  AutoCAD host expects this framework to be declared.

Without all three, `NETLOAD` reports a generic "Unable to load assembly"
with no further diagnostic. Source: chamber-19/autocad-knowledge
`autocad-2027-net10-migration.md`.

The headless pattern from the skill file:

```csharp
using var db = new Database(false, true);          // no UI, no document
db.ReadDwgFile(path, FileOpenMode.OpenForReadAndAllShare, false, "");
db.DxfOut(out, 16, DwgVersion.AC1027);
```

Future extraction work (attribute reads, entity walks) must use the
transaction pattern:

```csharp
using var tr = db.TransactionManager.StartTransaction();
var bt = (BlockTable)tr.GetObject(db.BlockTableId, OpenMode.ForRead);
// upgrade ForWrite only when needed
tr.Commit();
```

## Commands exposed

| Command | Purpose |
| --- | --- |
| `_BLDWG2DXF` | Prompts for input DWG path + output DXF path, writes DXF using `Database.DxfOut`. |
| `_BLPING` | Health-check; prints `BL_OK: BlockLibrary.AcadPlugin alive`. Used by the Rust shell to verify NETLOAD worked. |

Every command prints exactly one of `BL_OK: <message>` or
`BL_ERROR: <message>` to the Editor (which surfaces on
`accoreconsole.exe`'s stdout). The Rust caller scans for these markers.

## Driving the plugin from outside

The Tauri shell generates a one-shot `.scr` script at runtime:

```text
FILEDIA 0
CMDDIA 0
SECURELOAD 0
_NETLOAD "C:\Users\<you>\...\Chamber19.BlockLibrary.AcadPlugin.dll"
_BLDWG2DXF
C:\temp\input.dwg
C:\temp\output.dxf
SECURELOAD 1
FILEDIA 1
CMDDIA 1
_QUIT _Y
```

**Why `SECURELOAD 0` is non-optional for accoreconsole.exe:** the headless
process boots without a loaded user profile, which means `TRUSTEDPATHS` is
empty. With `SECURELOAD` at its default (≥1) any `NETLOAD` from outside the
empty trusted-paths list silently fails with "Unable to load assembly".
Setting `SECURELOAD 0` for the duration of one invocation matches what the
interactive `acad.exe` does by default and lets the plugin load from any
local path. Restored to `1` at the end of the script as a courtesy even
though accoreconsole runs against a throwaway profile.

`FILEDIA 0` / `CMDDIA 0` suppress any dialog boxes the runtime might try
to throw up during the conversion (file overwrite prompts, etc.).

Then spawns:

```text
accoreconsole.exe /i C:\temp\input.dwg /s C:\temp\generated.scr
```

`/i` opens the input drawing as the active document (so commands have a
context). `/s` runs the generated script.

## Building from source

Requires AutoCAD installed locally — the build references assemblies
from the install directory.

```powershell
cd processor

# Build the plugin. Default install path is AutoCAD 2026.
dotnet build DwgConverter.sln

# Override when targeting a different AutoCAD year:
dotnet build DwgConverter.sln `
    -p:AcadInstallPath="C:\Program Files\Autodesk\AutoCAD 2025"

# Release build, ready to ship:
dotnet build DwgConverter.sln -c Release
```

Output lands at:

```text
processor\DwgConverter\bin\Release\net8.0-windows\BlockLibrary.AcadPlugin.dll
```

## Installing into the Tauri resource slot

The Tauri bundler picks up `frontend/src-tauri/resources/` as installer
content. Copy the built DLL into that slot before bundling:

```powershell
# From repo root
copy processor\DwgConverter\bin\Release\net8.0-windows\BlockLibrary.AcadPlugin.dll `
     frontend\src-tauri\resources\BlockLibrary.AcadPlugin.dll
```

The Rust shell discovers the DLL via:

1. `BLOCK_LIBRARY_PLUGIN_DLL` environment variable (full path override).
2. `app.path().resource_dir() / resources / BlockLibrary.AcadPlugin.dll`
   (production — inside the installed app).
3. Sibling of the running `block-library.exe`.
4. `processor/DwgConverter/bin/{Release|Debug}/net8.0-windows/BlockLibrary.AcadPlugin.dll`
   (dev fallback so you can iterate without copying after every build).

It also locates `accoreconsole.exe` via:

1. `BLOCK_LIBRARY_ACCORECONSOLE` environment variable (full path override).
2. Standard install paths (`C:\Program Files\Autodesk\AutoCAD <year>\accoreconsole.exe`)
   for 2023 through 2027.

## Local smoke test

Without the Tauri shell — drive accoreconsole manually:

```powershell
# Build first
dotnet build DwgConverter.sln

# Write a one-shot script
@'
_NETLOAD "C:\full\path\to\BlockLibrary.AcadPlugin.dll"
_BLPING
_QUIT _Y
'@ | Out-File -Encoding ascii test.scr

# Pick any small DWG you have on hand
& "C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe" `
    /i C:\path\to\sample.dwg /s test.scr
```

Look for `BL_OK: BlockLibrary.AcadPlugin alive` in the output.

## What this plugin does NOT do

- Talk to Google Drive (the Rust shell downloads bytes and writes a temp file)
- Cache anything (cache lives in SQLite in the Rust side)
- Open a network socket
- Use COM (the Chamber 19 .NET skill forbids COM from a managed plugin)
- Modify the active drawing (the conversion runs in its own headless
  `Database` instance)
