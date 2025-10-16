from __future__ import annotations
import sys
import os
from typing import Optional
from PySide6.QtCore import QObject, QThread, Signal

# Import from core module
try:
    from server.core.run_accore import run_accore
except ImportError:
    # Fallback for direct execution
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
    sys.path.insert(0, _ROOT)
    from server.core.run_accore import run_accore


class AutoCADWorker(QObject):
    finished = Signal(dict)
    error = Signal(str)

    def __init__(self, dwg_path: str, op: str, arg: Optional[str] = None, out_json: Optional[str] = None):
        super().__init__()
        self._dwg = dwg_path
        self._op = op  # 'list_blocks' | 'get_block_curves' | 'get_block_tags' | 'list_inserts' | 'plot_batch'
        self._arg = arg
        self._out = out_json
        self._thread: Optional[QThread] = None

    def start(self):
        t = QThread()
        self._thread = t
        self.moveToThread(t)
        t.started.connect(self._run)
        t.start()

    def _emit_done(self, payload: dict):
        try:
            self.finished.emit(payload)
        finally:
            if self._thread:
                self._thread.quit()
                self._thread.wait()

    def _emit_err(self, msg: str):
        try:
            self.error.emit(msg)
        finally:
            if self._thread:
                self._thread.quit()
                self._thread.wait()

    def _run(self):
        try:
            # Pick an output json path if caller didn't pass one
            out_json = self._out
            if not out_json:
                import tempfile, os
                base = f"acc_{self._op}.json"
                out_json = os.path.join(tempfile.gettempdir(), base)

            if self._op == "list_blocks":
                res = run_accore.list_blocks(self._dwg, out_json)
            elif self._op == "get_block_curves":
                if not self._arg:
                    return self._emit_err("Missing block name")
                res = run_accore.get_block_curves(self._dwg, self._arg, out_json)
            elif self._op == "get_block_tags":
                if not self._arg:
                    return self._emit_err("Missing block name")
                res = run_accore.get_block_tags(self._dwg, self._arg, out_json)
            elif self._op == "list_inserts":
                res = run_accore.list_inserts(self._dwg, out_json)
            elif self._op == "plot_batch":
                if not self._arg:
                    return self._emit_err("Missing output folder")
                res = run_accore.plot_batch(self._dwg, self._arg)
            else:
                return self._emit_err(f"Unknown op: {self._op}")
            self._emit_done(res or {})
        except Exception as e:
            self._emit_err(str(e))

