use std::path::{Path, PathBuf};
use std::process::Stdio;

use tauri::{AppHandle, Manager};

// ---------------------------------------------------------------------------
// AutoCAD .NET plugin sidecar
//
// We do NOT bundle our own EXE. Instead, the Rust shell:
//
//   1. Locates `accoreconsole.exe` from a standard AutoCAD install.
//   2. Locates `BlockLibrary.AcadPlugin.dll` from the Tauri resource dir
//      (the bundled plugin shipped with the installer) — with dev-time
//      fallbacks to the dotnet build output.
//   3. Generates a one-shot AutoCAD script that NETLOADs the plugin and
//      invokes the `_BLDWG2DXF` command with input + output paths.
//   4. Spawns `accoreconsole.exe /i <input.dwg> /s <script.scr>` and
//      parses stdout for the `BL_OK:` / `BL_ERROR:` markers the plugin
//      prints via Editor.WriteMessage.
//   5. Reads the resulting DXF file from disk.
//
// The plugin source lives in `processor/DwgConverter/` and is built with
// `dotnet build`. See `processor/README.md` for the build flow.
// ---------------------------------------------------------------------------

const PLUGIN_DLL_NAME: &str = "Chamber19.BlockLibrary.AcadPlugin.dll";

const ACCORECONSOLE_ENV: &str = "BLOCK_LIBRARY_ACCORECONSOLE";
const PLUGIN_DLL_ENV: &str = "BLOCK_LIBRARY_PLUGIN_DLL";

// Known AutoCAD install roots, newest first. The first hit wins.
const ACAD_CANDIDATES: &[&str] = &[
    "C:\\Program Files\\Autodesk\\AutoCAD 2027",
    "C:\\Program Files\\Autodesk\\AutoCAD 2026",
    "C:\\Program Files\\Autodesk\\AutoCAD 2025",
    "C:\\Program Files\\Autodesk\\AutoCAD 2024",
    "C:\\Program Files\\Autodesk\\AutoCAD 2023",
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// True when both `accoreconsole.exe` and the bundled plugin DLL can be
/// resolved. Used by the frontend to decide whether to attempt DWG
/// previewing. Cheap — pure filesystem probes, no process spawn.
pub fn sidecar_available(app: &AppHandle) -> bool {
    find_accoreconsole().is_ok() && resolve_plugin_dll(app).is_ok()
}

/// Converts a DWG file on disk to a DXF string by driving `accoreconsole.exe`
/// through a one-shot script that loads our .NET plugin and invokes
/// `_BLDWG2DXF`. Follows the Chamber 19 AUTOCAD_DOTNET.md headless pattern.
pub async fn convert_dwg_to_dxf(app: &AppHandle, dwg_path: &PathBuf) -> Result<String, String> {
    let accoreconsole = find_accoreconsole()?;
    let plugin_dll = resolve_plugin_dll(app)?;

    // Generate unique sibling paths in the system temp dir for the .scr
    // script and the .dxf output. Using `std::process::id` + a per-call
    // counter guarantees no collision even under concurrent previews.
    let unique = format!("{}-{}", std::process::id(), next_seq());
    let script_path = std::env::temp_dir().join(format!("blkc-{unique}.scr"));
    let output_dxf = std::env::temp_dir().join(format!("blkc-{unique}.dxf"));

    let script_body = build_script(&plugin_dll, dwg_path, &output_dxf);
    std::fs::write(&script_path, script_body)
        .map_err(|e| format!("write .scr script failed: {e}"))?;

    // Run accoreconsole in blocking mode on a worker thread — it's a Windows
    // process that blocks until it sees `_QUIT _Y` and we don't need its
    // stdout to stream.
    let accoreconsole_clone = accoreconsole.clone();
    let dwg_clone = dwg_path.clone();
    let script_clone = script_path.clone();
    let output_clone = output_dxf.clone();
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        run_accoreconsole(&accoreconsole_clone, &dwg_clone, &script_clone, &output_clone)
    })
    .await
    .map_err(|e| format!("accoreconsole join failed: {e}"))??;

    // Always clean up the script + output even on success.
    let _ = std::fs::remove_file(&script_path);
    let _ = std::fs::remove_file(&output_dxf);

    Ok(result)
}

// ---------------------------------------------------------------------------
// accoreconsole invocation
// ---------------------------------------------------------------------------

fn run_accoreconsole(
    accoreconsole: &Path,
    dwg_path: &Path,
    script_path: &Path,
    output_dxf: &Path,
) -> Result<String, String> {
    use std::process::Command;

    // /i opens the input drawing as the active document so the plugin's
    // CommandFlags.Session command has a context to attach to.
    // /s runs our script (NETLOAD + BLDWG2DXF + _QUIT).
    let output = Command::new(accoreconsole)
        .arg("/i")
        .arg(dwg_path)
        .arg("/s")
        .arg(script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("accoreconsole spawn failed: {e}"))?;

    // Primary success signal: the output DXF file exists and is non-empty.
    // Stdout marker parsing is unreliable because accoreconsole writes its
    // stdout as UTF-16 LE — see `decode_console_output` for how we recover
    // a readable string for error reporting.
    if let Ok(meta) = std::fs::metadata(output_dxf) {
        if meta.len() > 0 {
            return std::fs::read_to_string(output_dxf)
                .map_err(|e| format!("read output DXF failed: {e}"));
        }
    }

    // No output file → surface whatever diagnostic we can scrape.
    let stdout = decode_console_output(&output.stdout);
    let stderr = decode_console_output(&output.stderr);

    if let Some(err_msg) = find_marker(&stdout, "BL_ERROR:") {
        return Err(format!(
            "DwgConverter plugin error: {err_msg}\nstderr: {}",
            stderr.trim()
        ));
    }
    Err(format!(
        "DwgConverter produced no output DXF. accoreconsole exit code: {:?}.\n\
         stdout tail: {}\nstderr: {}",
        output.status.code(),
        tail(&stdout, 768),
        stderr.trim()
    ))
}

// ---------------------------------------------------------------------------
// Script construction
// ---------------------------------------------------------------------------

fn build_script(plugin_dll: &Path, input_dwg: &Path, output_dxf: &Path) -> String {
    // AutoCAD script syntax:
    //   - Each newline is a separator (like pressing Enter).
    //   - `_` prefix forces the English command name regardless of locale.
    //   - NETLOAD accepts a quoted path so spaces are fine there.
    //   - GetString prompt responses are the entire line of text, so the
    //     input/output paths go on their own lines. The plugin sets
    //     AllowSpaces=true on its prompts to tolerate usernames with spaces.
    //   - `_QUIT _Y` exits accoreconsole without prompting to save.
    //
    // SECURELOAD 0 is REQUIRED for accoreconsole.exe: without a loaded
    // user profile the default policy is "load only from TRUSTEDPATHS",
    // and TRUSTEDPATHS is empty in the headless context, so any NETLOAD
    // silently fails with "Unable to load assembly". Setting SECURELOAD
    // to 0 for the duration of this single invocation matches the
    // interactive acad.exe default behavior and lets the plugin load
    // from any local path. Safe because the plugin path is generated by
    // us and not supplied by the user. Restored at the end for hygiene
    // even though the process is about to exit.
    format!(
        "FILEDIA 0\n\
         CMDDIA 0\n\
         SECURELOAD 0\n\
         _NETLOAD \"{plugin}\"\n\
         _BLDWG2DXF\n\
         {input}\n\
         {output}\n\
         SECURELOAD 1\n\
         FILEDIA 1\n\
         CMDDIA 1\n\
         _QUIT _Y\n",
        plugin = plugin_dll.display(),
        input = input_dwg.display(),
        output = output_dxf.display(),
    )
}

// ---------------------------------------------------------------------------
// accoreconsole.exe discovery
// ---------------------------------------------------------------------------

fn find_accoreconsole() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var(ACCORECONSOLE_ENV) {
        let path = PathBuf::from(&p);
        if path.exists() {
            return Ok(path);
        }
        return Err(format!(
            "{ACCORECONSOLE_ENV} is set to '{p}' but the file does not exist"
        ));
    }

    for root in ACAD_CANDIDATES {
        let candidate = PathBuf::from(root).join("accoreconsole.exe");
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "accoreconsole.exe not found in any standard AutoCAD install path. \
         Install AutoCAD 2023+ or set the {ACCORECONSOLE_ENV} environment variable."
    ))
}

// ---------------------------------------------------------------------------
// Plugin DLL discovery
// ---------------------------------------------------------------------------

fn resolve_plugin_dll(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var(PLUGIN_DLL_ENV) {
        let path = PathBuf::from(&p);
        if path.exists() {
            return Ok(path);
        }
        return Err(format!(
            "{PLUGIN_DLL_ENV} is set to '{p}' but the file does not exist"
        ));
    }

    // 1. Production: bundled inside the Tauri resource directory.
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("resources").join(PLUGIN_DLL_NAME);
        if bundled.exists() {
            return Ok(bundled);
        }
        let flat = resource_dir.join(PLUGIN_DLL_NAME);
        if flat.exists() {
            return Ok(flat);
        }
    }

    // 2. Dev: sibling of the running tauri exe (someone copied it there).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let adjacent = dir.join(PLUGIN_DLL_NAME);
            if adjacent.exists() {
                return Ok(adjacent);
            }
        }
    }

    // 3. Dev: relative to the workspace root, picking up the dotnet build
    // output. Try Release first then Debug so a `dotnet publish` output
    // takes precedence over a Debug build. We try both .NET 10 (AutoCAD
    // 2027 default) and .NET 8 (AutoCAD 2025/2026) target frameworks so
    // the dev fallback works regardless of which AutoCAD year the
    // engineer built against.
    if let Ok(exe) = std::env::current_exe() {
        let workspace_root = exe
            .ancestors()
            .nth(4)
            .map(|p| p.to_path_buf())
            .unwrap_or_default();
        for profile in &["Release", "Debug"] {
            for tfm in &["net10.0-windows", "net8.0-windows"] {
                let candidate = workspace_root
                    .join("processor")
                    .join("DwgConverter")
                    .join("bin")
                    .join(profile)
                    .join(tfm)
                    .join(PLUGIN_DLL_NAME);
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err(format!(
        "{PLUGIN_DLL_NAME} not found. Build it with `dotnet build processor/DwgConverter.sln` \
         and copy the output to `frontend/src-tauri/resources/`, or set {PLUGIN_DLL_ENV}."
    ))
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

/// Returns the text after the marker on the line where the marker appears,
/// or None if the marker is absent. Scans from the end so banner noise at
/// the start of accoreconsole's output is ignored.
fn find_marker(haystack: &str, marker: &str) -> Option<String> {
    for line in haystack.lines().rev() {
        if let Some(idx) = line.find(marker) {
            let rest = line[idx + marker.len()..].trim();
            return Some(rest.to_string());
        }
    }
    None
}

fn tail(s: &str, n: usize) -> &str {
    let len = s.len();
    if len <= n {
        s
    } else {
        // Slice on a char boundary closest to len - n.
        let mut start = len - n;
        while start < len && !s.is_char_boundary(start) {
            start += 1;
        }
        &s[start..]
    }
}

// Monotonic per-process counter used for unique temp filenames.
fn next_seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    SEQ.fetch_add(1, Ordering::Relaxed)
}

/// Decodes accoreconsole.exe stdout/stderr bytes into a Rust string.
///
/// accoreconsole.exe writes its standard streams as UTF-16 LE on
/// Windows — even when redirected. UTF-8 lossy decoding produces
/// useless garbage (single ASCII chars separated by NUL bytes). We
/// detect UTF-16 LE by sniffing for a BOM or alternating ASCII-then-
/// NUL bytes; fall back to UTF-8 otherwise so we don't lose anything
/// if a future Autodesk build changes the encoding.
fn decode_console_output(bytes: &[u8]) -> String {
    // BOM-flagged UTF-16 LE
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        return decode_utf16_le(&bytes[2..]);
    }
    // Even-length stream with the NUL-padded-ASCII pattern accoreconsole
    // uses (every other byte is 0x00).
    if bytes.len() >= 4 && bytes.len() % 2 == 0 {
        let zeros_in_odd_positions = bytes
            .iter()
            .enumerate()
            .filter(|(i, b)| i % 2 == 1 && **b == 0)
            .count();
        let half = bytes.len() / 2;
        if zeros_in_odd_positions > half * 2 / 3 {
            return decode_utf16_le(bytes);
        }
    }
    String::from_utf8_lossy(bytes).into_owned()
}

fn decode_utf16_le(bytes: &[u8]) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16_lossy(&units)
}
