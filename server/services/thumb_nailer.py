# path: app/ui/thumbnailer.py
#!/usr/bin/env python3
from __future__ import annotations
import os, tempfile, time, hashlib
from typing import Optional, Tuple, List, Dict

from PySide6.QtCore import QThread, Signal, QSize, QRectF, Qt
from PySide6.QtGui import QImage, QPainter, QPen, QColor

# our runner
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'tools'))
import run_accore  # noqa

def _hash_key(path: str) -> str:
    st = os.stat(path)
    h = hashlib.sha1()
    h.update(path.encode("utf-8", "ignore"))
    h.update(str(int(st.st_mtime)).encode())
    h.update(str(int(st.st_size)).encode())
    return h.hexdigest()

def _compute_bbox(curves: List[Dict]) -> Optional[QRectF]:
    xs, ys = [], []
    for c in curves:
        pts = c.get("Points") or c.get("points") or []
        for i in range(0, len(pts), 2):
            if i + 1 < len(pts):
                xs.append(float(pts[i])); ys.append(float(pts[i+1]))
    if not xs:
        return None
    x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys)
    return QRectF(x0, y0, max(1e-3, x1 - x0), max(1e-3, y1 - y0))

class ThumbnailWorker(QThread):
    """Create a PNG thumbnail for a DWG (first block preview)."""
    ready = Signal(str, str)  # (dwg_path, png_path)
    failed = Signal(str, str) # (dwg_path, error)

    def __init__(self, dwg_path: str, cache_dir: str, size: Tuple[int,int]=(256,256), parent=None):
        super().__init__(parent)
        self.dwg_path = dwg_path
        self.cache_dir = cache_dir
        self.size = QSize(*size)

    def run(self):
        try:
            os.makedirs(self.cache_dir, exist_ok=True)
            key = _hash_key(self.dwg_path)
            out_png = os.path.join(self.cache_dir, f"{key}.png")
            if os.path.exists(out_png):
                self.ready.emit(self.dwg_path, out_png)
                return

            # 1) get blocks
            with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f: blocks_json = f.name
            blocks = run_accore.list_blocks(self.dwg_path, blocks_json)
            try: os.unlink(blocks_json)
            except: pass
            data = blocks.get("Data") or []
            if not data:
                raise RuntimeError("No blocks found")

            first_name = (data[0] or {}).get("Name")
            if not first_name:
                raise RuntimeError("First block has no name")

            # 2) get curves for first block
            with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as f: curves_json = f.name
            curves_res = run_accore.get_block_curves(self.dwg_path, first_name, curves_json)
            try: os.unlink(curves_json)
            except: pass
            curves = curves_res.get("Data") or []
            if not curves:
                raise RuntimeError("No curves to render")

            bbox = _compute_bbox(curves)
            if bbox is None:
                raise RuntimeError("Empty bbox")

            # 3) render onto QImage (Y-up -> flip)
            img = QImage(self.size, QImage.Format.Format_ARGB32_Premultiplied)
            img.fill(0)  # transparent/black
            p = QPainter(img)
            p.setRenderHints(QPainter.Antialiasing | QPainter.TextAntialiasing)

            # compute transform -> map bbox into image with margins
            margin = 0.10
            bx = bbox.adjusted(-bbox.width()*margin, -bbox.height()*margin,
                               bbox.width()*margin,  bbox.height()*margin)

            # image coords (0,0)-(W,H) ; CAD Y-up -> flip Y: scale(1,-1) and translate
            W, H = self.size.width(), self.size.height()
            sx = W / bx.width()
            sy = H / bx.height()
            s  = min(sx, sy)
            # center
            tx = -bx.left()*s + 0.5*(W - s*bx.width())
            ty =  H + (bx.top()*s) - 0.5*(H - s*bx.height())  # account for flip

            p.translate(tx, ty)
            p.scale(s, -s)  # flip Y here

            pen = QPen(QColor(0,120,215), 0)  # cosmetic 0 width -> 1px
            p.setPen(pen)
            for c in curves:
                kind = (c.get("Kind") or c.get("kind") or "").lower()
                pts = list(c.get("Points") or c.get("points") or [])
                if kind == "line" and len(pts) >= 4:
                    x1,y1,x2,y2 = pts[:4]
                    p.drawLine(x1,y1,x2,y2)
                elif kind == "polyline" and len(pts) >= 4:
                    for i in range(0,len(pts)-2,2):
                        x1,y1 = pts[i], pts[i+1]
                        x2,y2 = pts[i+2], pts[i+3]
                        p.drawLine(x1,y1,x2,y2)

            p.end()
            img.save(out_png, "PNG")
            self.ready.emit(self.dwg_path, out_png)
        except Exception as e:
            self.failed.emit(self.dwg_path, str(e))
