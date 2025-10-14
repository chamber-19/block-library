#!/usr/bin/env python3
"""
Service Manager for Block Library Backend

Orchestrates all Python backend services:
- AutoCAD Core worker pool
- Thumbnail generation queue
- File system watcher
- Database indexer
- API bridge server
- Supabase sync

Usage:
    python service_manager.py --config config/services.yaml
"""

from __future__ import annotations

import os
import sys
import signal
import threading
import time
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
from enum import Enum

try:
    import yaml
except ImportError:
    print("PyYAML not installed. Run: pip install pyyaml")
    sys.exit(1)

# Add paths for imports
sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))

try:
    from watchdog.observers import Observer
    from watchdog.events import FileSystemEventHandler
    WATCHDOG_AVAILABLE = True
except ImportError:
    WATCHDOG_AVAILABLE = False
    print("[WARN] Watchdog not available. File system monitoring disabled.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ServiceState(Enum):
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


@dataclass
class ServiceStatus:
    name: str
    state: ServiceState
    pid: Optional[int] = None
    uptime: float = 0.0
    error: Optional[str] = None
    stats: Dict[str, Any] = field(default_factory=dict)


class Service:
    """Base class for managed services"""

    def __init__(self, name: str, config: Dict[str, Any]):
        self.name = name
        self.config = config
        self.state = ServiceState.STOPPED
        self.start_time: Optional[float] = None
        self.error: Optional[str] = None
        self.thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

    def start(self) -> bool:
        """Start the service"""
        if self.state == ServiceState.RUNNING:
            logger.warning(f"{self.name} already running")
            return True

        try:
            self.state = ServiceState.STARTING
            logger.info(f"Starting {self.name}...")
            self._stop_event.clear()

            self.thread = threading.Thread(target=self._run, daemon=True)
            self.thread.start()

            self.state = ServiceState.RUNNING
            self.start_time = time.time()
            logger.info(f"{self.name} started successfully")
            return True

        except Exception as e:
            self.error = str(e)
            self.state = ServiceState.ERROR
            logger.error(f"Failed to start {self.name}: {e}")
            return False

    def stop(self) -> bool:
        """Stop the service"""
        if self.state == ServiceState.STOPPED:
            return True

        try:
            self.state = ServiceState.STOPPING
            logger.info(f"Stopping {self.name}...")

            self._stop_event.set()

            if self.thread and self.thread.is_alive():
                self.thread.join(timeout=10)

            self.state = ServiceState.STOPPED
            self.start_time = None
            logger.info(f"{self.name} stopped")
            return True

        except Exception as e:
            self.error = str(e)
            logger.error(f"Error stopping {self.name}: {e}")
            return False

    def _run(self):
        """Override this in subclasses"""
        raise NotImplementedError

    def should_stop(self) -> bool:
        return self._stop_event.is_set()

    def get_status(self) -> ServiceStatus:
        uptime = time.time() - self.start_time if self.start_time else 0.0
        return ServiceStatus(
            name=self.name,
            state=self.state,
            pid=os.getpid() if self.state == ServiceState.RUNNING else None,
            uptime=uptime,
            error=self.error,
            stats=self.get_stats()
        )

    def get_stats(self) -> Dict[str, Any]:
        """Override to provide service-specific stats"""
        return {}


class FileWatcherService(Service):
    """Monitors file system for DWG changes"""

    def __init__(self, name: str, config: Dict[str, Any]):
        super().__init__(name, config)
        self.roots = config.get('roots', [])
        self.observer: Optional[Observer] = None
        self.changes_detected = 0

    def _run(self):
        if not WATCHDOG_AVAILABLE:
            logger.error("Watchdog not available")
            return

        class ChangeHandler(FileSystemEventHandler):
            def __init__(self, service):
                self.service = service

            def on_modified(self, event):
                if not event.is_directory and event.src_path.lower().endswith('.dwg'):
                    self.service.changes_detected += 1
                    logger.info(f"DWG changed: {event.src_path}")

        self.observer = Observer()
        handler = ChangeHandler(self)

        for root in self.roots:
            if os.path.exists(root):
                self.observer.schedule(handler, root, recursive=True)
                logger.info(f"Watching: {root}")

        self.observer.start()

        try:
            while not self.should_stop():
                time.sleep(1)
        finally:
            if self.observer:
                self.observer.stop()
                self.observer.join()

    def get_stats(self) -> Dict[str, Any]:
        return {
            'roots': len(self.roots),
            'changes_detected': self.changes_detected
        }


class IndexerService(Service):
    """Periodically indexes DWG files"""

    def __init__(self, name: str, config: Dict[str, Any]):
        super().__init__(name, config)
        self.roots = config.get('roots', [])
        self.interval = config.get('interval', 3600)  # Default: 1 hour
        self.last_run: Optional[float] = None
        self.files_indexed = 0

    def _run(self):
        try:
            from indexer import IndexerCore
        except ImportError:
            logger.error("Indexer module not available")
            return

        while not self.should_stop():
            try:
                logger.info("Starting indexing...")
                indexer = IndexerCore(self.roots)
                stats = indexer.run(progress_cb=lambda msg: logger.debug(msg))

                self.files_indexed = stats.scanned
                self.last_run = time.time()

                logger.info(f"Indexing complete: {stats.scanned} scanned, "
                          f"{stats.updated} updated, {stats.skipped} skipped")

            except Exception as e:
                logger.error(f"Indexing error: {e}")

            # Sleep in chunks to allow quick shutdown
            for _ in range(int(self.interval)):
                if self.should_stop():
                    break
                time.sleep(1)

    def get_stats(self) -> Dict[str, Any]:
        return {
            'files_indexed': self.files_indexed,
            'last_run': self.last_run,
            'next_run': self.last_run + self.interval if self.last_run else None
        }


class ThumbnailService(Service):
    """Generates thumbnails for DWG files"""

    def __init__(self, name: str, config: Dict[str, Any]):
        super().__init__(name, config)
        self.cache_dir = config.get('cache_dir', 'cache/thumbnails')
        self.queue: List[str] = []
        self.generated = 0

    def _run(self):
        os.makedirs(self.cache_dir, exist_ok=True)

        while not self.should_stop():
            if not self.queue:
                time.sleep(1)
                continue

            dwg_path = self.queue.pop(0)
            try:
                logger.info(f"Generating thumbnail: {dwg_path}")
                # Thumbnail generation logic here
                self.generated += 1
            except Exception as e:
                logger.error(f"Thumbnail generation failed: {e}")

    def add_to_queue(self, dwg_path: str):
        if dwg_path not in self.queue:
            self.queue.append(dwg_path)

    def get_stats(self) -> Dict[str, Any]:
        return {
            'queue_size': len(self.queue),
            'generated': self.generated
        }


class APIBridgeService(Service):
    """Runs the FastAPI bridge server"""

    def __init__(self, name: str, config: Dict[str, Any]):
        super().__init__(name, config)
        self.host = config.get('host', '0.0.0.0')
        self.port = config.get('port', 8000)
        self.requests_handled = 0

    def _run(self):
        try:
            import uvicorn
            from api_bridge import app
        except ImportError:
            logger.error("FastAPI/Uvicorn not available")
            return

        logger.info(f"Starting API bridge on {self.host}:{self.port}")
        uvicorn.run(app, host=self.host, port=self.port, log_level="info")

    def get_stats(self) -> Dict[str, Any]:
        return {
            'host': self.host,
            'port': self.port,
            'requests_handled': self.requests_handled
        }


class ServiceManager:
    """Manages all backend services"""

    def __init__(self, config_path: Optional[str] = None):
        self.services: Dict[str, Service] = {}
        self.running = False

        if config_path and os.path.exists(config_path):
            self.load_config(config_path)
        else:
            self.load_default_config()

    def load_config(self, config_path: str):
        """Load services from YAML config"""
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)

        for service_config in config.get('services', []):
            self.register_service_from_config(service_config)

    def load_default_config(self):
        """Load default service configuration"""
        logger.info("Loading default service configuration")

        # Default roots from library config
        roots = []
        try:
            from library_config import LibraryConfig
            config_file = Path(__file__).parent.parent / "config" / "library.yaml"
            if config_file.exists():
                lib_cfg = LibraryConfig(str(config_file))
                roots = [f['path'] for f in lib_cfg.folders if f.get('path')]
        except Exception as e:
            logger.warning(f"Could not load library config: {e}")

        # Register default services
        if roots and WATCHDOG_AVAILABLE:
            self.register_service('file_watcher', FileWatcherService, {'roots': roots})

        if roots:
            self.register_service('indexer', IndexerService, {
                'roots': roots,
                'interval': 3600
            })

        self.register_service('thumbnail', ThumbnailService, {
            'cache_dir': 'cache/thumbnails'
        })

        self.register_service('api_bridge', APIBridgeService, {
            'host': '0.0.0.0',
            'port': 8000
        })

    def register_service(self, name: str, service_class: type, config: Dict[str, Any]):
        """Register a service"""
        self.services[name] = service_class(name, config)
        logger.info(f"Registered service: {name}")

    def register_service_from_config(self, config: Dict[str, Any]):
        """Register service from config dict"""
        name = config.get('name')
        service_type = config.get('type')

        service_map = {
            'file_watcher': FileWatcherService,
            'indexer': IndexerService,
            'thumbnail': ThumbnailService,
            'api_bridge': APIBridgeService,
        }

        if service_type in service_map:
            self.register_service(name, service_map[service_type], config)

    def start_all(self):
        """Start all services"""
        self.running = True
        logger.info("Starting all services...")

        for name, service in self.services.items():
            if service.config.get('autostart', True):
                service.start()

    def stop_all(self):
        """Stop all services"""
        self.running = False
        logger.info("Stopping all services...")

        for name, service in self.services.items():
            service.stop()

    def get_all_status(self) -> List[ServiceStatus]:
        """Get status of all services"""
        return [service.get_status() for service in self.services.values()]

    def run_forever(self):
        """Run service manager until interrupted"""
        def signal_handler(sig, frame):
            logger.info("Shutdown signal received")
            self.stop_all()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)

        self.start_all()

        logger.info("Service manager running. Press Ctrl+C to stop.")

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            logger.info("Keyboard interrupt received")
        finally:
            self.stop_all()


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Block Library Service Manager')
    parser.add_argument('--config', help='Path to service configuration YAML')
    parser.add_argument('--list', action='store_true', help='List all services')
    parser.add_argument('--status', action='store_true', help='Show service status')

    args = parser.parse_args()

    manager = ServiceManager(args.config)

    if args.list:
        print("\nRegistered Services:")
        for name in manager.services:
            print(f"  - {name}")
        return

    if args.status:
        print("\nService Status:")
        for status in manager.get_all_status():
            print(f"\n{status.name}:")
            print(f"  State: {status.state.value}")
            if status.uptime:
                print(f"  Uptime: {status.uptime:.1f}s")
            if status.error:
                print(f"  Error: {status.error}")
            if status.stats:
                print(f"  Stats: {status.stats}")
        return

    # Run service manager
    manager.run_forever()


if __name__ == "__main__":
    main()
