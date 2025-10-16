#!/usr/bin/env python3
"""AutoCAD Block Library - PySide6 Desktop Application"""

import sys
import os
import tempfile
import time
import webbrowser
from typing import Dict, Any, Set, Optional, List

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QHBoxLayout,
    QTreeWidget, QTreeWidgetItem, QTabWidget,
    QStatusBar, QFileDialog, QMessageBox, QToolBar, QPushButton,
    QSplitter, QCheckBox, QGraphicsView, QGraphicsScene, QHeaderView,
    QLineEdit, QListWidget, QListWidgetItem, QLabel, QVBoxLayout
)
from PySide6.QtCore import Qt, QTimer, QThread, Signal, QSize, QSettings, QStandardPaths
from PySide6.QtGui import QAction, QPainter, QTransform, QIcon

# Tools (runner)
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'tools'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Core imports
from server.core.run_accore import run_accore  # noqa: E402
from server.core.library_config import LibraryConfig  # noqa: E402
from server.core.roots_manager import RootsManagerDialog  # noqa: E402
from server.core.indexer import IndexerCore, open_db, list_roots, get_db_path  # noqa: E402

# Services imports
from server.services.thumb_nailer import ThumbnailWorker  # noqa: E402

# UI widgets imports
from server.ui.widgets.preview_widget import BlockPreviewWidget  # noqa: E402


# ---------------------- Worker ----------------------
class AutoCADWorker(QThread):
    finished = Signal(dict)
    error = Signal(str)
    progress = Signal(str)

    def __init__(self, dwg_path: str, command: str, *args, parent=None):
        super().__init__(parent)
        self.dwg_path = dwg_path
        self.command = command
        self.args = args

    def run(self):
        try:
            if self.command == 'list_blocks':
                with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
                    out = f.name
                self.progress.emit("Listing blocks...")
                result = run_accore.list_blocks(self.dwg_path, out)
                try: os.unlink(out)
                except: pass
                self.finished.emit(result)

            elif self.command == 'list_inserts':
                with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
                    out = f.name
                self.progress.emit("Listing block inserts...")
                result = run_accore.list_inserts(self.dwg_path, out)
                try: os.unlink(out)
                except: pass
                self.finished.emit(result)

            elif self.command == 'get_block_curves':
                block = self.args[0]
                with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
                    out = f.name
                self.progress.emit(f"Getting curves for '{block}'...")
                result = run_accore.get_block_curves(self.dwg_path, block, out)
                try: os.unlink(out)
                except: pass
                self.finished.emit(result)

            elif self.command == 'get_block_tags':
                block = self.args[0]
                with tempfile.NamedTemporaryFile(suffix='.json', delete=False) as f:
                    out = f.name
                self.progress.emit(f"Getting tag anchors for '{block}'...")
                result = run_accore.get_block_tags(self.dwg_path, block, out)
                try: os.unlink(out)
                except: pass
                self.finished.emit(result)

            elif self.command == 'plot_batch':
                out_dir = self.args[0]
                paper = self.args[1] if len(self.args) > 1 else ""
                self.progress.emit("Batch plotting to PDF...")
                result = run_accore.plot_batch(self.dwg_path, out_dir, paper)
                self.finished.emit(result)

        except Exception as e:
            self.error.emit(str(e))


# ---------------------- Indexer thread ----------------------
class IndexerThread(QThread):
    progress = Signal(str)
    done = Signal(object)

    def __init__(self, roots: List[str], parent=None):
        super().__init__(parent)
        self.core = IndexerCore(roots)

    def run(self):
        stats = self.core.run(progress_cb=lambda s: self.progress.emit(s))
        self.done.emit(stats)


# (legacy view kept)
class CurveGraphicsView(QGraphicsView):
    def __init__(self):
        super().__init__()
        self.scene = QGraphicsScene(self)
        self.setScene(self.scene)
        self.setRenderHint(QPainter.Antialiasing)
        self.setDragMode(QGraphicsView.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorUnderMouse)
        self.animation_timer = QTimer(self)
        self.animation_timer.timeout.connect(self.animate_rotation)
        self.animation_angle = 0
        self.is_animating = False

    def wheelEvent(self, ev):
        z = 1.15 if ev.angleDelta().y() > 0 else 1/1.15
        self.scale(z, z)

    def toggle_animation(self):
        if self.is_animating:
            self.animation_timer.stop(); self.is_animating = False
        else:
            self.animation_timer.start(50); self.is_animating = True

    def animate_rotation(self):
        self.animation_angle = (self.animation_angle + 2) % 360
        t = QTransform(); t.rotate(self.animation_angle); self.setTransform(t)


# ---------------------- Main Window ----------------------
class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.current_dwg_path: str = ""
        self.current_block_name: str = ""
        self.blocks_data: Dict[str, Any] = {}
        self.inserts_data: Dict[str, Any] = {}
        self.active_workers: Set[AutoCADWorker] = set()

        # Request IDs to prevent out-of-order updates
        self._curve_req_id = 0
        self._tag_req_id = 0

        # Zoom persistence
        self.persist_zoom: bool = True
        self._last_view_tx: Optional[QTransform] = None

        # Library config - ensure persistent storage
        config_dir = os.path.join(os.path.dirname(__file__), "..", "config")
        os.makedirs(config_dir, exist_ok=True)
        self.config_file = os.path.join(config_dir, "library.yaml")
        self.lib_cfg = LibraryConfig(self.config_file)
        self.lib_cfg.ensure_default_categories()

        # Settings for persistent application state
        self.settings = QSettings("BlockLibrary", "AutoCADBlockLibrary")

        # Debug: Print config file location and contents
        print(f"[CONFIG] Library config file: {self.config_file}")
        print(f"[CONFIG] Settings file: {self.settings.fileName()}")
        print(f"[CONFIG] Loaded {len(self.lib_cfg.folders)} folders:")
        for folder in self.lib_cfg.folders:
            print(f"  - {folder['name']}: {folder['path']}")

        self._build_ui()
        self._build_menu()
        self._build_toolbar()
        self._build_status()

        self.setWindowTitle("AutoCAD Block Library")
        self.setGeometry(100, 100, 1280, 840)

        self.tag_colors = {"TAG": (0, 180, 255), "T1": (120, 220, 120), "T2": (230, 160, 90)}
        self.preview_widget.set_tag_color_map(self.tag_colors)
        self.preview_widget.transformChanged.connect(self._remember_transform)

        # Fill library view
        self._reload_library_tree()
        # thumbnail cache
        cache_root = os.path.join(os.path.dirname(__file__), "..", "cache", "thumbnails")
        self.thumb_cache = os.path.abspath(cache_root)
        os.makedirs(self.thumb_cache, exist_ok=True)
        self.thumb_workers: Set[ThumbnailWorker] = set()

        # Restore application state
        self._restore_application_state()

    # -------- UI scaffolding --------
    def _build_ui(self):
        central = QWidget(); self.setCentralWidget(central)
        main_layout = QHBoxLayout(central)

        splitter = QSplitter(Qt.Horizontal); main_layout.addWidget(splitter)

        # LEFT: Library tree + DWG tree
        left_panel = QWidget(); left_layout = QVBoxLayout(left_panel); left_layout.setContentsMargins(0,0,0,0)
        # Library section
        self.lib_search = QLineEdit(); self.lib_search.setPlaceholderText("Search blocks / dwgs...")
        self.lib_search.textChanged.connect(self._filter_library_list)
        left_layout.addWidget(QLabel("Library"))
        left_layout.addWidget(self.lib_search)

        self.library_tree = QTreeWidget(); self.library_tree.setHeaderLabels(["Folder", "Path"])
        self.library_tree.header().setStretchLastSection(True)
        self.library_tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.library_tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self.library_tree.itemSelectionChanged.connect(self._on_library_folder_selected)
        left_layout.addWidget(self.library_tree, 1)

        # DWG section
        left_layout.addWidget(QLabel("Current DWG"))
        self.tree_widget = QTreeWidget()
        self.tree_widget.setHeaderLabels(["Name", "Type", "Details"])
        hdr = self.tree_widget.header()
        hdr.setStretchLastSection(True)
        hdr.setSectionResizeMode(0, QHeaderView.ResizeToContents)
        hdr.setSectionResizeMode(1, QHeaderView.ResizeToContents)
        self.tree_widget.setMinimumWidth(360)
        self.tree_widget.itemClicked.connect(self.on_tree_item_clicked)
        left_layout.addWidget(self.tree_widget, 2)

        splitter.addWidget(left_panel)

        # RIGHT tabs
        self.tab_widget = QTabWidget()
        # 2D Preview
        self.preview_widget = BlockPreviewWidget()
        self.tab_widget.addTab(self.preview_widget, "2D Preview")

        # Library icon view
        lib_tab = QWidget(); lib_layout = QVBoxLayout(lib_tab); lib_layout.setContentsMargins(6,6,6,6)
        self.icon_list = QListWidget()
        self.icon_list.setViewMode(QListWidget.IconMode)
        self.icon_list.setIconSize(QSize(96, 96))
        self.icon_list.setResizeMode(QListWidget.Adjust)
        self.icon_list.setUniformItemSizes(False)
        self.icon_list.setWordWrap(True)
        self.icon_list.itemClicked.connect(self._open_dwg_from_icon)
        lib_layout.addWidget(self.icon_list)
        self.tab_widget.addTab(lib_tab, "Library View")

        splitter.addWidget(self.tab_widget)
        splitter.setSizes([420, 860])

    def _build_menu(self):
        menubar = self.menuBar()
        file_menu = menubar.addMenu("File")
        open_action = QAction("Open DWG", self); open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self.open_dwg_file); file_menu.addAction(open_action)

        # Recent Files submenu
        self.recent_menu = file_menu.addMenu("Recent Files")
        self._update_recent_files_menu()

        file_menu.addSeparator()
        exit_action = QAction("Exit", self); exit_action.setShortcut("Ctrl+Q")
        exit_action.triggered.connect(self.close); file_menu.addAction(exit_action)

        actions = menubar.addMenu("Actions")
        batch_plot_action = QAction("Batch Plot (PDF)", self)
        batch_plot_action.triggered.connect(self.batch_plot_pdf)
        actions.addAction(batch_plot_action)

        # Library menu + Roots Manager entry
        lib = menubar.addMenu("Library")
        add = QAction("Add Folder...", self); add.triggered.connect(self._add_library_folder); lib.addAction(add)
        rem = QAction("Remove Selected Folder", self); rem.triggered.connect(self._remove_library_folder); lib.addAction(rem)
        ren = QAction("Rename Selected Folder...", self); ren.triggered.connect(self._rename_library_folder); lib.addAction(ren)
        lib.addSeparator()
        roots = QAction("Roots Manager…", self); roots.triggered.connect(self._open_roots_manager); lib.addAction(roots)
        reindex = QAction("Re-index Roots (SQLite)…", self); reindex.triggered.connect(self._reindex_roots); lib.addAction(reindex)
        showdb = QAction("Open DB Folder", self); showdb.triggered.connect(lambda: self._reveal_path(os.path.dirname(get_db_path()))); lib.addAction(showdb)

    def _build_toolbar(self):
        toolbar = QToolBar(); self.addToolBar(toolbar)
        fit_btn = QPushButton("Fit to View"); fit_btn.clicked.connect(self.fit_to_view); toolbar.addWidget(fit_btn)
        self.animate_button = QPushButton("Animate"); self.animate_button.setCheckable(True)
        self.animate_button.clicked.connect(self.toggle_animation); toolbar.addWidget(self.animate_button)
        self.show_tags_chk = QCheckBox("Show Tags")
        self.show_tags_chk.toggled.connect(self.on_toggle_show_tags)
        toolbar.addWidget(self.show_tags_chk)

    def _build_status(self):
        self.status_bar = QStatusBar(); self.setStatusBar(self.status_bar)
        self.status_bar.showMessage("Ready")

    # -------- Application State Persistence --------
    def _restore_application_state(self):
        """Restore window geometry, splitter sizes, and other UI state."""
        # Restore window geometry
        geometry = self.settings.value("geometry")
        if geometry:
            self.restoreGeometry(geometry)
        else:
            # Default size if no saved geometry
            self.setGeometry(100, 100, 1400, 900)

        # Restore window state (toolbars, docks, etc.)
        window_state = self.settings.value("windowState")
        if window_state:
            self.restoreState(window_state)

        # Restore splitter sizes
        splitter_sizes = self.settings.value("splitterSizes")
        if splitter_sizes:
            # Convert to integers (QSettings returns strings)
            sizes = [int(size) for size in splitter_sizes if size.isdigit()]
            if len(sizes) >= 2:
                # Find the splitter in the UI
                splitter = self.findChild(QSplitter)
                if splitter:
                    splitter.setSizes(sizes)

        # Restore last opened DWG
        last_dwg = self.settings.value("lastOpenedDWG")
        if last_dwg and os.path.exists(last_dwg):
            print(f"[RESTORE] Reopening last DWG: {last_dwg}")
            # Delay the opening to ensure UI is fully initialized
            QTimer.singleShot(100, lambda: self._open_dwg(last_dwg))

        # Restore recent files list
        self.recent_files = self.settings.value("recentFiles", [])
        if not isinstance(self.recent_files, list):
            self.recent_files = []

        # Restore UI preferences
        show_tags = self.settings.value("showTags", False, type=bool)
        if hasattr(self, 'show_tags_chk'):
            self.show_tags_chk.setChecked(show_tags)

        print(f"[RESTORE] Application state restored from: {self.settings.fileName()}")

    def _save_application_state(self):
        """Save window geometry, splitter sizes, and other UI state."""
        # Save window geometry and state
        self.settings.setValue("geometry", self.saveGeometry())
        self.settings.setValue("windowState", self.saveState())

        # Save splitter sizes
        splitter = self.findChild(QSplitter)
        if splitter:
            sizes = [str(size) for size in splitter.sizes()]
            self.settings.setValue("splitterSizes", sizes)

        # Save last opened DWG
        if self.current_dwg_path:
            self.settings.setValue("lastOpenedDWG", self.current_dwg_path)

        # Save recent files
        if hasattr(self, 'recent_files'):
            self.settings.setValue("recentFiles", self.recent_files)

        # Save UI preferences
        if hasattr(self, 'show_tags_chk'):
            self.settings.setValue("showTags", self.show_tags_chk.isChecked())

        # Force write to disk
        self.settings.sync()
        print(f"[SAVE] Application state saved to: {self.settings.fileName()}")

    def closeEvent(self, event):
        """Handle application close event."""
        self._save_application_state()
        super().closeEvent(event)

    def _add_to_recent_files(self, file_path: str):
        """Add a file to the recent files list."""
        if not hasattr(self, 'recent_files'):
            self.recent_files = []

        # Remove if already in list
        if file_path in self.recent_files:
            self.recent_files.remove(file_path)

        # Add to beginning
        self.recent_files.insert(0, file_path)

        # Keep only last 10 files
        self.recent_files = self.recent_files[:10]

        # Save immediately
        self.settings.setValue("recentFiles", self.recent_files)

        # Update the menu
        self._update_recent_files_menu()

    def _update_recent_files_menu(self):
        """Update the Recent Files menu with current recent files."""
        if not hasattr(self, 'recent_menu'):
            return

        # Clear existing actions
        self.recent_menu.clear()

        # Add recent files
        if hasattr(self, 'recent_files') and self.recent_files:
            for i, file_path in enumerate(self.recent_files):
                if os.path.exists(file_path):
                    # Create action with numbered shortcut (Ctrl+1, Ctrl+2, etc.)
                    action_text = f"&{i+1} {os.path.basename(file_path)}"
                    action = QAction(action_text, self)
                    action.setToolTip(file_path)
                    if i < 9:  # Only add shortcuts for first 9 items
                        action.setShortcut(f"Ctrl+{i+1}")
                    action.triggered.connect(lambda checked, path=file_path: self._open_dwg(path))
                    self.recent_menu.addAction(action)

            # Add separator and clear action
            self.recent_menu.addSeparator()
            clear_action = QAction("Clear Recent Files", self)
            clear_action.triggered.connect(self._clear_recent_files)
            self.recent_menu.addAction(clear_action)
        else:
            # No recent files
            no_files_action = QAction("No recent files", self)
            no_files_action.setEnabled(False)
            self.recent_menu.addAction(no_files_action)

    def _clear_recent_files(self):
        """Clear the recent files list."""
        self.recent_files = []
        self.settings.setValue("recentFiles", self.recent_files)
        self._update_recent_files_menu()

    # -------- Worker management --------
    def _cleanup_worker(self, w: AutoCADWorker):
        if w in self.active_workers: self.active_workers.remove(w)
        w.deleteLater()

    def _start_worker(self, command: str, *args, on_finished=None):
        if not self.current_dwg_path: return None
        w = AutoCADWorker(self.current_dwg_path, command, *args, parent=self)
        self.active_workers.add(w)
        if on_finished: w.finished.connect(on_finished)
        w.finished.connect(lambda *_: self._cleanup_worker(w))
        w.error.connect(lambda msg: (self._cleanup_worker(w), self.on_worker_error(msg)))
        w.progress.connect(self.status_bar.showMessage)
        w.start()
        return w

    # -------- File open / load --------
    def open_dwg_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "Open DWG File", "", "AutoCAD Files (*.dwg);;All Files (*)")
        if not path: return
        self._open_dwg(path)

    def _open_dwg(self, path: str):
        if not os.path.exists(path):
            QMessageBox.warning(self, "File Not Found", f"The file does not exist:\n{path}")
            return

        self.current_dwg_path = path
        self.status_bar.showMessage(f"Loading: {os.path.basename(path)}")
        self.tree_widget.clear()
        self.preview_widget.clear()
        self._last_view_tx = None  # reset on new file

        # Add to recent files
        self._add_to_recent_files(path)

        # Update window title
        self.setWindowTitle(f"AutoCAD Block Library - {os.path.basename(path)}")
        self.current_block_name = ""
        self._curve_req_id += 1; self._tag_req_id += 1  # invalidate pending
        self._start_worker('list_blocks', on_finished=self.on_blocks_loaded)

    def on_blocks_loaded(self, result: Dict[str, Any]):
        self.blocks_data = result
        self._start_worker('list_inserts', on_finished=self.on_inserts_loaded)

    def on_inserts_loaded(self, result: Dict[str, Any]):
        self.inserts_data = result
        self.populate_tree()
        self.status_bar.showMessage(f"Loaded: {os.path.basename(self.current_dwg_path)}")

    # -------- Tree / selection --------
    def populate_tree(self):
        self.tree_widget.clear()

        stem = os.path.splitext(os.path.basename(self.current_dwg_path))[0] if self.current_dwg_path else "Drawing"
        dwg_root = QTreeWidgetItem(self.tree_widget, [stem, "DWG", ""])
        dwg_root.setExpanded(True)

        blocks_root = QTreeWidgetItem(dwg_root, ["Blocks", "Container", ""])
        blocks_root.setExpanded(True)

        first_block_item = None
        first_block_name = None

        for block in self.blocks_data.get('Data', []):
            name = block.get('Name', '')
            item = QTreeWidgetItem(blocks_root, [name, "Block", ""])
            item.setData(0, Qt.UserRole, {'type': 'block', 'name': name})
            if first_block_item is None and name:
                first_block_item, first_block_name = item, name
            for att in block.get('AttDefs', []):
                tag = att.get('Tag', ''); prompt = att.get('Prompt', ''); default = att.get('Default', '')
                QTreeWidgetItem(item, [tag, "AttDef", f"Prompt: {prompt}, Default: {default}"])

        refs_root = QTreeWidgetItem(dwg_root, ["References", "Container", ""])
        refs_root.setExpanded(True)
        for inst in self.inserts_data.get('Data', []):
            nm = inst.get('Name', ''); h = inst.get('Handle', ''); pos = inst.get('Insert', {})
            pos_str = f"({pos.get('X', 0):.2f}, {pos.get('Y', 0):.2f})"
            item = QTreeWidgetItem(refs_root, [nm, "Insert", f"Handle: {h}, Pos: {pos_str}"])
            item.setData(0, Qt.UserRole, {'type': 'insert', 'data': inst})
            for tag, value in (inst.get('Attribs', {}) or {}).items():
                QTreeWidgetItem(item, [tag, "Attrib", f"Value: {value}"])

        # Auto-size columns to content
        self.tree_widget.header().resizeSections(QHeaderView.ResizeToContents)

        if first_block_item and first_block_name:
            self.tree_widget.setCurrentItem(first_block_item)
            self.current_block_name = first_block_name
            self.load_block_curves(first_block_name)
            if self.show_tags_chk.isChecked():
                self.load_block_tags(first_block_name)

    def on_tree_item_clicked(self, item: QTreeWidgetItem, column: int):
        data = item.data(0, Qt.UserRole) or {}
        if not data:
            return
        if data.get('type') == 'block':
            name = data.get('name')
            if not name:
                return
            self.current_block_name = name
            self.load_block_curves(name)
            if self.show_tags_chk.isChecked():
                self.load_block_tags(name)

    # -------- Curves / tags (with request IDs) --------
    def _remember_transform(self, tx: QTransform):
        self._last_view_tx = QTransform(tx)

    def load_block_curves(self, block_name: str):
        started = time.time()
        my_req = self._curve_req_id = self._curve_req_id + 1

        def _done(res: Dict[str, Any]):
            if my_req != self._curve_req_id:
                return  # stale result
            curves = res.get('Data', [])
            self.preview_widget.show_curves(curves)

            if self.persist_zoom and self._last_view_tx is not None:
                self.preview_widget.setTransform(self._last_view_tx)
            else:
                self.preview_widget.fit_to_view(margin=0.12)
                self._last_view_tx = QTransform(self.preview_widget.transform())

            if self.show_tags_chk.isChecked() and self.current_block_name:
                self.load_block_tags(self.current_block_name)

            elapsed = (time.time() - started) * 1000
            self.status_bar.showMessage(
                f"{os.path.basename(self.current_dwg_path)} - Loaded {len(curves)} curves ({elapsed:.0f}ms)"
            )

        self._start_worker('get_block_curves', block_name, on_finished=_done)

    def on_toggle_show_tags(self, checked: bool):
        if not self.current_block_name:
            if not checked:
                self.preview_widget.clear_tags()
            return
        if checked:
            self.load_block_tags(self.current_block_name)
        else:
            self.preview_widget.clear_tags()

    def load_block_tags(self, block_name: str):
        my_req = self._tag_req_id = self._tag_req_id + 1

        def _done(res: Dict[str, Any]):
            if my_req != self._tag_req_id:
                return  # stale
            labels = res.get('Data', [])
            self.preview_widget.show_tags(labels)

        self._start_worker('get_block_tags', block_name, on_finished=_done)

    # -------- Toolbar handlers --------
    def fit_to_view(self):
        self.preview_widget.fit_to_view(margin=0.12)
        self._last_view_tx = QTransform(self.preview_widget.transform())

    def toggle_animation(self):
        self.preview_widget.toggle_animation()
        self.animate_button.setText("Stop Animation" if self.preview_widget.is_animating else "Animate")

    # -------- Library (YAML-backed) --------
    def _reload_library_tree(self):
        self.library_tree.clear()
        for folder in self.lib_cfg.folders:
            item = QTreeWidgetItem(self.library_tree, [folder["name"], folder["path"]])
            item.setData(0, Qt.UserRole, folder)
        self.library_tree.header().resizeSections(QHeaderView.ResizeToContents)

    def _filter_library_list(self, text: str):
        txt = (text or "").lower().strip()
        for i in range(self.icon_list.count()):
            it = self.icon_list.item(i)
            it.setHidden(False if not txt else (txt not in it.text().lower()))

    def _on_library_folder_selected(self):
        items = self.library_tree.selectedItems()
        self.icon_list.clear()
        if not items:
            return
        folder = items[0].data(0, Qt.UserRole) or {}
        base = folder.get("path") or ""
        if not base or not os.path.isdir(base):
            return

        # recursive scan
        dwgs = []
        for root, _, files in os.walk(base):
            for name in files:
                if name.lower().endswith(".dwg"):
                    dwgs.append(os.path.join(root, name))

        # show placeholders, then thumbnails
        for p in sorted(dwgs):
            li = QListWidgetItem(QIcon(), os.path.basename(p))
            li.setData(Qt.UserRole, p)
            li.setSizeHint(QSize(128, 128))
            self.icon_list.addItem(li)

            w = ThumbnailWorker(p, self.thumb_cache, size=(192, 192), parent=self)
            self.thumb_workers.add(w)
            w.ready.connect(lambda dwg, png, item=li: self._apply_thumb(item, png))
            w.failed.connect(lambda dwg, err: None)
            w.finished.connect(lambda w=w: (self.thumb_workers.discard(w), w.deleteLater()))
            w.start()

    def _apply_thumb(self, item: QListWidgetItem, png_path: str):
        if os.path.exists(png_path):
            item.setIcon(QIcon(png_path))

    def _open_dwg_from_icon(self, item: QListWidgetItem):
        path = item.data(Qt.UserRole)
        if not path:
            return
        self._open_dwg(path)

    def _open_roots_manager(self):
        dlg = RootsManagerDialog(self.lib_cfg, self)
        dlg.exec()
        # refresh library list after dialog closes
        self._reload_library_tree()

    def _add_library_folder(self):
        path = QFileDialog.getExistingDirectory(self, "Pick a library folder")
        if not path:
            return
        name = os.path.basename(path.rstrip("\\/")) or "Folder"
        self.lib_cfg.add_folder(name, path)
        self._reload_library_tree()

    def _remove_library_folder(self):
        items = self.library_tree.selectedItems()
        if not items:
            return
        folder = items[0].data(0, Qt.UserRole)
        if not folder:
            return
        self.lib_cfg.remove_folder(folder["name"])
        self._reload_library_tree()

    def _rename_library_folder(self):
        # Kept simple: open a new name via file dialog name field; path ignored
        items = self.library_tree.selectedItems()
        if not items:
            return
        folder = items[0].data(0, Qt.UserRole)
        if not folder:
            return
        new_name = QFileDialog.getSaveFileName(self, "Rename (name only, path ignored)", folder["name"])[0]
        if not new_name:
            return
        self.lib_cfg.rename_folder(folder["name"], os.path.basename(new_name))
        self._reload_library_tree()

    # -------- Plot --------
    def batch_plot_pdf(self):
        if not self.current_dwg_path:
            QMessageBox.warning(self, "Warning", "No DWG file is currently open.")
            return
        out_dir = QFileDialog.getExistingDirectory(self, "Select Output Directory for PDFs")
        if not out_dir:
            return
        started = time.time()

        def _done(res: Dict[str, Any]):
            files = res.get('Data', [])
            elapsed = (time.time() - started) * 1000
            msg = f"Successfully plotted {len(files)} layouts ({elapsed:.0f}ms)"
            self.status_bar.showMessage(msg)
            QMessageBox.information(self, "Batch Plot Complete", f"{msg}\n\nOutput directory: {out_dir}")

        self._start_worker('plot_batch', out_dir, on_finished=_done)

    # -------- Indexing --------
    def _reindex_roots(self):
        """Re-index all library roots using SQLite."""
        roots = [f["path"] for f in self.lib_cfg.folders if f["path"] and os.path.isdir(f["path"])]
        if not roots:
            QMessageBox.information(self, "Index", "No valid roots to index.")
            return

        th = IndexerThread(roots, self)
        th.progress.connect(self.status_bar.showMessage)
        th.done.connect(lambda st: QMessageBox.information(self, "Index complete",
                            f"Scanned: {st.scanned}\nUpdated: {st.updated}\nSkipped: {st.skipped}\nDeleted: {st.deleted}\n\nDB: {get_db_path()}"))
        th.start()

    def _reveal_path(self, path: str):
        """Reveal a path in the file explorer."""
        if not path:
            return
        if os.name == "nt":
            os.startfile(path)  # Windows
        else:
            webbrowser.open(f"file://{path}")  # Unix-like

    # -------- Errors --------
    def on_worker_error(self, message: str):
        QMessageBox.critical(self, "Error", f"AutoCAD operation failed:\n{message}")
        self.status_bar.showMessage("Error occurred")


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("AutoCAD Block Library")
    app.setApplicationVersion("1.0.0")
    app.setOrganizationName("Block Library")
    window = MainWindow()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
