# path: app/ui/preview_widget.py
#!/usr/bin/env python3
"""Block Preview Widget with grid, fit, anchors+labels, pinned legend, and transform change signal."""

from __future__ import annotations
from typing import List, Dict, Iterable, Tuple

from PySide6.QtCore import Qt, QRectF, Signal
from PySide6.QtGui import QPainterPath, QPen, QTransform, QColor, QPainter
from PySide6.QtWidgets import (
    QGraphicsView, QGraphicsScene, QGraphicsPathItem,
    QGraphicsSimpleTextItem, QGraphicsItem
)

def _frange(start: float, stop: float, step: float) -> Iterable[float]:
    x = float(start)
    if step == 0:
        return
    if start <= stop and step > 0:
        while x <= stop:
            yield x
            x += step
    elif start >= stop and step < 0:
        while x >= stop:
            yield x
            x += step

class BlockPreviewWidget(QGraphicsView):
    transformChanged = Signal(QTransform)  # why: let parent persist user zoom/pan

    def __init__(self, parent=None):
        super().__init__(parent)
        self._scene = QGraphicsScene(self)
        self.setScene(self._scene)

        self.setRenderHints(self.renderHints() | QPainter.Antialiasing | QPainter.TextAntialiasing)
        self.setDragMode(QGraphicsView.ScrollHandDrag)
        self.setViewportUpdateMode(QGraphicsView.BoundingRectViewportUpdate)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.AnchorUnderMouse)

        t = QTransform()
        t.scale(1.0, -1.0)  # Y-up
        self.setTransform(t)

        self._curve_pen = QPen(QColor(0, 120, 215), 1.5); self._curve_pen.setCosmetic(True)
        self._grid_pen  = QPen(QColor(160, 160, 160), 1);  self._grid_pen.setCosmetic(True); self._grid_pen.setStyle(Qt.DashLine)
        self._axis_pen  = QPen(QColor(110, 110, 110), 1);  self._axis_pen.setCosmetic(True)

        self._tag_radius = 6.0
        self._default_tag_color = QColor(220, 190, 50)
        self._tag_color_map: Dict[str, QColor] = {}
        self._tag_items: List[QGraphicsItem] = []
        self._last_bbox: QRectF | None = None

        self._legend_entries: List[Tuple[str, QColor]] = []
        self._legend_visible: bool = False

        self._grid_step = 50.0
        self._margin_ratio = 0.18

        self.is_animating = False

    # ---- public API ----
    def set_margin(self, ratio: float) -> None:
        self._margin_ratio = max(0.0, min(0.5, float(ratio)))

    def set_tag_color_map(self, cmap: Dict[str, Tuple[int, int, int] | QColor]) -> None:
        self._tag_color_map = {
            str(k).upper(): (v if isinstance(v, QColor) else QColor(*v))
            for k, v in (cmap or {}).items()
        }

    def clear(self) -> None:
        self._scene.clear()
        self._tag_items.clear()
        self._legend_entries = []
        self._legend_visible = False
        self._last_bbox = None
        self.viewport().update()
        self.transformChanged.emit(self.transform())

    def clear_tags(self) -> None:
        # why: avoid "removeItem: item's scene is different" warnings when items already removed
        for it in list(self._tag_items):
            sc = it.scene()
            if sc is self._scene:
                sc.removeItem(it)
        self._tag_items.clear()
        self._legend_entries = []
        self._legend_visible = False
        self.viewport().update()

    def show_curves(self, curves: List[Dict]) -> None:
        self._scene.clear()
        self._tag_items.clear()
        self._legend_entries = []
        self._legend_visible = False
        self._last_bbox = None

        if not curves:
            self._show_empty_state()
            return

        path = QPainterPath()
        for c in curves:
            kind = (c.get("Kind") or c.get("kind") or "").lower()
            pts = list(c.get("Points") or c.get("points") or [])
            if kind == "line" and len(pts) >= 4:
                x1, y1, x2, y2 = pts[:4]
                path.moveTo(x1, y1)
                path.lineTo(x2, y2)
            elif kind == "polyline" and len(pts) >= 4:
                it = iter(pts)
                try:
                    x0, y0 = next(it), next(it)
                    path.moveTo(x0, y0)
                    for x, y in zip(it, it):
                        path.lineTo(x, y)
                except StopIteration:
                    pass

        if path.isEmpty():
            self._show_empty_state()
            return

        item = QGraphicsPathItem(path)
        item.setPen(self._curve_pen)
        self._scene.addItem(item)
        bbox = item.boundingRect() if not item.boundingRect().isEmpty() else QRectF(-100, -100, 200, 200)
        self._last_bbox = bbox
        self._add_grid_with_margin(bbox, self._grid_step, self._margin_ratio)

    def current_transform(self) -> QTransform:
        return QTransform(self.transform())

    def _scene_delta_for_pixels(self, dx_px: float, dy_px: float):
        p0 = self.mapToScene(0, 0)
        p1 = self.mapToScene(int(dx_px), int(dy_px))
        return (p1.x() - p0.x(), p1.y() - p0.y())

    def _scene_len_for_pixels(self, px: float) -> float:
        dx, _ = self._scene_delta_for_pixels(px, 0)
        return abs(dx) if abs(dx) > 1e-9 else 1.0

    def show_tags(self, labels: List[Dict]) -> None:
        """labels: [{'Tag':'TAG','X':x,'Y':y,'Height':h}, ...]"""
        self.clear_tags()
        if not labels:
            return

        bbox = self._last_bbox or self._scene.itemsBoundingRect() or QRectF(-100, -100, 200, 200)
        cx, cy = bbox.center().x(), bbox.center().y()

        leader_len = self._scene_len_for_pixels(18.0)
        gap_len = self._scene_len_for_pixels(6.0)

        font = self.font()
        font.setPointSizeF(10)
        present = []

        for lab in labels:
            tag = (lab.get("Tag") or lab.get("tag") or "").upper()
            x = float(lab.get("X") or lab.get("x") or 0.0)
            y = float(lab.get("Y") or lab.get("y") or 0.0)
            color = self._tag_color_map.get(tag, self._default_tag_color)

            r = self._tag_radius
            dot = self._scene.addEllipse(x - r, y - r, 2 * r, 2 * r, QPen(color, 1.5))
            dot.setFlag(QGraphicsItem.ItemIgnoresTransformations, True)
            dot.setZValue(10)

            vx, vy = x - cx, y - cy
            if abs(vx) < 1e-6 and abs(vy) < 1e-6:
                vx, vy = 1.0, 0.0
            mag = (vx * vx + vy * vy) ** 0.5
            ux, uy = vx / mag, vy / mag
            lx, ly = x + ux * leader_len, y + uy * leader_len

            pen = QPen(color, 1.0)
            pen.setCosmetic(True)
            leader = self._scene.addLine(x, y, lx, ly, pen)
            leader.setFlag(QGraphicsItem.ItemIgnoresTransformations, True)
            leader.setZValue(9)

            tx, ty = lx + ux * gap_len, ly + uy * gap_len
            txt = QGraphicsSimpleTextItem(tag)
            txt.setBrush(color)
            txt.setFont(font)
            txt.setPos(tx, ty)
            txt.setFlag(QGraphicsItem.ItemIgnoresTransformations, True)
            txt.setZValue(10)

            self._tag_items.extend([dot, leader, txt])
            if tag not in present:
                present.append(tag)

        self._legend_entries = [(t, self._tag_color_map.get(t, self._default_tag_color)) for t in present]
        self._legend_visible = True
        self.viewport().update()

    def fit_to_view(self, margin: float | None = None) -> None:
        rect = self._scene.itemsBoundingRect()
        if rect.isEmpty():
            rect = QRectF(-100, -100, 200, 200)
        mr = self._margin_ratio if margin is None else margin
        pad_x = max(1.0, rect.width() * mr)
        pad_y = max(1.0, rect.height() * mr)
        rect.adjust(-pad_x, -pad_y, pad_x, pad_y)
        self.setSceneRect(rect)
        self.fitInView(rect, Qt.KeepAspectRatio)
        self.transformChanged.emit(self.transform())

    def wheelEvent(self, ev) -> None:
        z = 1.15 if ev.angleDelta().y() > 0 else 1.0 / 1.15
        self.scale(z, z)
        self.transformChanged.emit(self.transform())

    def mouseReleaseEvent(self, ev) -> None:
        super().mouseReleaseEvent(ev)
        self.transformChanged.emit(self.transform())

    def _add_grid_with_margin(self, bbox: QRectF, step: float, margin_ratio: float) -> None:
        r = QRectF(bbox)
        pad_x = max(1.0, r.width() * margin_ratio)
        pad_y = max(1.0, r.height() * margin_ratio)
        r.adjust(-pad_x, -pad_y, pad_x, pad_y)

        left = int((r.left() // step) - 1) * step
        right = int((r.right() // step) + 1) * step
        bottom = int((r.bottom() // step) - 1) * step
        top = int((r.top() // step) + 1) * step

        for x in _frange(left, right, step):
            self._scene.addLine(x, bottom, x, top, self._grid_pen)
        for y in _frange(bottom, top, step):
            self._scene.addLine(left, y, right, y, self._grid_pen)

        self._scene.addLine(left, 0, right, 0, self._axis_pen)
        self._scene.addLine(0, bottom, 0, top, self._axis_pen)

    def _show_empty_state(self) -> None:
        r = QRectF(-100, -100, 200, 200)
        self._add_grid_with_margin(r, 25.0, 0.18)
        self.fit_to_view()

    def drawForeground(self, painter, rect) -> None:
        super().drawForeground(painter, rect)
        if not (self._legend_visible and self._legend_entries):
            return

        painter.save()
        painter.resetTransform()  # pin to viewport
        vr = self.viewport().rect()

        margin = 10
        sw = 12
        gap = 6
        lh = 18
        total_h = len(self._legend_entries) * lh
        x = margin
        y = vr.height() - margin - total_h

        font = self.font()
        font.setPointSizeF(10)
        painter.setFont(font)
        for i, (name, color) in enumerate(self._legend_entries):
            ry = y + i * lh
            painter.setPen(color)
            painter.drawRect(x, ry, sw, sw)
            painter.drawText(x + sw + gap, ry + sw - 2, name)
        painter.restore()

    def toggle_animation(self):
        self.is_animating = not self.is_animating
