from __future__ import annotations
import os, sys
from typing import Optional
from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel, QPushButton, QComboBox, QFileDialog, QStatusBar

# --- make both "import as package" and "run by path" work ---
try:
    # when imported as server.ui.windows.mini_block_viewer
    from ..widgets.preview_widget import BlockPreviewWidget
    from ..widgets.accore_worker import AutoCADWorker
except Exception:
    # when run directly (double-click / by path)
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    sys.path.insert(0, _ROOT)
    from server.ui.widgets.preview_widget import BlockPreviewWidget        # noqa: E402
    from server.ui.widgets.accore_worker import AutoCADWorker              # noqa: E402



class MiniBlockViewer(QMainWindow):
    status = Signal(str)

    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setWindowTitle("Block Viewer")
        self.resize(1100, 780)
        self.setStatusBar(QStatusBar())
        self.statusBar().showMessage("Ready")
        self._dwg: Optional[str] = None
        self._curves_cache: dict[str, list] = {}

        root = QWidget(); self.setCentralWidget(root)
        v = QVBoxLayout(root); v.setContentsMargins(10, 10, 10, 10); v.setSpacing(8)

        bar = QHBoxLayout(); bar.setSpacing(6)
        self.open_btn = QPushButton("Open DWG…"); self.open_btn.clicked.connect(self._open_dwg)
        self.blocks = QComboBox(); self.blocks.currentTextChanged.connect(self._load_block)
        self.tags_btn = QPushButton("Tags"); self.tags_btn.setCheckable(True); self.tags_btn.toggled.connect(self._toggle_tags)
        self.fit_btn = QPushButton("Fit"); self.fit_btn.clicked.connect(self._fit)
        bar.addWidget(self.open_btn); bar.addWidget(QLabel("Block:")); bar.addWidget(self.blocks, 1)
        bar.addWidget(self.tags_btn); bar.addWidget(self.fit_btn)
        v.addLayout(bar)

        self.canvas = BlockPreviewWidget()
        v.addWidget(self.canvas, 1)
        # Optional: default tag colors; adapt to your preview_widget API
        if hasattr(self.canvas, "set_tag_color_map"):
            self.canvas.set_tag_color_map({"TAG": (0, 180, 255), "T1": (120, 220, 120), "T2": (230, 160, 90)})

    # ---- public API ----
    def open_dwg(self, path: str):
        if not path:
            return
        self._dwg = path
        self.statusBar().showMessage(f"Opening: {os.path.basename(path)}")
        self._list_blocks(path)

    # ---- actions ----
    def _open_dwg(self):
        p, _ = QFileDialog.getOpenFileName(self, "Open DWG", "", "DWG Files (*.dwg);;All Files (*)")
        if p:
            self.open_dwg(p)

    def _list_blocks(self, dwg: str):
        self.blocks.clear()
        w = AutoCADWorker(dwg, "list_blocks")
        w.finished.connect(self._on_blocks)
        w.error.connect(lambda e: self.statusBar().showMessage(f"Error: {e}", 5000))
        w.start()

    def _on_blocks(self, res: dict):
        data = (res or {}).get("Data") or []
        names = [b.get("Name") for b in data if b.get("Name")]
        self.blocks.addItems(names)

    def _load_block(self, name: str):
        if not self._dwg or not name:
            return
        if name in self._curves_cache:
            if hasattr(self.canvas, "show_curves"):
                self.canvas.show_curves(self._curves_cache[name])
            if self.tags_btn.isChecked():
                self._load_tags(name)
            return
        w = AutoCADWorker(self._dwg, "get_block_curves", name)
        w.finished.connect(lambda r: self._on_curves(name, r))
        w.error.connect(lambda e: self.statusBar().showMessage(f"Error: {e}", 5000))
        w.start()

    def _on_curves(self, name: str, res: dict):
        curves = (res or {}).get("Data") or []
        self._curves_cache[name] = curves
        if hasattr(self.canvas, "show_curves"):
            self.canvas.show_curves(curves)
        if self.tags_btn.isChecked():
            self._load_tags(name)

    def _load_tags(self, name: str):
        w = AutoCADWorker(self._dwg, "get_block_tags", name)
        w.finished.connect(lambda r: self.canvas.show_tags((r or {}).get("Data") or []))
        w.error.connect(lambda e: self.statusBar().showMessage(f"Error: {e}", 5000))
        w.start()

    def _toggle_tags(self, on: bool):
        if on and self.blocks.currentText():
            self._load_tags(self.blocks.currentText())
        else:
            if hasattr(self.canvas, "clear_tags"):
                self.canvas.clear_tags()

    def _fit(self):
        # Re-showing curves will recompute the grid/fit in most preview_widget implementations
        name = self.blocks.currentText()
        if name and name in self._curves_cache and hasattr(self.canvas, "show_curves"):
            self.canvas.show_curves(self._curves_cache[name])

