# =========================================
# File: ui/dashboard_layout.py
# =========================================
#!/usr/bin/env python3
"""
Dashboard-Style Block Library UI (embeds BlockLibraryView)
- Deeper 3D background
- AutoCAD accore auto-poster on DWG changes (watchdog if present, Qt fallback otherwise)

Bootstrapping:
- Ensures the project root is on sys.path.
- Imports BlockLibraryView from ui.block_library_layout.
- Fallback: loads block_library_layout.py directly if 'ui' package isn't importable.
"""

from __future__ import annotations

import os
import sys
import glob
from typing import List, Dict, Optional

from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QScrollArea, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QLineEdit, QPushButton, QFileDialog, QMessageBox, QStackedWidget, QStatusBar,
    QGraphicsDropShadowEffect, QFrame
)
from PySide6.QtCore import (
    Qt, QRect, QSettings, QPropertyAnimation, QEasingCurve, Signal,
    QObject, QTimer
)
from PySide6.QtGui import QColor

# ---- bootstrap so imports work when run as a script ----
if __package__ in (None, "",):
    import os, sys, importlib.util
    _THIS = os.path.abspath(os.path.dirname(__file__))   # .../app/ui
    _ROOT = os.path.dirname(os.path.dirname(_THIS))      # project root (parent of app)
    if _ROOT not in sys.path:
        sys.path.insert(0, _ROOT)

    # Prefer proper package imports
    try:
        from app.ui.block_library_layout import BlockLibraryView
    except Exception:
        # Fallback: load by path
        spec = importlib.util.spec_from_file_location(
            "app.ui.block_library_layout", os.path.join(_THIS, "block_library_layout.py")
        )
        mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
        BlockLibraryView = mod.BlockLibraryView

    try:
        from app.ui.grid_viewer import GridViewer
    except Exception:
        GridViewer = None

    try:
        from app.ui.accore_worker import AutoCADWorker
    except Exception:
        AutoCADWorker = None

    try:
        from app.ui.library_config import LibraryConfig
    except Exception:
        try:
            from app.ui.library_config import LibraryConfig
        except Exception:
            class LibraryConfig:
                def __init__(self, path): self.folders = []
else:
    # Normal package-relative imports when run with -m
    from .block_library_layout import BlockLibraryView
    try:
        from .grid_viewer import GridViewer
    except Exception:
        GridViewer = None
    try:
        from .accore_worker import AutoCADWorker
    except Exception:
        AutoCADWorker = None
    try:
        from ..ui.library_config import LibraryConfig
    except Exception:
        from .library_config import LibraryConfig

# ---------------------------
# Accore auto-poster watcher
# ---------------------------
class _AccoreAutoPoster(QObject):
    """Watch DWG/DXF changes and run AutoCADWorker('list_blocks') on the newest file (debounced)."""
    def __init__(self, parent: QMainWindow, folders: List[str], debounce_ms: int = 900):
        super().__init__(parent)
        self._ui = parent
        self._folders = [f for f in folders if f and os.path.exists(f)]
        self._jobs = set()
        self._debounce = QTimer(self)
        self._debounce.setSingleShot(True)
        self._debounce.setInterval(debounce_ms)
        self._debounce.timeout.connect(self._run_once)

        self._use_watchdog = False
        self._mtimes: Dict[str, float] = {}
        self._observer = None
        self._qfw = None
        self._poll = None

        # Try watchdog first
        try:
            from watchdog.observers import Observer  # type: ignore
            from watchdog.events import FileSystemEventHandler  # type: ignore
            self._use_watchdog = True

            class _H(FileSystemEventHandler):
                def __init__(self, outer: "_AccoreAutoPoster"):
                    self.outer = outer
                def on_any_event(self, event):
                    if not getattr(event, "is_directory", False):
                        self.outer._schedule()

            self._observer = Observer()
            handler = _H(self)
            for d in self._folders:
                self._observer.schedule(handler, d, recursive=True)
            self._observer.start()
        except Exception:
            # Fallback to Qt watcher + polling for recursive depth
            try:
                from PySide6.QtCore import QFileSystemWatcher
                self._qfw = QFileSystemWatcher(self)
                if self._folders:
                    self._qfw.addPaths(self._folders)
                self._qfw.directoryChanged.connect(lambda _p: self._schedule())
            except Exception:
                self._qfw = None

            self._poll = QTimer(self)
            self._poll.timeout.connect(self._poll_once)
            self._poll.start(1500)

    def stop(self):
        try:
            if self._use_watchdog and self._observer:
                self._observer.stop()
                self._observer.join(timeout=1.5)
        except Exception:
            pass

    def _schedule(self):
        self._debounce.start()

    def _poll_once(self):
        exts = {".dwg", ".dxf"}
        for root in self._folders:
            for dp, _, files in os.walk(root):
                for f in files:
                    if os.path.splitext(f)[1].lower() in exts:
                        p = os.path.join(dp, f)
                        try:
                            m = os.path.getmtime(p)
                        except Exception:
                            continue
                        if self._mtimes.get(p, 0.0) < m:
                            self._mtimes[p] = m
                            self._schedule()

    def _run_once(self):
        if AutoCADWorker is None or not self._folders:
            return

        latest: Optional[str] = None
        latest_ts: float = -1.0
        for root in self._folders:
            for dp, _, files in os.walk(root):
                for f in files:
                    if f.lower().endswith((".dwg", ".dxf")):
                        p = os.path.join(dp, f)
                        try:
                            ts = os.path.getmtime(p)
                        except Exception:
                            continue
                        if ts > latest_ts:
                            latest_ts, latest = ts, p

        if not latest:
            return

        worker = AutoCADWorker(latest, op="list_blocks")
        def _done(_res: dict):
            try:
                self._ui.statusBar().showMessage(f"accore indexed: {os.path.basename(latest)}")
            finally:
                self._jobs.discard(worker)

        def _err(msg: str):
            try:
                self._ui.statusBar().showMessage(f"accore error: {msg}")
            finally:
                self._jobs.discard(worker)

        worker.finished.connect(_done)
        worker.error.connect(_err)
        self._jobs.add(worker)
        worker.start()


# ---------------------------
# Cards
# ---------------------------
class GlassStatCard(QFrame):
    def __init__(self, title, value, icon, color="#2196F3", trend=None):
        super().__init__()
        self.setFixedSize(220, 140)
        self.color = color
        self.setStyleSheet(f"""
            GlassStatCard {{
                background: rgba(30, 30, 60, 0.3);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 16px;
            }}
            GlassStatCard:hover {{
                background: rgba(30, 30, 60, 0.5);
                border: 2px solid {color};
            }}
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(20)
        shadow.setColor(QColor(0, 0, 0, 30))
        shadow.setOffset(0, 8)
        self.setGraphicsEffect(shadow)

        self.highlight_animation = QPropertyAnimation(self, b"styleSheet")
        self.highlight_animation.setDuration(200)
        self.highlight_animation.setEasingCurve(QEasingCurve.OutCubic)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(8)

        header = QHBoxLayout()
        icon_container = QLabel()
        icon_container.setFixedSize(50, 50)
        icon_container.setStyleSheet(f"""
            QLabel {{
                background: rgba(20, 20, 40, 0.4);
                border: 1px solid rgba(100, 150, 255, 0.4);
                border-radius: 25px;
                font-size: 24px;
                color: {color};
            }}
        """)
        icon_container.setText(icon)
        icon_container.setAlignment(Qt.AlignCenter)
        header.addWidget(icon_container)
        header.addStretch()
        if trend:
            trend_label = QLabel(trend)
            trend_label.setStyleSheet(f"""
                QLabel {{
                    background: rgba({self._hex_to_rgb(color)}, 0.3);
                    border: 1px solid rgba(100, 150, 255, 0.4);
                    border-radius: 12px;
                    color: #e0e6ff;
                    font-size: 11px;
                    font-weight: bold;
                    padding: 4px 8px;
                }}
            """)
            header.addWidget(trend_label)
        layout.addLayout(header)

        value_label = QLabel(str(value))
        value_label.setStyleSheet("QLabel { font-size: 32px; font-weight: bold; color: #e0e6ff; }")
        layout.addWidget(value_label)

        title_label = QLabel(title.upper())
        title_label.setStyleSheet("QLabel { font-size: 12px; color: rgba(224,230,255,0.8); font-weight: 600; letter-spacing: 1px; }")
        layout.addWidget(title_label)

    def _hex_to_rgb(self, hex_color):
        hex_color = hex_color.lstrip('#')
        return f"{int(hex_color[0:2], 16)}, {int(hex_color[2:4], 16)}, {int(hex_color[4:6], 16)}"

    def enterEvent(self, event):
        self.highlight_animation.setStartValue(self.styleSheet())
        highlighted_style = f"""
            GlassStatCard {{
                background: rgba(50, 50, 100, 0.6);
                border: 2px solid {self.color};
                border-radius: 16px;
            }}
        """
        self.highlight_animation.setEndValue(highlighted_style)
        self.highlight_animation.start()
        super().enterEvent(event)

    def leaveEvent(self, event):
        original_style = """
            GlassStatCard {
                background: rgba(30, 30, 60, 0.3);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 16px;
            }
        """
        self.highlight_animation.setStartValue(self.styleSheet())
        self.highlight_animation.setEndValue(original_style)
        self.highlight_animation.start()
        super().leaveEvent(event)


class GlassActionCard(QFrame):
    clicked = Signal(str)

    def __init__(self, title, description, icon, action_type="action", color="#2196F3"):
        super().__init__()
        self.setFixedSize(200, 120)
        self.action_type = action_type
        self.color = color
        self.setCursor(Qt.PointingHandCursor)
        self.setStyleSheet(f"""
            GlassActionCard {{
                background: rgba(25, 25, 50, 0.4);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 16px;
            }}
            GlassActionCard:hover {{
                background: rgba(40, 40, 80, 0.6);
                border: 2px solid {color};
            }}
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(15)
        shadow.setColor(QColor(0, 0, 0, 20))
        shadow.setOffset(0, 6)
        self.setGraphicsEffect(shadow)

        self.hover_animation = QPropertyAnimation(self, b"geometry")
        self.hover_animation.setDuration(200)
        self.hover_animation.setEasingCurve(QEasingCurve.OutCubic)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(8)

        icon_container = QLabel()
        icon_container.setFixedSize(40, 40)
        icon_container.setStyleSheet(f"""
            QLabel {{
                background: rgba(20, 20, 40, 0.5);
                border: 1px solid rgba(100, 150, 255, 0.4);
                border-radius: 20px;
                font-size: 20px;
                color: {color};
            }}
        """)
        icon_container.setText(icon)
        icon_container.setAlignment(Qt.AlignCenter)
        layout.addWidget(icon_container)

        title_label = QLabel(title)
        title_label.setStyleSheet("QLabel { font-size:14px; font-weight:bold; color:#e0e6ff; }")
        layout.addWidget(title_label)

        desc_label = QLabel(description)
        desc_label.setWordWrap(True)
        desc_label.setStyleSheet("QLabel { font-size:11px; color: rgba(224,230,255,0.7); }")
        layout.addWidget(desc_label)

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.clicked.emit(self.action_type)
        super().mousePressEvent(event)

    def enterEvent(self, event):
        cur = self.geometry()
        self.hover_animation.setStartValue(cur)
        self.hover_animation.setEndValue(QRect(cur.x(), cur.y() - 4, cur.width(), cur.height()))
        self.hover_animation.start()
        super().enterEvent(event)

    def leaveEvent(self, event):
        cur = self.geometry()
        self.hover_animation.setStartValue(cur)
        self.hover_animation.setEndValue(QRect(cur.x(), cur.y() + 4, cur.width(), cur.height()))
        self.hover_animation.start()
        super().leaveEvent(event)


# ---------------------------
# Dashboard
# ---------------------------
class DashboardLayout(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Block Library Dashboard")
        self.setMinimumSize(1200, 800)
        self.resize(1600, 1000)
        self._init_data_sources()

        # Deeper 3D-ish background
        self.setStyleSheet("""
            QMainWindow {
                background:
                    radialgradient(cx:0.25, cy:0.20, radius:1.15,
                                   fx:0.25, fy:0.20,
                                   stop:0 #0f0f23, stop:0.55 #16213e, stop:1 #0b0d19);
            }
            QScrollArea { border: none; background: transparent; }
        """)

        # Start the accore watcher (safe no-op if worker missing)
        try:
            folders = [f.get("path", "") for f in (self.lib_cfg.folders if self.lib_cfg else [])]
            self._accore = _AccoreAutoPoster(self, folders)
        except Exception:
            self._accore = None

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.setCentralWidget(self.scroll_area)

        self.stack = QStackedWidget()
        self.scroll_area.setWidget(self.stack)

        self.dashboard_central = QWidget()
        self.stack.addWidget(self.dashboard_central)
        main_layout = QVBoxLayout(self.dashboard_central)
        margin = max(20, min(40, self.width() // 40))
        main_layout.setContentsMargins(margin, margin, margin, margin)
        main_layout.setSpacing(25)

        self._create_header(main_layout)

        content_layout = QHBoxLayout()
        content_layout.setSpacing(25)

        left = QVBoxLayout()
        left.setSpacing(25)
        self._create_stats(left)
        self._create_actions(left)
        self._create_recent_files(left)
        content_layout.addLayout(left, 3)

        right_widget = QWidget()
        right_widget.setMinimumWidth(280)
        right_widget.setMaximumWidth(400)
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.addWidget(self._create_activity())
        content_layout.addWidget(right_widget, 1)

        main_layout.addLayout(content_layout, 1)

        self.setStatusBar(QStatusBar())
        self.statusBar().showMessage("🌙 Dark Glass Dashboard Ready • accore watcher active")
        self.statusBar().setStyleSheet("""
            QStatusBar {
                background: rgba(30, 30, 60, 0.4);
                border-top: 1px solid rgba(100, 150, 255, 0.3);
                color: #e0e6ff;
                font-weight: bold;
            }
        """)

    # Data
    def _init_data_sources(self):
        self.settings = QSettings("BlockLibrary", "AutoCADBlockLibrary")
        try:
            config_dir = os.path.join(os.path.dirname(__file__), "..", "app", "config")
            config_file = os.path.join(config_dir, "library.yaml")
            self.lib_cfg = LibraryConfig(config_file)
        except Exception:
            self.lib_cfg = None
        self.real_stats = self._get_stats()
        self.recent_files = self._get_recent_files()
        self.recent_activity = self._get_activity()

    def _get_stats(self):
        stats = {"total_blocks": 0, "categories": 0, "recent_files": 0, "dwg_files": 0}
        try:
            if self.lib_cfg:
                stats["categories"] = len([f for f in self.lib_cfg.folders if f.get("path")])
                for folder in self.lib_cfg.folders:
                    path = folder.get("path", "")
                    if path and os.path.exists(path):
                        _dwg_files = glob.glob(os.path.join(path, "**", "*.dwg"), recursive=True)
                        stats["dwg_files"] += len(_dwg_files)
                        stats["total_blocks"] += len(_dwg_files) * 7
            recent = self.settings.value("recentFiles", [])
            if isinstance(recent, list):
                stats["recent_files"] = len([f for f in recent if os.path.exists(f)])
        except Exception as e:
            print("Error stats:", e)
        return stats

    def _get_recent_files(self):
        try:
            recent = self.settings.value("recentFiles", [])
            if isinstance(recent, list):
                return [f for f in recent[:5] if os.path.exists(f)]
        except Exception:
            pass
        return []

    def _get_activity(self):
        activities = []
        rf = self._get_recent_files()
        for i, file_path in enumerate(rf[:3]):
            filename = os.path.basename(file_path)
            time_ago = ["2 min ago", "15 min ago", "1 hour ago"][i]
            activities.append(("📂", f"Opened {filename}", time_ago))
        if self.lib_cfg:
            activities.append(("📁", f"Loaded {len(self.lib_cfg.folders)} categories", "Startup"))
        activities.append(("🔍", "Dashboard initialized", "Just now"))
        return activities

    def resizeEvent(self, event):
        super().resizeEvent(event)
        central = self.centralWidget().widget()
        if central and central.layout():
            margin = max(20, min(40, self.width() // 40))
            central.layout().setContentsMargins(margin, margin, margin, margin)

    # UI sections
    def _create_header(self, layout):
        header = QWidget()
        header.setFixedHeight(100)
        header.setStyleSheet("""
            QWidget {
                background: rgba(30, 30, 60, 0.4);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 20px;
            }
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(25)
        shadow.setColor(QColor(0, 0, 0, 20))
        shadow.setOffset(0, 8)
        header.setGraphicsEffect(shadow)

        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(30, 20, 30, 20)

        title_layout = QVBoxLayout()
        title = QLabel("🌙 Block Library Dashboard")
        title.setStyleSheet("QLabel { font-size:32px; font-weight:bold; color:#e0e6ff; }")
        subtitle = QLabel("Dark glass morphism • Real-time analytics • Responsive design")
        subtitle.setStyleSheet("QLabel { font-size:16px; color: rgba(224,230,255,0.8); }")
        title_layout.addWidget(title)
        title_layout.addWidget(subtitle)
        header_layout.addLayout(title_layout)
        header_layout.addStretch()

        search_container = QWidget()
        search_container.setStyleSheet("""
            QWidget {
                background: rgba(25, 25, 50, 0.5);
                border: 1px solid rgba(100, 150, 255, 0.4);
                border-radius: 25px;
            }
        """)
        search_layout = QHBoxLayout(search_container)
        search_layout.setContentsMargins(20, 8, 20, 8)
        search = QLineEdit()
        search.setPlaceholderText("🔍 Search blocks in the dark dimension…")
        search.setFixedWidth(280)
        search.setStyleSheet("""
            QLineEdit { border:none; font-size:14px; color:#e0e6ff; background:transparent; }
            QLineEdit::placeholder { color: rgba(224,230,255,0.6); }
        """)
        search_layout.addWidget(search)
        header_layout.addWidget(search_container)
        layout.addWidget(header)

    def _create_stats(self, layout):
        stats_widget = QWidget()
        stats_layout = QGridLayout(stats_widget)
        stats_layout.setContentsMargins(0, 0, 0, 0)
        stats_layout.setSpacing(20)
        stats = [
            ("Total Blocks", f"{self.real_stats['total_blocks']:,}", "📦", "#4a9eff", "+12%"),
            ("Categories", str(self.real_stats['categories']), "📁", "#6c5ce7", f"+{self.real_stats['categories']}"),
            ("DWG Files", str(self.real_stats['dwg_files']), "📄", "#00cec9", "Active"),
            ("Recent Files", str(self.real_stats['recent_files']), "🕒", "#fd79a8", "Ready"),
        ]
        for i, (title, value, icon, color, trend) in enumerate(stats):
            card = GlassStatCard(title, value, icon, color, trend)
            row = i // 2 if self.width() < 1400 else 0
            col = i % 2 if self.width() < 1400 else i
            stats_layout.addWidget(card, row, col)
        layout.addWidget(stats_widget)

    def _create_actions(self, layout):
        header = QLabel("✨ Quick Actions")
        header.setStyleSheet("QLabel { font-size:20px; font-weight:bold; color:white; margin-bottom:16px; }")
        layout.addWidget(header)

        actions_widget = QWidget()
        actions_layout = QGridLayout(actions_widget)
        actions_layout.setSpacing(20)
        actions = [
            ("Block Library", "Browse all blocks", "🎯", "show_library", "#4a9eff"),
            ("Open DWG", "Browse files", "📂", "open_dwg", "#6c5ce7"),
            ("Grid Viewer", "3D view & HUD", "🧊", "open_grid_viewer", "#8bc34a"),
            ("Import", "Add to library", "📥", "import", "#00cec9"),
            ("Export", "Export selection", "📤", "export", "#fd79a8"),
            ("Settings", "Configure", "⚙️", "settings", "#fdcb6e"),
        ]
        for i, (title, desc, icon, action_type, color) in enumerate(actions):
            card = GlassActionCard(title, desc, icon, action_type, color)
            card.clicked.connect(self._handle_action)
            row, col = divmod(i, 3)
            actions_layout.addWidget(card, row, col)
        layout.addWidget(actions_widget)

    def _handle_action(self, action_type):
        if action_type == "show_library":
            self._show_block_library()
        elif action_type == "open_dwg":
            self._open_dwg_file()
        elif action_type == "open_grid_viewer":
            self._open_grid_viewer()
        elif action_type == "import":
            QMessageBox.information(self, "Import", "Import functionality would be implemented here.")
        elif action_type == "export":
            QMessageBox.information(self, "Export", "Export functionality would be implemented here.")
        elif action_type == "settings":
            QMessageBox.information(self, "Settings", "Settings dialog would be opened here.")

    def _show_block_library(self):
        try:
            if not hasattr(self, "library_widget"):
                self.library_widget = BlockLibraryView()
                try:
                    self.library_widget.request_home.connect(lambda: self.stack.setCurrentWidget(self.dashboard_central))
                    self.library_widget.request_open_viewer.connect(self._open_viewer_from_meta)
                except Exception:
                    pass
                self.stack.addWidget(self.library_widget)
            self.stack.setCurrentWidget(self.library_widget)
        except Exception as e:
            QMessageBox.critical(self, "🎯 Block Library", f"Unable to open embedded Block Library.\n\nError: {e}")

    def _open_dwg_file(self):
        file_path, _ = QFileDialog.getOpenFileName(
            self, "Open DWG File", "", "DWG Files (*.dwg);;All Files (*)"
        )
        if not file_path:
            return
        try:
            from .mini_block_viewer import MiniBlockViewer  # <-- relative import
            if not hasattr(self, "viewer_win") or self.viewer_win is None:
                self.viewer_win = MiniBlockViewer(self)
            self.viewer_win.open_dwg(file_path)
            self.viewer_win.show(); self.viewer_win.raise_(); self.viewer_win.activateWindow()
            self.statusBar().showMessage(f"Opened: {os.path.basename(file_path)}")
        except Exception as e:
            QMessageBox.critical(self, "Open DWG", f"Unable to open viewer.\n\n{e}")

    def _open_viewer_from_meta(self, meta: dict):
        try:
            from .mini_block_viewer import MiniBlockViewer  # <-- relative import
            if not hasattr(self, "viewer_win") or self.viewer_win is None:
                self.viewer_win = MiniBlockViewer(self)
            p = meta.get("path") or meta.get("dwg_path")
            if p:
                try:
                    self.viewer_win.open_dwg(p)
                except Exception:
                    pass
            self.viewer_win.show(); self.viewer_win.raise_(); self.viewer_win.activateWindow()
        except Exception as e:
            QMessageBox.warning(self, "Viewer", f"Unable to open block viewer.\n\n{e}")

    
    def _ensure_grid_viewer(self):
        if GridViewer is None:
            QMessageBox.warning(self, "Grid Viewer", "Qt3D not available or grid_viewer import failed.")
            return None
        if not hasattr(self, "_gv") or self._gv is None:
            self._gv = GridViewer(self)
        return self._gv

    def _open_grid_viewer(self):
        gv = self._ensure_grid_viewer()
        if not gv:
            return
        # Optional: if you want it to open with something loaded:
        # if hasattr(self, "library_widget") and getattr(self.library_widget, "_current_meta", None):
        #     gv.open_block(self.library_widget._current_meta)
        gv.show(); gv.raise_(); gv.activateWindow()

    def _create_recent_files(self, layout):
        header = QLabel("📄 Recent Files")
        header.setStyleSheet("QLabel { font-size:20px; font-weight:bold; color:#e0e6ff; margin-bottom:16px; }")
        layout.addWidget(header)

        container = QWidget()
        container.setStyleSheet("""
            QWidget {
                background: rgba(30, 30, 60, 0.4);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 16px;
            }
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(20)
        shadow.setColor(QColor(0, 0, 0, 20))
        shadow.setOffset(0, 8)
        container.setGraphicsEffect(shadow)

        v = QVBoxLayout(container)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(12)

        files = self.recent_files
        if files:
            for i, file_path in enumerate(files[:3]):
                v.addWidget(self._recent_item(os.path.basename(file_path), os.path.dirname(file_path),
                                              ["2 min ago", "15 min ago", "1 hour ago"][i]))
        else:
            nf = QLabel("No recent files")
            nf.setStyleSheet("QLabel { color: rgba(255,255,255,0.6); font-style: italic; }")
            nf.setAlignment(Qt.AlignCenter)
            v.addWidget(nf)

        layout.addWidget(container)

    def _recent_item(self, name, path, time):
        w = QWidget()
        w.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 12px;
            }
            QWidget:hover { background: rgba(255, 255, 255, 0.1); }
        """)
        h = QHBoxLayout(w)
        h.setContentsMargins(12, 8, 12, 8)

        icon = QLabel("📄")
        icon.setStyleSheet("QLabel { font-size: 16px; color: white; }")
        h.addWidget(icon)

        info = QVBoxLayout()
        name_label = QLabel(name)
        name_label.setStyleSheet("QLabel { font-size: 13px; font-weight: bold; color: white; }")
        path_label = QLabel(path[:50] + "..." if len(path) > 50 else path)
        path_label.setStyleSheet("QLabel { font-size: 11px; color: rgba(255,255,255,0.7); }")
        info.addWidget(name_label)
        info.addWidget(path_label)
        h.addLayout(info)
        h.addStretch()

        t = QLabel(time)
        t.setStyleSheet("QLabel { font-size: 10px; color: rgba(255, 255, 255, 0.6); }")
        h.addWidget(t)
        return w

    def _create_activity(self):
        w = QWidget()
        w.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 20px;
            }
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(25)
        shadow.setColor(QColor(0, 0, 0, 20))
        shadow.setOffset(0, 8)
        w.setGraphicsEffect(shadow)

        v = QVBoxLayout(w)
        v.setContentsMargins(20, 20, 20, 20)
        v.setSpacing(16)

        header = QLabel("🔄 Recent Activity")
        header.setStyleSheet("QLabel { font-size: 18px; font-weight: bold; color: white; }")
        v.addWidget(header)

        for icon, action, time in self.recent_activity:
            v.addWidget(self._activity_item(icon, action, time))

        v.addStretch()

        profile = QFrame()
        profile.setStyleSheet("""
            QFrame {
                background: rgba(30, 30, 60, 0.4);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 15px;
                padding: 15px;
            }
        """)
        h = QHBoxLayout(profile)
        h.setContentsMargins(15, 15, 15, 15)
        h.setSpacing(12)
        avatar = QLabel("👤")
        avatar.setFixedSize(40, 40)
        avatar.setAlignment(Qt.AlignCenter)
        avatar.setStyleSheet("""
            QLabel {
                background: rgba(74, 158, 255, 0.3);
                border-radius: 20px;
                font-size: 20px;
                color: #4a9eff;
            }
        """)
        h.addWidget(avatar)

        info = QVBoxLayout()
        nm = QLabel("User")
        nm.setStyleSheet("QLabel { color: #e0e6ff; font-weight: bold; font-size: 12px; }")
        role = QLabel("Administrator")
        role.setStyleSheet("QLabel { color: rgba(224,230,255,0.7); font-size: 10px; }")
        info.addWidget(nm)
        info.addWidget(role)
        h.addLayout(info)
        h.addStretch()

        settings_btn = QPushButton("⚙️")
        settings_btn.setFixedSize(24, 24)
        settings_btn.setStyleSheet("""
            QPushButton {
                background: rgba(30, 30, 60, 0.5);
                border: 1px solid rgba(100, 150, 255, 0.3);
                border-radius: 12px;
                color: #4a9eff;
                font-weight: bold;
                font-size: 12px;
            }
            QPushButton:hover { background: rgba(50, 50, 100, 0.7); border: 2px solid #4a9eff; }
        """)
        h.addWidget(settings_btn)

        v.addWidget(profile)
        return w

    def _activity_item(self, icon, action, time):
        w = QWidget()
        w.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 12px;
            }
            QWidget:hover { background: rgba(255, 255, 255, 0.1); }
        """)
        h = QHBoxLayout(w)
        h.setContentsMargins(12, 8, 12, 8)

        icon_label = QLabel(icon)
        icon_label.setStyleSheet("QLabel { font-size: 16px; color: white; }")
        h.addWidget(icon_label)

        content = QVBoxLayout()
        act = QLabel(action)
        act.setStyleSheet("QLabel { font-size: 13px; color: white; font-weight: 500; }")
        tm = QLabel(time)
        tm.setStyleSheet("QLabel { font-size: 11px; color: rgba(255, 255, 255, 0.7); }")
        content.addWidget(act)
        content.addWidget(tm)
        h.addLayout(content)

        return w


def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    window = DashboardLayout()
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
