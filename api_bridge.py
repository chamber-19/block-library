#!/usr/bin/env python3
"""
API Bridge for Block Library
Connects the React web app to Python desktop application functionality.

This FastAPI server provides REST endpoints that the web app can call
to trigger AutoCAD Core operations, file system operations, and thumbnail generation.

Usage:
    python api_bridge.py

Requirements:
    pip install fastapi uvicorn python-multipart supabase watchdog
"""

import os
import sys
import json
import tempfile
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    from fastapi import FastAPI, HTTPException, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, JSONResponse
    import uvicorn
except ImportError:
    print("FastAPI not installed. Run: pip install fastapi uvicorn python-multipart")
    sys.exit(1)

# Add server directory to path for imports
server_dir = Path(__file__).parent / "server"
if server_dir.exists():
    sys.path.insert(0, str(server_dir))

app = FastAPI(
    title="Block Library API Bridge",
    description="Bridge between React web app and Python desktop application",
    version="1.0.0"
)

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Health & Status
# ============================================================

@app.get("/")
async def root():
    return {
        "service": "Block Library API Bridge",
        "status": "running",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "dwg": "/api/dwg/*",
            "files": "/api/files/*",
            "thumbnails": "/api/thumbnails/*",
        }
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "python_version": sys.version,
        "accore_available": check_accore_available(),
    }


def check_accore_available() -> bool:
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import run_accore
        return True
    except Exception:
        return False


# ============================================================
# DWG Processing Endpoints
# ============================================================

@app.post("/api/dwg/process")
async def process_dwg(file: UploadFile = File(...)):
    """
    Upload a DWG file and process it to extract block information.
    Returns block names, insert counts, and metadata.
    """
    if not check_accore_available():
        raise HTTPException(
            status_code=503,
            detail="AutoCAD Core worker not available"
        )

    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(suffix=".dwg", delete=False) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Import AutoCAD worker
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import run_accore

        # List blocks
        out_json = tmp_path + "_blocks.json"
        blocks_result = run_accore.list_blocks(tmp_path, out_json)

        # List inserts
        out_json2 = tmp_path + "_inserts.json"
        inserts_result = run_accore.list_inserts(tmp_path, out_json2)

        # Cleanup
        os.unlink(tmp_path)
        try:
            os.unlink(out_json)
            os.unlink(out_json2)
        except Exception:
            pass

        return {
            "filename": file.filename,
            "blocks": blocks_result,
            "inserts": inserts_result,
            "processed_at": datetime.now().isoformat(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dwg/blocks/{filename}")
async def get_dwg_blocks(filename: str, path: Optional[str] = None):
    """Get list of blocks from a DWG file."""
    if not check_accore_available():
        raise HTTPException(
            status_code=503,
            detail="AutoCAD Core worker not available"
        )

    try:
        dwg_path = path or os.path.join(tempfile.gettempdir(), filename)
        if not os.path.exists(dwg_path):
            raise HTTPException(status_code=404, detail="DWG file not found")

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import run_accore

        out_json = tempfile.mktemp(suffix=".json")
        result = run_accore.list_blocks(dwg_path, out_json)
        try:
            os.unlink(out_json)
        except Exception:
            pass

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/dwg/curves/{filename}/{blockname}")
async def get_block_curves(filename: str, blockname: str, path: Optional[str] = None):
    """Get curve data for a specific block in a DWG file."""
    if not check_accore_available():
        raise HTTPException(
            status_code=503,
            detail="AutoCAD Core worker not available"
        )

    try:
        dwg_path = path or os.path.join(tempfile.gettempdir(), filename)
        if not os.path.exists(dwg_path):
            raise HTTPException(status_code=404, detail="DWG file not found")

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
        import run_accore

        out_json = tempfile.mktemp(suffix=".json")
        result = run_accore.get_block_curves(dwg_path, blockname, out_json)
        try:
            os.unlink(out_json)
        except Exception:
            pass

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# File System Operations
# ============================================================

@app.get("/api/files/scan")
async def scan_library_folders(root_path: str):
    """
    Scan a directory for DWG files recursively.
    Returns list of files with metadata.
    """
    if not os.path.exists(root_path):
        raise HTTPException(status_code=404, detail="Path not found")

    try:
        dwg_files = []
        for root, dirs, files in os.walk(root_path):
            for file in files:
                if file.lower().endswith(('.dwg', '.dxf')):
                    full_path = os.path.join(root, file)
                    stat = os.stat(full_path)
                    dwg_files.append({
                        "path": full_path,
                        "filename": file,
                        "size": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        "relative_path": os.path.relpath(full_path, root_path),
                    })

        return {
            "root": root_path,
            "count": len(dwg_files),
            "files": dwg_files,
            "scanned_at": datetime.now().isoformat(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/files/sync")
async def sync_to_database(root_path: str, category_id: str):
    """
    Sync DWG files from a directory to Supabase database.
    Requires Supabase credentials in environment.
    """
    try:
        from supabase import create_client, Client

        supabase_url = os.getenv("VITE_SUPABASE_URL")
        supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY")

        if not supabase_url or not supabase_key:
            raise HTTPException(
                status_code=500,
                detail="Supabase credentials not configured"
            )

        supabase: Client = create_client(supabase_url, supabase_key)

        # Scan files
        scan_result = await scan_library_folders(root_path)

        # Insert or update blocks
        synced = 0
        for file_info in scan_result["files"]:
            block_data = {
                "name": os.path.splitext(file_info["filename"])[0],
                "category_id": category_id,
                "dwg_path": file_info["path"],
                "last_modified": file_info["modified"],
                "metadata": {
                    "size": file_info["size"],
                    "relative_path": file_info["relative_path"],
                }
            }

            try:
                result = supabase.table("blocks").insert(block_data).execute()
                synced += 1
            except Exception as e:
                print(f"Error syncing {file_info['filename']}: {e}")

        return {
            "root": root_path,
            "total": len(scan_result["files"]),
            "synced": synced,
            "synced_at": datetime.now().isoformat(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Thumbnail Generation
# ============================================================

@app.post("/api/thumbnails/generate")
async def generate_thumbnail(
    file: UploadFile = File(...),
    size: int = 256
):
    """
    Generate a PNG thumbnail for a DWG file.
    Uses AutoCAD Core to render the block.
    """
    if not check_accore_available():
        raise HTTPException(
            status_code=503,
            detail="AutoCAD Core worker not available"
        )

    try:
        # Save uploaded file
        with tempfile.NamedTemporaryFile(suffix=".dwg", delete=False) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        # Generate thumbnail (placeholder - implement actual rendering)
        thumb_path = tmp_path + ".png"

        # TODO: Implement actual thumbnail rendering using Qt or PIL
        # For now, return a placeholder response

        return {
            "filename": file.filename,
            "thumbnail": "placeholder",
            "size": size,
            "generated_at": datetime.now().isoformat(),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Watch Service Status
# ============================================================

@app.get("/api/watch/status")
async def watch_status():
    """Get status of file system watch service."""
    try:
        import watchdog
        return {
            "available": True,
            "version": watchdog.__version__,
            "running": False,  # TODO: Track actual watcher state
        }
    except ImportError:
        return {
            "available": False,
            "message": "Watchdog not installed"
        }


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Block Library API Bridge")
    print("=" * 60)
    print(f"Starting server...")
    print(f"AutoCAD Core available: {check_accore_available()}")
    print(f"\nAPI Documentation: http://localhost:8000/docs")
    print(f"Health check: http://localhost:8000/health")
    print("=" * 60)

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
