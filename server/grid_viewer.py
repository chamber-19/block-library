# ============================================================
# File: ui_prototypes/grid_viewer.py
# ============================================================
#!/usr/bin/env python3
"""
3D Grid Viewer (Qt3D-first, 2D fallback) with HUD and controls.

Wires with dashboard_layout.py:
- DashboardLayout._ensure_grid_viewer() creates GridViewer
- gv.open_block(meta: dict) opens a primitive tied to category
- gv.open_dwg(path: str) updates HUD and (stub) loads DWG

Controls (when Qt3D available):
- F              : Fit view
- Space          : Toggle turntable animation
- M              : Toggle Orbit / FPS mode
- G              : Toggle ground plane visibility
- S              : Save screenshot (PNG)
"""

import os
import sys
from typing import Dict, Optional

from PySide6.QtCore import Qt, QTimer, QDateTime, QSize, QPoint, QRect, Signal, QObject
from PySide6.QtGui import QAction, QKeySequence, QColor, QPixmap
from PySide6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QToolBar, QFileDialog, QMessageBox, QStatusBar, QPushButton
)

# ---------- Optional Qt3D ----------
_QT3D_OK = True
try:
    from PySide6.Qt3DCore import QEntity, QTransform
    from PySide6.Qt3DExtras import (
        Qt3DWindow, QOrbitCameraController, QFirstPersonCameraController,
        QPhongMaterial, QCuboidMesh, QSphereMesh, QCylinderMesh, QConeMesh,
        QPlaneMesh
    )
    from PySide6.Qt3DRender import QPointLight
except Exception:
    _QT3D_OK = False

# Allow environment to disable Qt3D explicitly (default: enabled)
import os as _os
if _os.environ.get("ENABLE_QT3D", "1") != "1":
    _QT3D_OK = False


def _qcolor_from_hex(c: str) -> QColor:
    try:
        return QColor(c)
    except Exception:
        return QColor("#4a9eff")


class _Hud(QWidget):
    """Lightweight HUD overlay for file/block info."""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)
        self.setStyleSheet("""
            QWidget {
                background: transparent;
            }
            QLabel#pill {
                background: rgba(12,14,24,0.72);
                border: 1px solid rgba(110,130,180,0.35);
                border-radius: 10px;
                color: #e0e6ff;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: 700;
            }
            QLabel#sub {
                color: rgba(224,230,255,0.85);
                font-size: 11px;
                padding: 2px 6px;
            }
        """)
        outer = QVBoxLayout(self)
        outer.setContentsMargins(12, 12, 12, 12)
        outer.setSpacing(6)

        top = QWidget()
        tlay = QHBoxLayout(top)
        tlay.setContentsMargins(0, 0, 0, 0)
        tlay.setSpacing(8)
        self.pill = QLabel("Ready"); self.pill.setObjectName("pill")
        self.badge = QLabel("")  # category / status
        self.badge.setObjectName("sub")
        tlay.addWidget(self.pill, 0, Qt.AlignLeft)
        tlay.addWidget(self.badge, 0, Qt.AlignLeft)
        tlay.addStretch(1)

        bottom = QWidget()
        blay = QHBoxLayout(bottom)
        blay.setContentsMargins(0, 0, 0, 0)
        blay.setSpacing(8)
        self.sub_left = QLabel(""); self.sub_left.setObjectName("sub")
        self.sub_right = QLabel(""); self.sub_right.setObjectName("sub")
        blay.addWidget(self.sub_left, 0, Qt.AlignLeft)
        blay.addStretch(1)
        blay.addWidget(self.sub_right, 0, Qt.AlignRight)

        outer.addWidget(top, 0, Qt.AlignTop | Qt.AlignLeft)
        outer.addStretch(1)
        outer.addWidget(bottom)

    def update_block(self, title: str, category: str, color_hex: str):
        self.pill.setText(title if title else "Block")
        self.badge.setText(category if category else "")
        # tint pill border via stylesheet injection
        self.pill.setStyleSheet(f"""
            QLabel#pill {{
                background: rgba(12,14,24,0.72);
                border: 1px solid {color_hex};
                border-radius: 10px;
                color: #e0e6ff;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: 800;
            }}
        """)

    def update_file(self, filename: str, folder: str):
        self.pill.setText(filename or "DWG")
        self.badge.setText(folder or "")

    def set_status(self, left: str = "", right: str = ""):
        self.sub_left.setText(left)
        self.sub_right.setText(right)


class GridViewer(QMainWindow):
    """3D viewer with HUD + controls; 2D fallback if Qt3D is missing."""
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self.setWindowTitle("Grid Viewer")
        self.resize(1280, 860)
        self.setStatusBar(QStatusBar())
        self.statusBar().showMessage("Ready")

        self._fps_mode = False
        self._turntable_on = False
        self._turntable_speed = 18.0  # deg/sec
        self._model_entity: Optional['QEntity'] = None
        self._model_transform: Optional['QTransform'] = None
        self._ground_entity: Optional['QEntity'] = None

        self._build_toolbar()

        if _QT3D_OK:
            self._build_3d()
        else:
            self._build_fallback()

        # Turntable timer
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._animate_turntable)

        # shortcuts
        self._install_shortcuts()

    # ---------- UI scaffolding ----------
    def _build_toolbar(self):
        tb = QToolBar("Viewer")
        tb.setMovable(False)
        self.addToolBar(tb)

        self.act_fit = QAction("Fit", self)
        self.act_fit.setShortcut(QKeySequence("F"))
        self.act_fit.triggered.connect(self._fit)

        self.act_mode = QAction("Orbit", self)
        self.act_mode.setCheckable(True)
        self.act_mode.setChecked(True)
        self.act_mode.setShortcut(QKeySequence("M"))
        self.act_mode.triggered.connect(self._toggle_mode)

        self.act_anim = QAction("Animate", self)
        self.act_anim.setCheckable(True)
        self.act_anim.setShortcut(QKeySequence(Qt.Key_Space))
        self.act_anim.triggered.connect(self._toggle_animation)

        self.act_ground = QAction("Ground", self)
        self.act_ground.setCheckable(True)
        self.act_ground.setChecked(True)
        self.act_ground.setShortcut(QKeySequence("G"))
        self.act_ground.triggered.connect(self._toggle_ground)

        self.act_shot = QAction("Screenshot", self)
        self.act_shot.setShortcut(QKeySequence("S"))
        self.act_shot.triggered.connect(self._screenshot)

        self.act_open = QAction("Open DWG…", self)
        self.act_open.triggered.connect(self._open_dwg_dialog)

        tb.addActions([self.act_fit, self.act_mode, self.act_anim, self.act_ground, self.act_shot])
        tb.addSeparator()
        tb.addAction(self.act_open)

    def _build_fallback(self):
        holder = QWidget()
        lay = QVBoxLayout(holder)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        canvas = QWidget()
        canvas.setStyleSheet("QWidget { background: #0e111a; }")
        lay.addWidget(canvas, 1)

        self.hud = _Hud(canvas)
        # manual overlay layout
        hud_layout = QVBoxLayout(canvas)
        hud_layout.setContentsMargins(0, 0, 0, 0)
        hud_layout.addWidget(self.hud)

        self.setCentralWidget(holder)
        self.statusBar().showMessage("Qt3D not available – using fallback.")

    def _build_3d(self):
        # Window container
        self._qt3d = Qt3DWindow()
        self._qt3d.defaultFrameGraph().setClearColor(QColor(6, 8, 14))
        container = QWidget.createWindowContainer(self._qt3d)
        container.setMinimumSize(QSize(400, 300))
        container.setFocusPolicy(Qt.TabFocus)
        central = QWidget()
        cl = QVBoxLayout(central)
        cl.setContentsMargins(0, 0, 0, 0)
        cl.setSpacing(0)
        cl.addWidget(container, 1)
        self.setCentralWidget(central)

        # Scene
        self._root = QEntity()
        self._cam = self._qt3d.camera()
        self._cam.lens().setPerspectiveProjection(45.0, 16/9, 0.1, 2000.0)
        self._cam.setPosition(Qt.vec3D(0.0, 7.0, 18.0))
        self._cam.setViewCenter(Qt.vec3D(0.0, 0.0, 0.0))

        # Controllers
        self._orbit = QOrbitCameraController(self._root)
        self._orbit.setCamera(self._cam)
        self._fps = QFirstPersonCameraController(self._root)
        self._fps.setCamera(self._cam)
        self._fps.setEnabled(False)

        # Light
        le = QEntity(self._root)
        light = QPointLight(le)
        light.setIntensity(1.2)
        le.addComponent(light)

        # Ground plane
        self._ground_entity = QEntity(self._root)
        gmesh = QPlaneMesh(); gmesh.setWidth(120); gmesh.setHeight(120)
        gmat = QPhongMaterial(self._ground_entity)
        gmat.setDiffuse(QColor(28, 30, 40))
        self._ground_entity.addComponent(gmesh); self._ground_entity.addComponent(gmat)

        # Model holder
        self._model_entity = None
        self._model_transform = None

        # Commit scene
        self._qt3d.setRootEntity(self._root)

        # HUD overlay over central widget
        hud_container = QWidget(self.centralWidget())
        hud_container.setAttribute(Qt.WA_TransparentForMouseEvents)
        hud_container.setStyleSheet("background: transparent;")
        hl = QVBoxLayout(hud_container)
        hl.setContentsMargins(0, 0, 0, 0)
        self.hud = _Hud(hud_container)
        hl.addWidget(self.hud)

        # place hud_container above Qt3D container
        wrapper = QWidget()
        wrapper_l = QVBoxLayout(wrapper)
        wrapper_l.setContentsMargins(0, 0, 0, 0)
        wrapper_l.setSpacing(0)
        wrapper_l.addWidget(container, 1)
        wrapper_l.addWidget(hud_container, 0, Qt.AlignTop | Qt.AlignLeft)
        # Replace central layout with wrapper in our central
        cl: QVBoxLayout = self.centralWidget().layout()
        cl.takeAt(0)  # remove container
        cl.addWidget(wrapper, 1)

        self.statusBar().showMessage("3D ready")

    def _install_shortcuts(self):
        # Already bound to actions; ensure they work even without menu focus
        for act in (self.act_fit, self.act_mode, self.act_anim, self.act_ground, self.act_shot):
            act.setShortcutVisibleInContextMenu(True)

    # ---------- Public API ----------
    def open_dwg(self, path: str):
        """Open a DWG (stub: sets HUD and status; integrate your pipeline here)."""
        if not path:
            return
        fn = os.path.basename(path)
        folder = os.path.dirname(path)
        self.hud.update_file(fn, folder)
        self.hud.set_status(left="DWG", right=QDateTime.currentDateTime().toString("hh:mm:ss"))
        self.statusBar().showMessage(f"DWG selected: {fn}")
        # TODO: integrate your DWG → curves/mesh pipeline here
        # For now, drop a default primitive to represent the model:
        self._show_primitive("dwg", "#4a9eff")

    def open_block(self, meta: Dict):
        """Open a library block based on its metadata (category → primitive)."""
        title = meta.get("title") or meta.get("category") or "Block"
        category = meta.get("category") or ""
        color_hex = meta.get("color", "#4a9eff")
        self.hud.update_block(title, category, color_hex)
        self.hud.set_status(left="Block", right=QDateTime.currentDateTime().toString("hh:mm:ss"))
        self.statusBar().showMessage(f"Block opened: {title}")
        self._show_primitive(category, color_hex)

    # ---------- 3D scene helpers ----------
    def _clear_model(self):
        if not _QT3D_OK:
            return
        if self._model_entity is not None:
            self._model_entity.setParent(None)
            self._model_entity = None
            self._model_transform = None

    def _primitive_for_category(self, cat_lower: str):
        """Map category → mesh class."""
        if "panel" in cat_lower or "struct" in cat_lower or "equip" in cat_lower:
            return QCuboidMesh
        if "wiring" in cat_lower or "logic" in cat_lower:
            return QCylinderMesh
        if "vendor" in cat_lower or "stamps" in cat_lower or "logos" in cat_lower:
            return QSphereMesh
        if "dwg" in cat_lower:
            return QConeMesh
        return QConeMesh

    def _show_primitive(self, category: str, color_hex: str):
        if not _QT3D_OK:
            return
        self._clear_model()

        mesh_cls = self._primitive_for_category((category or "").lower())
        e = QEntity(self._root)
        m = mesh_cls()
        # small sizes to avoid clipping
        try:
            # Some meshes have radius/length defaults we can tweak; it's fine if attrs don't exist
            if hasattr(m, "setRadius"): m.setRadius(2.0)
            if hasattr(m, "setLength"): m.setLength(4.0)
            if hasattr(m, "setRings"): m.setRings(32)
            if hasattr(m, "setSlices"): m.setSlices(32)
            if hasattr(m, "setWidth"): m.setWidth(4.0)
            if hasattr(m, "setHeight"): m.setHeight(4.0)
            if hasattr(m, "setDepth"): m.setDepth(4.0)
        except Exception:
            pass

        mat = QPhongMaterial(e)
        mat.setDiffuse(_qcolor_from_hex(color_hex))

        t = QTransform()
        t.setTranslation(Qt.vec3D(0.0, 2.0, 0.0))

        e.addComponent(m); e.addComponent(mat); e.addComponent(t)
        self._model_entity = e
        self._model_transform = t
        self._fit()

    # ---------- Commands / actions ----------
    def _toggle_mode(self):
        self._fps_mode = not self._fps_mode
        self.act_mode.setText("FPS" if self._fps_mode else "Orbit")
        if not _QT3D_OK:
            return
        self._orbit.setEnabled(not self._fps_mode)
        self._fps.setEnabled(self._fps_mode)
        self.statusBar().showMessage("Mode: FPS" if self._fps_mode else "Mode: Orbit", 2000)

    def _toggle_animation(self):
        self._turntable_on = not self._turntable_on
        if self._turntable_on:
            self._timer.start(16)  # ~60fps
        else:
            self._timer.stop()
        self.statusBar().showMessage("Turntable: On" if self._turntable_on else "Turntable: Off", 2000)

    def _toggle_ground(self):
        if not _QT3D_OK:
            return
        if self._ground_entity:
            self._ground_entity.setEnabled(not self._ground_entity.isEnabled())
            self.statusBar().showMessage(f"Ground: {'On' if self._ground_entity.isEnabled() else 'Off'}", 2000)

    def _fit(self):
        if not _QT3D_OK:
            return
        self._cam.setPosition(Qt.vec3D(0.0, 8.0, 18.0))
        self._cam.setViewCenter(Qt.vec3D(0.0, 2.0, 0.0))

    def _animate_turntable(self):
        if not (_QT3D_OK and self._model_transform):
            return
        # rotate around Y axis
        from math import radians
        # convert speed deg/sec to per-tick delta (16 ms)
        delta_deg = self._turntable_speed * 0.016
        # QTransform in Qt3D has rotation as quaternion; we can apply incremental rotation via setRotationX/Y/Z
        # but PySide6's QTransform exposes setRotationX/Y/Z directly.
        try:
            # compose simple yaw increment
            # we’ll accumulate yaw in property via objectName hack
            cur = getattr(self, "_yaw_deg", 0.0)
            cur = (cur + delta_deg) % 360.0
            setattr(self, "_yaw_deg", cur)
            self._model_transform.setRotationY(cur)
        except Exception:
            # Fallback: no-op if setRotationY not present
            pass

    def _screenshot(self):
        # Grab central widget (works for both 3D and fallback)
        pm: QPixmap = self.centralWidget().grab()
        out, _ = QFileDialog.getSaveFileName(self, "Save Screenshot", "viewer.png", "PNG Files (*.png)")
        if not out:
            return
        ok = pm.save(out, "PNG")
        self.statusBar().showMessage(f"Screenshot saved: {out}" if ok else "Failed to save screenshot", 3000)

    def _open_dwg_dialog(self):
        p, _ = QFileDialog.getOpenFileName(self, "Open DWG", "", "DWG Files (*.dwg);;All Files (*)")
        if p:
            self.open_dwg(p)


def main():
    app = QApplication(sys.argv)
    w = GridViewer()
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
