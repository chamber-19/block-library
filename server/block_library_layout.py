# ============================================================
# File: ui/block_library_layout.py
# ============================================================
#!/usr/bin/env python3
"""
Block Library (production) view.

- Solid category-color cards with soft glow (no lift/parallax).
- Layered 3D-ish background for the host window.
- Debounced filters + pagination that adapts to viewport.
- Optional Qt3D live preview (tinted material + gentle auto-rotate).

Note:
- LibraryConfig is resolved from ../app/ui/library_config.py if present; otherwise seed demo categories.
"""

from __future__ import annotations

import os
import sys
from math import floor
from datetime import datetime, timedelta
from typing import List, Optional, Dict

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QScrollArea, QGridLayout,
    QFrame, QLabel, QLineEdit, QPushButton, QComboBox, QStatusBar,
    QMainWindow, QGraphicsDropShadowEffect, QSizePolicy, QButtonGroup
)
from PySide6.QtCore import Qt, QEvent, QSettings, QTimer, Signal, QPoint
from PySide6.QtGui import QColor, QVector3D

# ---------- Optional Qt3D ----------
_QT3D_OK = True
try:
    from PySide6.Qt3DCore import QEntity, QTransform
    from PySide6.Qt3DExtras import (
        Qt3DWindow, QCuboidMesh, QSphereMesh, QCylinderMesh,
        QPhongMaterial, QOrbitCameraController, QConeMesh, QTorusMesh
    )
    from PySide6.Qt3DRender import QPointLight
except Exception:
    _QT3D_OK = False

if os.environ.get("ENABLE_QT3D", "1") != "1":
    _QT3D_OK = False


# ---------- helpers ----------
def _load_library_folders() -> List[Dict[str, str]]:
    sys.path.append(os.path.join(os.path.dirname(__file__), "..", "app", "ui"))
    try:
        from library_config import LibraryConfig  # type: ignore
        cfg_path = os.path.join(os.path.dirname(__file__), "..", "app", "config", "library.yaml")
        lib = LibraryConfig(cfg_path)
        out, seen = [], set()
        for f in getattr(lib, "folders", []):
            name = (f.get("name") or os.path.basename(f.get("path", "")).strip() or "").strip()
            path = f.get("path", "").strip() if f.get("path") else ""
            if name and name not in seen:
                seen.add(name); out.append({"name": name, "path": path})
        if out:
            return out
    except Exception:
        pass
    return [{"name": n, "path": ""} for n in (
        "Relay Panels","Schematic","Wiring","Grounding","Conduit",
        "One-Line","Vendor","Logic","Structural","Equipment",
        "Drafting Standards","Stamps","Logos"
    )]


def _latest_mtime(path: str) -> Optional[datetime]:
    if not path or not os.path.exists(path):
        return None
    exts = (".dwg", ".dxf", ".pdf", ".rvt", ".rfa", ".dwf")
    newest = None
    for root, _, files in os.walk(path):
        for fn in files:
            if not fn.lower().endswith(exts):
                continue
            fp = os.path.join(root, fn)
            try:
                mt = datetime.fromtimestamp(os.path.getmtime(fp))
            except Exception:
                continue
            if newest is None or mt > newest:
                newest = mt
    return newest


def _reltime(dt: Optional[datetime]) -> str:
    if not isinstance(dt, datetime):
        return "—"
    s = max(0, int((datetime.now() - dt).total_seconds()))
    if s < 60: return f"{s}s"
    m = s // 60
    if m < 60: return f"{m}m"
    h = m // 60
    if h < 24: return f"{h}h"
    d = h // 24
    if d < 30: return f"{d}d"
    mo = d // 30
    if mo < 12: return f"{mo}mo"
    y = mo // 12
    return f"{y}y"


LIB_FOLDERS = _load_library_folders()
CATEGORIES = [f["name"] for f in LIB_FOLDERS]
COLOR_CYCLE = ["#4a9eff", "#6c5ce7", "#00cec9", "#fd79a8", "#fdcb6e", "#e17055"]
RECENT_DAYS = 30
RELATIVE_TIME_REFRESH_MS = 60_000
FILTER_DEBOUNCE_MS = 120
RESIZE_DEBOUNCE_MS = 120

# ---------- theme ----------
GLASS_BG = "rgba(14,16,28,0.60)"
GLASS_STROKE = "rgba(110,130,180,0.28)"
GLASS_RADIUS = 16
TEXT_MAIN = "#e0e6ff"
TEXT_SOFT = "rgba(224,230,255,0.80)"


# ---------- Quick 3D Preview ----------
class Quick3DPreview(QFrame):
    """3D (or fallback) preview showing the currently hovered/selected card."""
    def __init__(self):
        super().__init__()
        self.setMinimumWidth(380)
        self.setMaximumWidth(520)
        self.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Expanding)
        self.setStyleSheet(f"""
            Quick3DPreview {{
                background: qconicalgradient(cx:0.5, cy:0.5, angle:45,
                    stop:0 rgba(10,12,22,0.88),
                    stop:0.5 rgba(12,14,26,0.94),
                    stop:1 rgba(10,12,22,0.88));
                border: 1px solid {GLASS_STROKE};
                border-radius: {GLASS_RADIUS}px;
            }}
        """)
        v = QVBoxLayout(self); v.setContentsMargins(16,16,16,16); v.setSpacing(10)

        self.title = QLabel("Preview")
        self.title.setStyleSheet(f"QLabel {{ color:{TEXT_MAIN}; font-size:14px; font-weight:800; }}")
        v.addWidget(self.title)

        self._color_hex = "#4a9eff"
        self._auto_rot_t = 0.0

        if _QT3D_OK:
            self.win = Qt3DWindow()
            self.win.defaultFrameGraph().setClearColor(Qt.black)
            self.container = QWidget.createWindowContainer(self.win)
            v.addWidget(self.container, 1)

            self.root = QEntity()
            cam = self.win.camera()
            cam.lens().setPerspectiveProjection(45.0, 16/9, 0.1, 2000.0)
            cam.setPosition(QVector3D(0.0, 7.5, 16.0))
            cam.setViewCenter(QVector3D(0.0, 0.0, 0.0))
            self._cam = cam

            orbit = QOrbitCameraController(self.root); orbit.setCamera(cam)

            l_entity = QEntity(self.root)
            light = QPointLight(l_entity); light.setIntensity(1.2)
            l_entity.addComponent(light)

            self.model_entity = None
            self.model_transform = None
            self.win.setRootEntity(self.root)

            # gentle auto-rotate
            self._rot_timer = QTimer(self)
            self._rot_timer.timeout.connect(self._spin)
            self._rot_timer.start(33)
        else:
            self.fallback = QLabel("Qt3D not available\n\nInstall: PySide6-Addons ≥ 6.6")
            self.fallback.setAlignment(Qt.AlignCenter)
            self.fallback.setStyleSheet("QLabel { color:#cbd3ff; font-size:13px; }")
            v.addWidget(self.fallback, 1)

        self.meta_label = QLabel("")
        self.meta_label.setStyleSheet(f"QLabel {{ color: {TEXT_SOFT}; font-size:12px; }}")
        v.addWidget(self.meta_label)

        self.open_btn = QPushButton("Open in 3D Viewer")
        self.open_btn.setCursor(Qt.PointingHandCursor)
        self.open_btn.setStyleSheet(f"""
            QPushButton {{ background: rgba(74,158,255,0.20); border:1px solid #4a9eff; color:{TEXT_MAIN};
                          border-radius: 10px; padding: 8px 12px; font-weight:700; }}
            QPushButton:hover {{ background: rgba(74,158,255,0.32); }}
        """)
        v.addWidget(self.open_btn)

    def _spin(self):
        if not _QT3D_OK or self.model_transform is None:
            return
        self._auto_rot_t += 0.6
        self.model_transform.setRotationZ(self._auto_rot_t)
        self.model_transform.setRotationY(self._auto_rot_t * 0.6)

    def _hex_to_qcolor(self, hexstr: str) -> QColor:
        try: return QColor(hexstr)
        except: return QColor("#4a9eff")

    def show_meta(self, meta: Dict):
        title = meta.get("title") or meta.get("category") or "Block"
        color_hex = meta.get("color", "#4a9eff")
        self._color_hex = color_hex
        synced = meta.get("path_set", False)
        lm = meta.get("last_modified")
        rel = "Not Synced ⚠️" if not synced else (f"updated {_reltime(lm)} ago" if lm else "updated —")
        self.title.setText(f"Preview • {title}")
        self.meta_label.setText(rel)

        if not _QT3D_OK:
            return

        if self.model_entity is not None:
            self.model_entity.setParent(None)
            self.model_entity = None
            self.model_transform = None

        cat = (meta.get("category") or "").lower()
        if "panel" in cat or "struct" in cat or "equip" in cat:
            mesh = QCuboidMesh()
        elif "wiring" in cat or "logic" in cat:
            mesh = QCylinderMesh()
        elif "vendor" in cat or "stamps" in cat or "logos" in cat:
            mesh = QSphereMesh()
        elif "one-line" in cat or "ground" in cat or "conduit" in cat:
            mesh = QTorusMesh()
        else:
            mesh = QConeMesh()

        ent = QEntity(self.root)
        mat = QPhongMaterial(ent)
        mat.setDiffuse(self._hex_to_qcolor(color_hex))
        xform = QTransform()
        ent.addComponent(mesh); ent.addComponent(mat); ent.addComponent(xform)
        self.model_entity = ent
        self.model_transform = xform


# ---------- UI widgets ----------
class FilterToolbar(QFrame):
    card_size_changed = Signal(str)
    request_prev_page = Signal()
    request_next_page = Signal()
    request_page = Signal(int)
    filters_changed = Signal()

    def __init__(self):
        super().__init__()
        self.setStyleSheet(f"""
            FilterToolbar {{
                background: {GLASS_BG};
                border: 1px solid {GLASS_STROKE};
                border-radius: {GLASS_RADIUS}px;
            }}
            QLineEdit {{
                border: none;
                background: rgba(255,255,255,0.06);
                border-radius: 10px;
                padding: 8px 10px;
                color: {TEXT_MAIN};
            }}
            QLineEdit::placeholder {{ color: rgba(224,230,255,0.55); }}
            QComboBox {{
                background: rgba(255,255,255,0.06);
                border: 1px solid {GLASS_STROKE};
                border-radius: 10px;
                color: {TEXT_MAIN};
                padding: 6px 10px;
                min-width: 160px;
            }}
            QPushButton {{ color: {TEXT_MAIN}; }}
        """)

        root = QVBoxLayout(self); root.setContentsMargins(14, 12, 14, 12); root.setSpacing(10)

        row1 = QHBoxLayout(); row1.setSpacing(10)
        self.segment_all = QPushButton("All")
        self.segment_recent = QPushButton("Recent")
        self.segment_cats = QPushButton("Categories")
        for b in (self.segment_all, self.segment_recent, self.segment_cats):
            b.setCheckable(True); b.setMinimumHeight(34); b.setCursor(Qt.PointingHandCursor)
            b.setStyleSheet(f"""
                QPushButton {{
                    background: rgba(255,255,255,0.06);
                    border: 1px solid {GLASS_STROKE};
                    border-radius: 10px; padding: 6px 12px;
                }}
                QPushButton:checked {{
                    background: rgba(74,158,255,0.20); border: 1px solid #4a9eff;
                }}
                QPushButton:hover {{ background: rgba(255,255,255,0.10); }}
            """)
        self.segment_all.setChecked(True)

        self._seg_group = QButtonGroup(self)
        self._seg_group.setExclusive(True)
        self._seg_group.addButton(self.segment_all)
        self._seg_group.addButton(self.segment_recent)
        self._seg_group.addButton(self.segment_cats)

        seg_wrap = QWidget(); seg_l = QHBoxLayout(seg_wrap); seg_l.setContentsMargins(0,0,0,0); seg_l.setSpacing(6)
        seg_l.addWidget(self.segment_all); seg_l.addWidget(self.segment_recent); seg_l.addWidget(self.segment_cats)
        row1.addWidget(seg_wrap, 0)

        self.search_input = QLineEdit(); self.search_input.setPlaceholderText("Search blocks…")
        self.search_input.textChanged.connect(lambda: self.filters_changed.emit())
        row1.addWidget(self.search_input, 1)

        pag = QHBoxLayout(); pag.setSpacing(6)
        self.prev_btn = QPushButton("←"); self.prev_btn.setFixedSize(34,34); self.prev_btn.clicked.connect(self.request_prev_page.emit)
        self.page_numbers_container = QWidget(); self.page_numbers_layout = QHBoxLayout(self.page_numbers_container)
        self.page_numbers_layout.setContentsMargins(0,0,0,0); self.page_numbers_layout.setSpacing(4)
        self.next_btn = QPushButton("→"); self.next_btn.setFixedSize(34,34); self.next_btn.clicked.connect(self.request_next_page.emit)
        pag.addWidget(self.prev_btn); pag.addWidget(self.page_numbers_container); pag.addWidget(self.next_btn)
        row1.addLayout(pag)
        root.addLayout(row1)

        row2 = QHBoxLayout(); row2.setSpacing(10)
        self.category_combo = QComboBox(); self.category_combo.addItems(["All Categories"] + CATEGORIES)
        self.category_combo.currentIndexChanged.connect(lambda: self.filters_changed.emit())
        row2.addWidget(self.category_combo, 0)

        self.clear_btn = QPushButton("Clear filters"); self.clear_btn.setMinimumHeight(32)
        self.clear_btn.setCursor(Qt.PointingHandCursor)
        self.clear_btn.setStyleSheet(f"""
            QPushButton {{ background: rgba(255,255,255,0.06); border: 1px solid {GLASS_STROKE};
                          border-radius: 10px; padding: 6px 12px; }}
            QPushButton:hover {{ background: rgba(255,255,255,0.10); }}
        """)
        self.clear_btn.clicked.connect(self._clear_filters)
        row2.addWidget(self.clear_btn, 0)

        row2.addStretch()

        settings = QSettings("BlockLibraryApp", "UI")
        self.card_size_combo = QComboBox(); self.card_size_combo.addItems(["Compact","Medium","Large"])
        saved = settings.value("ui/card_size","Medium")
        idx = ["Compact","Medium","Large"].index(saved) if saved in ["Compact","Medium","Large"] else 1
        self.card_size_combo.setCurrentIndex(idx)
        self.card_size_combo.currentIndexChanged.connect(
            lambda: (settings.setValue("ui/card_size", self.card_size_combo.currentText()),
                     self.card_size_changed.emit(self.card_size_combo.currentText()))
        )
        row2.addWidget(self.card_size_combo, 0)
        root.addLayout(row2)

        # ---- chips row ----
        self.chips_container = QWidget()
        chips_l = QHBoxLayout(self.chips_container); chips_l.setContentsMargins(0,0,0,0); chips_l.setSpacing(6)
        self._chip_buttons: List[QPushButton] = []
        for cat in CATEGORIES:
            chip = QPushButton(cat); chip.setCheckable(True); chip.setCursor(Qt.PointingHandCursor)
            chip.setStyleSheet(f"""
                QPushButton {{
                    background: rgba(255,255,255,0.06);
                    border: 1px solid {GLASS_STROKE};
                    border-radius: 12px; padding: 6px 10px; color:{TEXT_MAIN}; font-size:12px;
                }}
                QPushButton:checked {{ background: rgba(74,158,255,0.20); border: 1px solid #4a9eff; }}
                QPushButton:hover {{ background: rgba(255,255,255,0.10); }}
            """)
            chip.toggled.connect(lambda _=False: self.filters_changed.emit())
            self._chip_buttons.append(chip); chips_l.addWidget(chip)
        chips_l.addStretch()
        self.chips_container.setVisible(False)
        root.addWidget(self.chips_container)

        for b in (self.segment_all, self.segment_recent, self.segment_cats):
            b.toggled.connect(self._on_segment_changed)
        self._on_segment_changed(False)

    def get_quick_mode(self) -> str:
        if self.segment_recent.isChecked(): return "Recent"
        if self.segment_cats.isChecked(): return "Categories"
        return "All"

    def get_selected_chip_categories(self) -> List[str]:
        return [b.text() for b in self._chip_buttons if b.isChecked()]

    def _on_segment_changed(self, _checked: bool):
        sender = self.sender()
        if sender is not None:
            for b in (self.segment_all, self.segment_recent, self.segment_cats):
                if b is not sender:
                    b.blockSignals(True); b.setChecked(False); b.blockSignals(False)
        if not any(b.isChecked() for b in (self.segment_all, self.segment_recent, self.segment_cats)):
            self.segment_all.blockSignals(True); self.segment_all.setChecked(True); self.segment_all.blockSignals(False)
        self.chips_container.setVisible(self.segment_cats.isChecked())
        self.filters_changed.emit()

    def _clear_filters(self):
        self.search_input.blockSignals(True)
        for b in (self.segment_all, self.segment_recent, self.segment_cats): b.blockSignals(True)
        for chip in self._chip_buttons: chip.blockSignals(True)
        try:
            self.search_input.setText(""); self.category_combo.setCurrentIndex(0)
            self.segment_all.setChecked(True); self.segment_recent.setChecked(False); self.segment_cats.setChecked(False)
            for chip in self._chip_buttons: chip.setChecked(False)
            self.chips_container.setVisible(False)
        finally:
            self.search_input.blockSignals(False)
            for b in (self.segment_all, self.segment_recent, self.segment_cats): b.blockSignals(False)
            for chip in self._chip_buttons: chip.blockSignals(False)
        self.filters_changed.emit()


class AdvancedBlockCard(QFrame):
    clicked = Signal(dict)
    hovered = Signal(dict)

    def __init__(self, title, category, preview_color, size="medium",
                 last_modified: Optional[datetime] = None, path_set: bool = True):
        super().__init__()
        self.meta = {
            "title": title, "category": category, "color": preview_color,
            "size": size, "last_modified": last_modified, "path_set": path_set
        }
        self.animation_time = 0
        self._icon_base_pos = QPoint(0, 0)
        self.setFixedSize(220, 280)
        self.setCursor(Qt.PointingHandCursor)
        self.setMouseTracking(True)

        # Solid color card + soft glow
        self.setStyleSheet(self._solid_card_css(preview_color))
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(24)
        shadow.setColor(QColor(preview_color))
        shadow.setOffset(0, 8)
        self.setGraphicsEffect(shadow)

        layout = QVBoxLayout(self); layout.setContentsMargins(14, 14, 14, 14); layout.setSpacing(10)

        self.title_pill = QLabel(title); self.title_pill.setAlignment(Qt.AlignCenter)
        self.title_pill.setStyleSheet(self._pill_css(preview_color, 13))
        layout.addWidget(self.title_pill, 0, Qt.AlignHCenter)

        self.preview_container = QFrame(); self.preview_container.setFixedHeight(140)
        self.preview_container.setStyleSheet(self._preview_css(preview_color))
        p_l = QVBoxLayout(self.preview_container); p_l.setAlignment(Qt.AlignCenter)
        self.preview_icon = QLabel("🧊")
        self.preview_icon.setStyleSheet("QLabel { font-size:44px; }")
        self.preview_icon.setAlignment(Qt.AlignCenter)
        p_l.addWidget(self.preview_icon)
        layout.addWidget(self.preview_container)

        foot = QHBoxLayout(); foot.addStretch()
        self.time_label = QLabel("")
        self.time_label.setStyleSheet("QLabel { color: rgba(224,230,255,0.92); font-size:10px; }")
        foot.addWidget(self.time_label); layout.addLayout(foot)
        self._refresh_time_text()

        # Only a gentle breathing glow
        self.glow_timer = QTimer(self); self.glow_timer.timeout.connect(self._update_glow); self.glow_timer.start(120)
        self.time_timer = QTimer(self); self.time_timer.timeout.connect(self._refresh_time_text); self.time_timer.start(RELATIVE_TIME_REFRESH_MS)

    # ---- style helpers (SOLID color theme) ----
    def _solid_card_css(self, color_hex: str) -> str:
        txt = self._contrasting_text(color_hex)
        return f"""
        AdvancedBlockCard {{
            background: {color_hex};
            border: 1px solid {color_hex};
            border-radius: 16px;
        }}
        AdvancedBlockCard:hover {{
            background: {color_hex};
            border: 1px solid {color_hex};
        }}
        QLabel {{ color: {txt}; }}
        """

    def _pill_css(self, color_hex: str, fs: int) -> str:
        txt = self._contrasting_text(color_hex)
        return f"""
        QLabel {{
            background: {color_hex};
            border: 1px solid {color_hex};
            border-radius: 12px; color:{txt}; font-size:{fs}px; font-weight:800; padding:6px 10px;
        }}"""

    def _preview_css(self, color_hex: str) -> str:
        return f"""
        QFrame {{
            background: qradialgradient(cx:0.5, cy:0.35, radius:0.9,
                fx:0.5, fy:0.35,
                stop:0 rgba(255,255,255,0.08),
                stop:0.5 rgba(0,0,0,0.06),
                stop:1 {color_hex});
            border: 1px solid {color_hex};
            border-radius: 12px;
        }}"""

    def _contrasting_text(self, color_hex: str) -> str:
        qc = QColor(color_hex)
        r, g, b = qc.redF(), qc.greenF(), qc.blueF()
        lum = 0.2126*(r**2.2) + 0.7152*(g**2.2) + 0.0722*(b**2.2)
        return "#0e111a" if lum > 0.6 else "#ffffff"

    # ---- hover/parallax disabled ----
    def enterEvent(self, e):  # keep hover signal behavior
        self.hovered.emit(dict(self.meta))
        return super().enterEvent(e)

    def leaveEvent(self, e):
        try: self.preview_icon.move(0, 0)
        except Exception: pass
        return super().leaveEvent(e)

    def mouseMoveEvent(self, event):
        return  # no parallax

    # ---- sizing (re-apply styles) ----
    def set_card_size(self, preset: str):
        preset = (preset or "Medium").lower()
        if preset == "compact": card_w, prev_h, icon_fs, pill_fs = 220, 110, 36, 12
        elif preset == "large": card_w, prev_h, icon_fs, pill_fs = 320, 176, 56, 14
        else:                   card_w, prev_h, icon_fs, pill_fs = 260, 140, 44, 13
        self.setFixedWidth(card_w)
        self.preview_container.setFixedHeight(prev_h)
        self.preview_icon.setStyleSheet(f"QLabel {{ font-size:{icon_fs}px; }}")
        c = self.meta.get("color", "#4a9eff")
        self.title_pill.setStyleSheet(self._pill_css(c, pill_fs))
        self.preview_container.setStyleSheet(self._preview_css(c))
        self.setStyleSheet(self._solid_card_css(c))

    # ---- time label (RESTORED; fixes AttributeError) ----
    def _refresh_time_text(self):
        if not self.meta.get("path_set"):
            self.time_label.setText("⚠️ Not Synced"); return
        lm = self.meta.get("last_modified")
        self.time_label.setText(f"updated {_reltime(lm)} ago" if lm else "updated —")

    # ---- soft breathing glow ----
    def _update_glow(self):
        import math
        self.animation_time += 0.03
        glow = (math.sin(self.animation_time) + 1) * 0.5
        base, extra = 28, 18
        intensity = int(base + glow * extra)
        eff = self.graphicsEffect()
        if isinstance(eff, QGraphicsDropShadowEffect):
            col = QColor(self.meta.get("color", "#4a9eff"))
            col.setAlpha(intensity)
            eff.setColor(col)
            eff.setBlurRadius(22 + glow * 8)

    def _hex_to_rgb_tuple(self, hex_color):
        hex_color = hex_color.lstrip('#')
        return (int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16))


class BlockLibraryView(QWidget):
    request_home = Signal()
    request_open_viewer = Signal(dict)  # meta: {"title","category",...}

    def __init__(self, parent=None):
        super().__init__(parent)
        self.current_page = 0; self.total_pages = 1; self.items_per_page = 12
        self.card_size_preset = QSettings("BlockLibraryApp","UI").value("ui/card_size","Medium")

        self._filter_timer = QTimer(self); self._filter_timer.setSingleShot(True); self._filter_timer.setInterval(FILTER_DEBOUNCE_MS)
        self._filter_timer.timeout.connect(self._apply_filters)
        self._resize_timer = QTimer(self); self._resize_timer.setSingleShot(True); self._resize_timer.setInterval(RESIZE_DEBOUNCE_MS)
        self._resize_timer.timeout.connect(self._apply_resize)

        outer = QHBoxLayout(self); outer.setContentsMargins(24,24,24,24); outer.setSpacing(18)

        # Left column
        left_col = QVBoxLayout(); left_col.setSpacing(18)
        header = QWidget()
        header.setStyleSheet(f"""
            QWidget {{
                background: radialgradient(cx:0.12, cy:0.12, radius:1.2,
                    fx:0.12, fy:0.12, stop:0 rgba(20,22,34,0.78), stop:1 rgba(14,16,28,0.74));
                border: 1px solid {GLASS_STROKE};
                border-radius: {GLASS_RADIUS}px;
            }}
        """)
        hl = QVBoxLayout(header); hl.setContentsMargins(16,12,16,12); hl.setSpacing(6)
        title = QLabel("🎯 Block Library"); title.setStyleSheet(f"QLabel {{ font-size:26px; font-weight:900; color:{TEXT_MAIN}; }}")
        hl.addWidget(title, 0, Qt.AlignLeft)

        bcw = QWidget(); bcl = QHBoxLayout(bcw); bcl.setContentsMargins(0,0,0,0); bcl.setSpacing(8)
        dash_btn = QPushButton("🏠 Dashboard"); dash_btn.setCursor(Qt.PointingHandCursor)
        dash_btn.clicked.connect(self.request_home.emit)
        dash_btn.setStyleSheet("""
            QPushButton { background: transparent; border: none; color: #4a9eff; font-size:14px; padding:2px 6px; border-radius:6px; }
            QPushButton:hover { background: rgba(74,158,255,0.18); }
        """)
        bcl.addWidget(dash_btn); bcl.addWidget(QLabel("›"))
        loc = QLabel("Block Library"); loc.setStyleSheet("color: rgba(224,230,255,0.88); font-weight:800; font-size:14px;"); bcl.addWidget(loc)
        bcl.addStretch()
        hl.addWidget(bcw)
        left_col.addWidget(header)

        self.filter_bar = FilterToolbar(); left_col.addWidget(self.filter_bar)
        self.filter_bar.card_size_changed.connect(self._on_card_size_changed)
        self.filter_bar.request_prev_page.connect(self._prev_page)
        self.filter_bar.request_next_page.connect(self._next_page)
        self.filter_bar.request_page.connect(self._goto_page)
        self.filter_bar.filters_changed.connect(lambda: self._filter_timer.start())

        self.scroll_area = QScrollArea(); self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded); self.scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.scroll_area.setStyleSheet("QScrollArea { border:none; }"); left_col.addWidget(self.scroll_area, 1)

        self.grid_host = QWidget()
        self.grid_host.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #0b0d17, stop:1 #0f1321);
                border-radius: 14px;
            }
        """)
        self.scroll_area.setWidget(self.grid_host)
        self.grid_layout = QGridLayout(self.grid_host); self.grid_layout.setContentsMargins(18,18,18,18)
        self.grid_layout.setHorizontalSpacing(20); self.grid_layout.setVerticalSpacing(20)

        # Right column: live 3D preview
        self.preview3d = Quick3DPreview()
        self.preview3d.open_btn.clicked.connect(self._open_current_in_viewer)

        outer.addLayout(left_col, 3)
        outer.addWidget(self.preview3d, 1)

        # Data & initial render
        now = datetime.now(); self.all_blocks = []
        for i, cat in enumerate(CATEGORIES):
            color = COLOR_CYCLE[i % len(COLOR_CYCLE)]
            folder = next((f for f in LIB_FOLDERS if f["name"] == cat), None)
            folder_path = folder["path"] if folder else ""
            last_mod = _latest_mtime(folder_path) or (now - timedelta(days=(i % 40), hours=(i * 3) % 24))
            self.all_blocks.append({
                "title": cat, "category": cat, "color": color, "size": "medium",
                "last_modified": last_mod, "path_set": bool(folder_path)
            })
        self.filtered_blocks = list(self.all_blocks)
        self._current_meta: Optional[Dict] = None

        self._recalculate_pagination(); self._render_page()
        self.scroll_area.viewport().installEventFilter(self)

        self._relative_timer = QTimer(self); self._relative_timer.timeout.connect(self._refresh_visible_times)
        self._relative_timer.start(RELATIVE_TIME_REFRESH_MS)

    # --- preview actions ---
    def _open_current_in_viewer(self):
        if self._current_meta:
            self.request_open_viewer.emit(dict(self._current_meta))

    def eventFilter(self, obj, event):
        if obj is self.scroll_area.viewport() and event.type() == QEvent.Resize:
            self._resize_timer.start()
        return super().eventFilter(obj, event)

    def _apply_filters(self):
        query = self.filter_bar.search_input.text().strip().lower()
        dropdown_cat = self.filter_bar.category_combo.currentText()
        quick = self.filter_bar.get_quick_mode()
        chips = self.filter_bar.get_selected_chip_categories()
        cutoff = datetime.now() - timedelta(days=RECENT_DAYS)

        def match(it):
            if quick == "Recent" and (not it["last_modified"] or it["last_modified"] < cutoff): return False
            if quick == "Categories":
                if chips and it["category"] not in chips: return False
            else:
                if dropdown_cat != "All Categories" and it["category"] != dropdown_cat: return False
            if query and (query not in it["title"].lower() and query not in it["category"].lower()): return False
            return True

        self.filtered_blocks = [b for b in self.all_blocks if match(b)]
        self.current_page = 0
        self._recalculate_pagination(); self._render_page()

    def _apply_resize(self):
        self._recalculate_pagination(); self._render_page()

    def _refresh_visible_times(self):
        for i in range(self.grid_layout.count()):
            w = self.grid_layout.itemAt(i).widget()
            if isinstance(w, AdvancedBlockCard): w._refresh_time_text()

    def _on_card_size_changed(self, _value: str):
        self._recalculate_pagination(); self._render_page()

    def _estimate_card_metrics(self):
        preset = (QSettings("BlockLibraryApp","UI").value("ui/card_size","Medium") or "Medium").lower()
        if preset == "compact": return 220, 236
        if preset == "large":   return 320, 312
        return 260, 268

    def _recalculate_pagination(self):
        vp = self.scroll_area.viewport().size()
        if vp.width() <= 0 or vp.height() <= 0:
            self.items_per_page = 12
        else:
            card_w, card_h = self._estimate_card_metrics()
            h_sp = self.grid_layout.horizontalSpacing(); v_sp = self.grid_layout.verticalSpacing()
            cols = max(1, floor((vp.width() - 36 + h_sp) / (card_w + h_sp)))
            rows = max(1, floor((vp.height() - 36 + v_sp) / (card_h + v_sp)))
            self.items_per_page = max(1, cols * rows)
        total = len(self.filtered_blocks)
        self.total_pages = max(1, (total + self.items_per_page - 1) // self.items_per_page)
        self.current_page = min(self.current_page, self.total_pages - 1)
        self._update_pagination_controls(total)

    def _update_pagination_controls(self, total_blocks: int):
        lay = self.filter_bar.page_numbers_layout
        while lay.count():
            it = lay.takeAt(0); w = it.widget()
            if w: w.deleteLater()

        def ellipsis():
            lab = QLabel("…"); lab.setStyleSheet(f"color:{TEXT_MAIN}; font-size:14px;")
            lay.addWidget(lab)

        def mk(p, active):
            b = QPushButton(str(p)); b.setFixedSize(28,28)
            if active:
                b.setStyleSheet("QPushButton { background:#4a9eff; border:1px solid #4a9eff; border-radius:14px; color:white; font-weight:bold; }")
                b.setEnabled(False)
            else:
                b.setStyleSheet(f"QPushButton {{ background: rgba(255,255,255,0.06); border:1px solid {GLASS_STROKE}; border-radius:14px; }} QPushButton:hover {{ background: rgba(255,255,255,0.10); }}")
                b.clicked.connect(lambda _, x=p: self._goto_page(x-1))
            return b

        pages = max(1, self.total_pages); cur = max(1, self.current_page+1)
        if pages <= 7: seq = list(range(1, pages+1))
        else:
            seq = sorted(set([1,2,cur-1,cur,cur+1,pages-1,pages])); seq = [p for p in seq if 1 <= p <= pages]
        last = None
        for p in seq:
            if last and p - last > 1: ellipsis()
            lay.addWidget(mk(p, p==cur)); last = p
        self.filter_bar.prev_btn.setEnabled(cur > 1); self.filter_bar.next_btn.setEnabled(cur < pages)

    def _clear_grid(self):
        while self.grid_layout.count():
            item = self.grid_layout.takeAt(0); w = item.widget()
            if w: w.setParent(None); w.deleteLater()

    def _render_page(self):
        self._clear_grid()
        start = self.current_page * self.items_per_page
        end = min(len(self.filtered_blocks), start + self.items_per_page)
        card_w, _ = self._estimate_card_metrics()
        h_sp = self.grid_layout.horizontalSpacing()
        area_w = max(1, self.scroll_area.viewport().width() - 36)
        cols = max(1, floor((area_w + h_sp) / (card_w + h_sp)))

        first_meta = None
        for idx, it in enumerate(self.filtered_blocks[start:end]):
            card = AdvancedBlockCard(it["title"], it["category"], it["color"], it["size"], it["last_modified"], it["path_set"])
            card.clicked.connect(self.request_open_viewer.emit)
            card.hovered.connect(self._on_card_hover)
            card.set_card_size(QSettings("BlockLibraryApp","UI").value("ui/card_size","Medium"))
            r, c = divmod(idx, cols); self.grid_layout.addWidget(card, r, c)
            if first_meta is None: first_meta = it

        if first_meta:
            self._current_meta = dict(first_meta)
            self.preview3d.show_meta(self._current_meta)

        self._update_pagination_controls(len(self.filtered_blocks))

    def _on_card_hover(self, meta: Dict):
        self._current_meta = dict(meta)
        self.preview3d.show_meta(self._current_meta)

    def _prev_page(self):
        if self.current_page > 0:
            self.current_page -= 1; self._render_page()

    def _next_page(self):
        if self.current_page < self.total_pages - 1:
            self.current_page += 1; self._render_page()

    def _goto_page(self, page_index: int):
        page_index = max(0, min(self.total_pages - 1, page_index))
        if page_index != self.current_page:
            self.current_page = page_index; self._render_page()


# Optional runner for this file alone
class _HostWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Block Library")
        self.resize(1400, 900)
        self.setStyleSheet("""
            QMainWindow {
                background:
                    radialgradient(cx:0.28, cy:0.22, radius:1.1,
                                   fx:0.28, fy:0.22,
                                   stop:0 #0b0e19, stop:0.5 #0e1324, stop:1 #0a0c16),
                    radialgradient(cx:0.86, cy:0.88, radius:1.2,
                                   fx:0.86, fy:0.88,
                                   stop:0 rgba(80,100,180,0.10),
                                   stop:0.6 rgba(20,24,40,0.20),
                                   stop:1 rgba(10,12,22,1));
            }
        """)
        self.view = BlockLibraryView()
        self.view.request_home.connect(self.close)
        self.setCentralWidget(self.view)
        self.setStatusBar(QStatusBar()); self.statusBar().showMessage("Block Library")

def main():
    from PySide6.QtWidgets import QApplication
    app = QApplication(sys.argv)
    w = _HostWindow(); w.show()
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
