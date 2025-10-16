# path: app/ui/run_accore.py
#!/usr/bin/env python3
"""
AutoCAD Core Console Runner (hardened, BOM-safe)

Environment:
  ACCORE            Path to accoreconsole.exe (default: AutoCAD 2026)
  CAD_HEADLESS_DLL  Absolute path to built CadHeadless.dll
  ACC_DEBUG         "1" => keep temp files and print stdout/stderr tails

Public API:
  run_command(dwg_path, command, args)
  list_blocks(dwg_path, out_json)
  list_inserts(dwg_path, out_json)
  get_block_curves(dwg_path, block_name, out_json)
  plot_batch(dwg_path, out_dir, paper="")
"""
from __future__ import annotations

import os
import subprocess
import tempfile
import json
from pathlib import Path
from typing import List, Dict, Any, Tuple


class AutoCADCoreError(Exception):
    """Raised for accoreconsole failures or result IO problems."""
    def __init__(self, message: str, returncode: int | None = None,
                 stdout: str | None = None, stderr: str | None = None,
                 script: str | None = None):
        super().__init__(message)
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
        self.script = script


def get_accore_path() -> str:
    """Resolve accoreconsole.exe path."""
    return os.environ.get('ACCORE', r'C:\Program Files\Autodesk\AutoCAD 2026\accoreconsole.exe')


def get_dll_path() -> str:
    """Resolve CadHeadless.dll path; fail early if missing."""
    dll_path = os.environ.get('CAD_HEADLESS_DLL')
    if not dll_path:
        raise AutoCADCoreError(
            "CAD_HEADLESS_DLL environment variable not set. "
            "Set it to the absolute path of CadHeadless.dll"
        )
    if not os.path.exists(dll_path):
        raise AutoCADCoreError(f"CadHeadless.dll not found at: {dll_path}")
    return dll_path


def create_script_file(dwg_path: str, command: str) -> str:
    """
    Create a temporary .scr that:
      OPEN -> FILEDIA 0 -> SECURELOAD 0 -> NETLOAD "<dll>" -> <COMMAND> -> QUIT
    Why: avoid hidden dialogs and NETLOAD trust prompts in headless mode.
    """
    dll_path = get_dll_path()
    fd, script_path = tempfile.mkstemp(suffix='.scr', text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(f'OPEN "{dwg_path}"\n')
            f.write('FILEDIA 0\n')       # prevent dialogs that hang headless
            f.write('SECURELOAD 0\n')    # bypass NETLOAD trust prompt
            f.write(f'NETLOAD "{dll_path}"\n')
            f.write(f'{command}\n')
            f.write('QUIT\n')
        return script_path
    except Exception:
        try:
            os.unlink(script_path)
        except Exception:
            pass
        raise


def run_command(dwg_path: str, command: str, args: List[str]) -> Tuple[int, str, str]:
    """Execute a headless AutoCAD command and return (rc, stdout, stderr)."""
    accore_path = get_accore_path()
    if not os.path.exists(accore_path):
        raise AutoCADCoreError(f"AutoCAD Core Console not found at: {accore_path}")
    if not os.path.exists(dwg_path):
        raise AutoCADCoreError(f"DWG file not found: {dwg_path}")

    script_path: str | None = None
    try:
        script_path = create_script_file(dwg_path, command)

        # C# reads ACC_ARGS; pre-quote items with spaces/tabs.
        env = os.environ.copy()
        if args:
            quoted = [f'"{a}"' if (' ' in a or '\t' in a) else a for a in args]
            env['ACC_ARGS'] = ' '.join(quoted)

        # Only use /s; script opens the DWG to ensure our prelude runs.
        cmd = [accore_path, '/s', script_path]

        print(f"[RUNNER] Executing: {' '.join(cmd)}")
        print(f"[RUNNER] Script: {script_path}")
        if args:
            print(f"[RUNNER] Args: {env.get('ACC_ARGS', '')}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=300
        )
        print(f"[RUNNER] Return code: {result.returncode}")

        if result.returncode != 0:
            raise AutoCADCoreError(
                f"AutoCAD command failed with return code {result.returncode}",
                returncode=result.returncode,
                stdout=result.stdout,
                stderr=result.stderr,
                script=script_path
            )
        return result.returncode, result.stdout, result.stderr

    finally:
        # Keep files only if debugging
        if script_path and os.path.exists(script_path) and os.environ.get("ACC_DEBUG") != "1":
            try:
                os.unlink(script_path)
            except Exception:
                pass


def _read_json_or_fail(json_path: str) -> Dict[str, Any]:
    """Read JSON (BOM tolerant) with clear diagnostics."""
    p = Path(json_path)
    if not p.exists():
        raise AutoCADCoreError(f"Result file not found: {json_path}")
    if p.stat().st_size == 0:
        raise AutoCADCoreError(f"Result file is empty: {json_path}")
    try:
        # utf-8-sig strips BOM if present
        with p.open('r', encoding='utf-8-sig') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        raise AutoCADCoreError(f"Failed to parse JSON result: {e}") from e


def load_json_result(json_path: str) -> Dict[str, Any]:
    data = _read_json_or_fail(json_path)
    if isinstance(data, dict) and data.get('Status') == 'Error':
        raise AutoCADCoreError(f"Command failed: {data.get('Message', 'Unknown error')}")
    return data


def list_blocks(dwg_path: str, out_json: str) -> Dict[str, Any]:
    print(f"[RUNNER] Listing blocks from: {dwg_path}")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    run_command(dwg_path, 'LISTBLOCKS', [out_json])
    return load_json_result(out_json)

def get_block_tags(dwg_path: str, block_name: str, out_json: str) -> Dict[str, Any]:
    """Return [{Tag, X, Y, Height}, ...] for a block."""
    print(f"[RUNNER] Getting tag anchors for block '{block_name}' from: {dwg_path}")
    os.makedirs(os.path.dirname(out_json) or os.getcwd(), exist_ok=True)
    # AutoLISP expects "block_name|output_file" format
    combined_args = f"{block_name}|{out_json}"
    run_command(dwg_path, 'GETBLOCKTAGS', [combined_args])
    return load_json_result(out_json)


def list_inserts(dwg_path: str, out_json: str) -> Dict[str, Any]:
    print(f"[RUNNER] Listing inserts from: {dwg_path}")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    run_command(dwg_path, 'LISTINSERTS', [out_json])
    return load_json_result(out_json)


def get_block_curves(dwg_path: str, block_name: str, out_json: str) -> Dict[str, Any]:
    print(f"[RUNNER] Getting curves for block '{block_name}' from: {dwg_path}")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    # AutoLISP expects "block_name|output_file" format
    combined_args = f"{block_name}|{out_json}"
    run_command(dwg_path, 'GETBLOCKCURVES', [combined_args])
    return load_json_result(out_json)


def plot_batch(dwg_path: str, out_dir: str, paper: str = "") -> Dict[str, Any]:
    print(f"[RUNNER] Batch plotting from: {dwg_path} to: {out_dir}")
    os.makedirs(out_dir, exist_ok=True)
    args = [out_dir] + ([paper] if paper else [])
    run_command(dwg_path, 'PLOTBATCH', args)
    status_file = os.path.join(out_dir, 'plot_status.json')
    return load_json_result(status_file)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python run_accore.py <dwg_file> <command> [args...]")
        print("Commands:\n  blocks <out.json>\n  inserts <out.json>\n  curves <block_name> <out.json>\n  plot <out_dir> [paper_size]")
        raise SystemExit(1)

    dwg_file = sys.argv[1]
    command = sys.argv[2]

    try:
        if command == "blocks":
            if len(sys.argv) < 4:
                print("Usage: blocks <out.json>"); raise SystemExit(1)
            result = list_blocks(dwg_file, sys.argv[3]); print(f"Found {len(result.get('Data', []))} blocks")
        
        elif command == "tags":
            if len(sys.argv) < 5: print("Usage: tags <block_name> <out.json>"); sys.exit(1)
            result = get_block_tags(dwg_file, sys.argv[3], sys.argv[4])
            print(f"Found {len(result.get('Data', []))} tag anchors")

        elif command == "inserts":
            if len(sys.argv) < 4:
                print("Usage: inserts <out.json>"); raise SystemExit(1)
            result = list_inserts(dwg_file, sys.argv[3]); print(f"Found {len(result.get('Data', []))} inserts")

        elif command == "curves":
            if len(sys.argv) < 5:
                print("Usage: curves <block_name> <out.json>"); raise SystemExit(1)
            result = get_block_curves(dwg_file, sys.argv[3], sys.argv[4]); print(f"Found {len(result.get('Data', []))} curves")

        elif command == "plot":
            if len(sys.argv) < 4:
                print("Usage: plot <out_dir> [paper_size]"); raise SystemExit(1)
            paper = sys.argv[4] if len(sys.argv) > 4 else ""
            result = plot_batch(dwg_file, sys.argv[3], paper); print(f"Plotted {len(result.get('Data', []))} layouts")

        else:
            print(f"Unknown command: {command}"); raise SystemExit(1)

    except AutoCADCoreError as e:
        print(f"Error: {e}")
        if e.stdout: print("--- stdout (tail) ---\n" + e.stdout[-2000:])
        if e.stderr: print("--- stderr (tail) ---\n" + e.stderr[-2000:])
        if e.script and os.path.exists(e.script):
            print("--- script ---\n" + Path(e.script).read_text(encoding="utf-8"))
        raise SystemExit(1)
