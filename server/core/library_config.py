#!/usr/bin/env python3
"""YAML-backed config for library roots (name/path pairs)."""

import os
import yaml
from typing import List, Dict


DEFAULT_CATEGORIES = [
    "Relay Panels", "Schematic", "Wiring", "Grounding", "Conduit",
    "One-Line", "Vendor", "Logic", "Structural", "Equipment", "Drafting Standards"
]


class LibraryConfig:
    def __init__(self, yaml_path: str):
        self.yaml_path = os.path.abspath(yaml_path)
        self.folders: List[Dict[str, str]] = []
        self._load()

    # ---------- persistence ----------
    def _load(self):
        if not os.path.exists(self.yaml_path):
            self.folders = []
            return
        with open(self.yaml_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        self.folders = list(data.get("folders", []))

    def _save(self):
        os.makedirs(os.path.dirname(self.yaml_path), exist_ok=True)
        with open(self.yaml_path, "w", encoding="utf-8") as f:
            yaml.safe_dump({"folders": self.folders}, f, sort_keys=False, allow_unicode=True)

    # ---------- API ----------
    def ensure_default_categories(self):
        """Seed defaults only if config is empty."""
        if self.folders:
            return
        # Defaults start with blank paths; user fills in later.
        self.folders = [{"name": n, "path": ""} for n in DEFAULT_CATEGORIES]
        self._save()

    def add_folder(self, name: str, path: str):
        self.folders.append({"name": name, "path": path})
        self._save()

    def remove_folder(self, name: str):
        self.folders = [f for f in self.folders if f["name"] != name]
        self._save()

    def rename_folder(self, old: str, new: str):
        for f in self.folders:
            if f["name"] == old:
                f["name"] = new
                break
        self._save()

    def set_path(self, name: str, path: str):
        for f in self.folders:
            if f["name"] == name:
                f["path"] = path
                break
        self._save()
