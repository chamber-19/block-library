#!/usr/bin/env python3
"""
Roots Manager dialog – add/remove/rename library roots and edit paths inline.
"""

import os
from typing import Optional, Dict, Any

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QTreeWidget, QTreeWidgetItem,
    QPushButton, QFileDialog, QMessageBox, QHeaderView
)

try:
    from library_config import LibraryConfig
except Exception:
    import sys
    sys.path.append(os.path.dirname(__file__))
    from library_config import LibraryConfig


class RootsManagerDialog(QDialog):
    def __init__(self, cfg: LibraryConfig, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Roots Manager")
        self.resize(720, 420)

        self.cfg = cfg

        layout = QVBoxLayout(self)

        self.tree = QTreeWidget()
        self.tree.setHeaderLabels(["Name", "Path"])
        self.tree.header().setStretchLastSection(True)
        self.tree.header().setSectionResizeMode(0, QHeaderView.ResizeToContents)
        self.tree.header().setSectionResizeMode(1, QHeaderView.Stretch)
        self.tree.setEditTriggers(
            QTreeWidget.EditTrigger.DoubleClicked
            | QTreeWidget.EditTrigger.SelectedClicked
        )
        self.tree.itemChanged.connect(self._on_item_changed)
        layout.addWidget(self.tree)

        row = QHBoxLayout()
        add_btn = QPushButton("Add Root…")
        rem_btn = QPushButton("Remove Selected")
        close_btn = QPushButton("Close")
        add_btn.clicked.connect(self._add_root)
        rem_btn.clicked.connect(self._remove_selected)
        close_btn.clicked.connect(self.accept)
        row.addWidget(add_btn)
        row.addWidget(rem_btn)
        row.addStretch(1)
        row.addWidget(close_btn)
        layout.addLayout(row)

        self._reload()

    def _reload(self):
        self.tree.blockSignals(True)
        self.tree.clear()
        for folder in self.cfg.folders:
            item = QTreeWidgetItem([folder["name"], folder["path"]])
            item.setFlags(item.flags() | Qt.ItemIsEditable)
            item.setData(0, Qt.UserRole, folder["name"])
            self.tree.addTopLevelItem(item)
        self.tree.blockSignals(False)

    def _unique_name(self, base: str) -> str:
        name = base
        i = 2
        existing = {f["name"] for f in self.cfg.folders}
        while name in existing:
            name = f"{base} ({i})"
            i += 1
        return name

    def _add_root(self):
        path = QFileDialog.getExistingDirectory(self, "Pick a library folder")
        if not path:
            return
        if not os.path.isdir(path):
            QMessageBox.warning(self, "Invalid", "Selected path is not a directory.")
            return
        base = os.path.basename(path.rstrip("\\/")) or "Folder"
        name = self._unique_name(base)
        self.cfg.add_folder(name, path)
        self._reload()

    def _remove_selected(self):
        it = self.tree.currentItem()
        if not it:
            return
        old_name = it.data(0, Qt.UserRole) or it.text(0)
        if QMessageBox.question(
            self, "Remove Root?",
            f"Remove “{old_name}” from roots?",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No
        ) != QMessageBox.Yes:
            return
        self.cfg.remove_folder(old_name)
        self._reload()

    def _on_item_changed(self, item: QTreeWidgetItem, column: int):
        old_name = item.data(0, Qt.UserRole) or item.text(0)
        new_name = item.text(0).strip()
        new_path = item.text(1).strip()

        if not os.path.isdir(new_path):
            QMessageBox.warning(self, "Invalid path", "Path must be an existing folder.")
            self.tree.blockSignals(True)
            item.setText(1, next((f["path"] for f in self.cfg.folders if f["name"] == old_name), new_path))
            self.tree.blockSignals(False)
            return

        if old_name not in {f["name"] for f in self.cfg.folders}:
            new_name = self._unique_name(new_name or "Folder")
            self.cfg.add_folder(new_name, new_path)
            item.setData(0, Qt.UserRole, new_name)
        else:
            if new_name != old_name:
                new_name = self._unique_name(new_name or old_name)
                self.cfg.rename_folder(old_name, new_name)
                item.setData(0, Qt.UserRole, new_name)
            self.cfg.set_path(new_name, new_path)
