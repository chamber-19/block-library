# path: app/ui/indexer.py
#!/usr/bin/env python3
from __future__ import annotations
import os, sqlite3, time, tempfile, threading
from typing import List, Dict, Any, Optional, Tuple

# tools runner
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'tools'))
import run_accore  # noqa: E402

# ---------- DB helpers ----------
def default_db_path() -> str:
    env = os.environ.get("BLOCKLIB_DB", "").strip()
    if env:
        os.makedirs(os.path.dirname(env), exist_ok=True)
        return env
    # fallback: local user
    db_dir = os.path.join(os.path.expanduser("~"), "AppData", "Local", "BlockLibrary")
    os.makedirs(db_dir, exist_ok=True)
    return os.path.join(db_dir, "index.db")

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE IF NOT EXISTS roots(
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS files(
  id INTEGER PRIMARY KEY,
  root_id INTEGER NOT NULL,
  path TEXT UNIQUE NOT NULL,
  mtime INTEGER NOT NULL,
  size  INTEGER NOT NULL,
  seen_at INTEGER NOT NULL,
  FOREIGN KEY(root_id) REFERENCES roots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks(
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(file_id, name) ON CONFLICT REPLACE,
  FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS attrs(
  id INTEGER PRIMARY KEY,
  block_id INTEGER NOT NULL,
  tag TEXT,
  prompt TEXT,
  defval TEXT,
  FOREIGN KEY(block_id) REFERENCES blocks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_blocks_name ON blocks(name);
CREATE INDEX IF NOT EXISTS idx_attrs_tag ON attrs(tag);
CREATE INDEX IF NOT EXISTS idx_files_root ON files(root_id);
"""

def open_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    dbp = db_path or default_db_path()
    os.makedirs(os.path.dirname(dbp), exist_ok=True)
    conn = sqlite3.connect(dbp, timeout=30, check_same_thread=False)
    conn.executescript(SCHEMA)
    return conn

def get_db_path() -> str:
    return os.path.abspath(default_db_path())

# ---------- CRUD for roots ----------
def add_root(conn: sqlite3.Connection, path: str) -> int:
    ap = os.path.abspath(path)
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO roots(path) VALUES(?)", (ap,))
    conn.commit()
    cur.execute("SELECT id FROM roots WHERE path=?", (ap,))
    return cur.fetchone()[0]

def remove_root(conn: sqlite3.Connection, path: str) -> None:
    conn.execute("DELETE FROM roots WHERE path=?", (os.path.abspath(path),))
    conn.commit()

def list_roots(conn: sqlite3.Connection) -> List[Tuple[int, str]]:
    return list(conn.execute("SELECT id, path FROM roots ORDER BY path"))

# ---------- Internal helpers ----------
def _now() -> int: return int(time.time())

def _file_sig(p: str) -> Tuple[int, int]:
    st = os.stat(p); return int(st.st_mtime), int(st.st_size)

def _upsert_file(conn: sqlite3.Connection, root_id: int, path: str, mtime: int, size: int) -> int:
    ap = os.path.abspath(path)
    conn.execute("""
        INSERT INTO files(root_id, path, mtime, size, seen_at)
        VALUES(?,?,?,?,?)
        ON CONFLICT(path) DO UPDATE SET
            root_id=excluded.root_id,
            mtime=excluded.mtime,
            size=excluded.size,
            seen_at=excluded.seen_at
    """, (root_id, ap, mtime, size, _now()))
    conn.commit()
    cur = conn.execute("SELECT id FROM files WHERE path=?", (ap,))
    return cur.fetchone()[0]

def _get_file_row(conn: sqlite3.Connection, path: str):
    cur = conn.execute("SELECT id, mtime, size FROM files WHERE path=?", (os.path.abspath(path),))
    return cur.fetchone()

def _replace_block_attrs(conn: sqlite3.Connection, file_id: int, name: str, attdefs: List[Dict[str, Any]]):
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO blocks(file_id,name) VALUES(?,?)", (file_id, name))
    cur.execute("SELECT id FROM blocks WHERE file_id=? AND name=?", (file_id, name))
    bid = cur.fetchone()[0]
    cur.execute("DELETE FROM attrs WHERE block_id=?", (bid,))
    if attdefs:
        cur.executemany(
            "INSERT INTO attrs(block_id, tag, prompt, defval) VALUES(?,?,?,?)",
            [(bid, a.get("Tag") or "", a.get("Prompt") or "", a.get("Default") or "") for a in attdefs]
        )
    conn.commit()

def _sweep_unseen(conn: sqlite3.Connection, root_id: int, before_ts: int) -> int:
    rows = conn.execute("SELECT id FROM files WHERE root_id=? AND seen_at<?", (root_id, before_ts)).fetchall()
    if rows:
        conn.executemany("DELETE FROM files WHERE id=?", rows)
        conn.commit()
    return len(rows)

# ---------- Non-Qt core used by QThread ----------
class IndexStats:
    def __init__(self): self.scanned=0; self.updated=0; self.skipped=0; self.deleted=0

class IndexerCore:
    def __init__(self, roots: List[str], db_path: Optional[str] = None):
        self.roots = [os.path.abspath(p) for p in roots if os.path.isdir(p)]
        self.db_path = db_path or get_db_path()
        self._stop = threading.Event()

    def stop(self): self._stop.set()
    def should_stop(self) -> bool: return self._stop.is_set()

    def run(self, progress_cb=None) -> IndexStats:
        conn = open_db(self.db_path)
        stats = IndexStats()

        for root in self.roots:
            if self.should_stop(): break
            rid = add_root(conn, root)
            sweep_mark = _now()

            for dirpath, _, files in os.walk(root):
                if self.should_stop(): break
                for name in files:
                    if not name.lower().endswith(".dwg"): continue
                    fpath = os.path.join(dirpath, name)
                    stats.scanned += 1
                    try:
                        mtime, size = _file_sig(fpath)
                    except Exception:
                        continue

                    row = _get_file_row(conn, fpath)
                    if row and row[1] == mtime and row[2] == size:
                        _upsert_file(conn, rid, fpath, mtime, size)
                        stats.skipped += 1
                        if progress_cb: progress_cb(f"Skipped: {fpath}")
                        continue

                    if progress_cb: progress_cb(f"Indexing: {fpath}")
                    try:
                        with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tf:
                            out = tf.name
                        res = run_accore.list_blocks(fpath, out)
                    finally:
                        try: os.unlink(out)
                        except: pass

                    data = res.get("Data") or []
                    file_id = _upsert_file(conn, rid, fpath, mtime, size)

                    # clear & replace rows for this file
                    conn.execute("DELETE FROM attrs WHERE block_id IN (SELECT id FROM blocks WHERE file_id=?)", (file_id,))
                    conn.execute("DELETE FROM blocks WHERE file_id=?", (file_id,))
                    conn.commit()

                    for blk in data:
                        _replace_block_attrs(conn, file_id, blk.get("Name",""), blk.get("AttDefs") or [])
                    stats.updated += 1

            stats.deleted += _sweep_unseen(conn, rid, sweep_mark)

        conn.close()
        return stats
