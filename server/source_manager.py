"""
SyphonSourceManager — discovers Syphon servers, captures frames as numpy arrays.

Uses syphon-python to interface with macOS Syphon framework.
Runs capture in a dedicated thread, exposes frames via a thread-safe buffer.
"""

import threading
import time
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class SyphonSourceManager:
    """Manages discovery and capture from Syphon sources."""

    def __init__(self, max_fps: int = 60):
        self.max_fps = max_fps
        self._min_frame_interval = 1.0 / max_fps

        # Discovered servers: list of {"name": str, "app": str, "id": str, "desc": SyphonServerDescription}
        self._servers: list[dict] = []
        self._servers_lock = threading.Lock()

        # Active captures: source_id -> capture thread info
        self._captures: dict[str, dict] = {}
        self._captures_lock = threading.Lock()

        # Discovery thread
        self._discovery_running = False
        self._discovery_thread: Optional[threading.Thread] = None

        self._syphon_available = False
        self._directory = None
        try:
            import syphon
            # Create directory on main thread — macOS requires main run loop for discovery
            self._directory = syphon.SyphonServerDirectory()
            self._syphon_available = True
        except ImportError:
            logger.warning("syphon-python not installed — running in mock mode")

    def start_discovery(self, interval: float = 5.0) -> None:
        """Start background server discovery."""
        if self._discovery_running:
            return

        # Run first discovery synchronously on the calling thread
        self._discover_servers()

        self._discovery_running = True
        self._discovery_thread = threading.Thread(
            target=self._discovery_loop,
            args=(interval,),
            daemon=True,
        )
        self._discovery_thread.start()
        logger.info("Syphon discovery started (interval=%.1fs)", interval)

    def stop_discovery(self) -> None:
        """Stop background server discovery."""
        self._discovery_running = False
        if self._discovery_thread:
            self._discovery_thread.join(timeout=10)
            self._discovery_thread = None

    def _discovery_loop(self, interval: float) -> None:
        while self._discovery_running:
            try:
                self._discover_servers()
            except Exception:
                logger.exception("Error during Syphon discovery")
            time.sleep(interval)

    def _discover_servers(self) -> None:
        if not self._syphon_available:
            return

        try:
            servers = self._directory.servers
            logger.info("Directory returned %d server(s)", len(servers))

            new_list = []
            for s in servers:
                server_id = f"{s.app_name}:{s.name}" if s.name else s.app_name
                new_list.append({
                    "name": s.name or "(unnamed)",
                    "app": s.app_name,
                    "id": server_id,
                    "desc": s,
                })

            with self._servers_lock:
                old_ids = {s["id"] for s in self._servers}
                new_ids = {s["id"] for s in new_list}
                if new_ids != old_ids:
                    self._servers = new_list
                    logger.info(
                        "Discovered %d Syphon server(s): %s",
                        len(new_list),
                        [s["id"] for s in new_list],
                    )
                else:
                    # Update desc refs without logging
                    self._servers = new_list
        except Exception:
            logger.exception("Failed to enumerate Syphon servers")

    def get_servers(self) -> list[dict]:
        """Return list of currently discovered servers."""
        with self._servers_lock:
            return list(self._servers)

    def start_capture(self, source_id: str) -> bool:
        """Start capturing frames from a specific source."""
        with self._captures_lock:
            if source_id in self._captures:
                return True  # already capturing

        if not self._syphon_available:
            logger.warning("Cannot start capture — syphon not available")
            return False

        # Find the server description
        server_desc = None
        with self._servers_lock:
            for s in self._servers:
                if s["id"] == source_id:
                    server_desc = s
                    break

        if not server_desc:
            logger.error("Source %s not found in discovered servers", source_id)
            return False

        capture_info = {
            "running": True,
            "frame": None,
            "frame_lock": threading.Lock(),
            "width": 0,
            "height": 0,
            "timestamp": 0.0,
            "thread": None,
        }

        thread = threading.Thread(
            target=self._capture_loop,
            args=(source_id, server_desc, capture_info),
            daemon=True,
        )
        capture_info["thread"] = thread

        with self._captures_lock:
            self._captures[source_id] = capture_info

        thread.start()
        logger.info("Started capture for source: %s", source_id)
        return True

    def stop_capture(self, source_id: str) -> None:
        """Stop capturing from a specific source."""
        with self._captures_lock:
            info = self._captures.get(source_id)
            if not info:
                return
            info["running"] = False

        thread = info["thread"]
        if thread:
            thread.join(timeout=5)

        with self._captures_lock:
            self._captures.pop(source_id, None)

        logger.info("Stopped capture for source: %s", source_id)

    @staticmethod
    def _texture_to_numpy(tex) -> np.ndarray:
        """Read pixel data from a Metal texture into a numpy BGRA array."""
        import ctypes

        w = tex.width()
        h = tex.height()
        bytes_per_row = w * 4
        total_bytes = bytes_per_row * h

        # Allocate a ctypes buffer that PyObjC can pass as void* to Metal API
        buf = (ctypes.c_uint8 * total_bytes)()
        tex.getBytes_bytesPerRow_fromRegion_mipmapLevel_(
            buf, bytes_per_row,
            ((0, 0, 0), (w, h, 1)),
            0,
        )
        arr = np.ctypeslib.as_array(buf).reshape(h, w, 4)
        # Metal/Syphon textures have bottom-left origin; flip to top-left for web
        return arr[::-1].copy()

    def _capture_loop(self, source_id: str, server_desc: dict, info: dict) -> None:
        """Main capture loop — runs in dedicated thread."""
        try:
            import syphon

            client = syphon.SyphonMetalClient(server_desc["desc"])
            frame_count = 0

            while info["running"]:
                start = time.monotonic()

                if client.has_new_frame:
                    tex = client.new_frame_image
                    if tex is not None:
                        try:
                            arr = self._texture_to_numpy(tex)
                            frame_count += 1
                            with info["frame_lock"]:
                                info["frame"] = arr
                                info["width"] = arr.shape[1]
                                info["height"] = arr.shape[0]
                                info["timestamp"] = time.time()

                            if frame_count == 1:
                                logger.info(
                                    "First frame captured for %s: %dx%d, non-zero=%s",
                                    source_id, arr.shape[1], arr.shape[0],
                                    bool(arr.any()),
                                )
                            elif frame_count % 300 == 0:
                                logger.info("Source %s: %d frames captured", source_id, frame_count)
                        except Exception:
                            logger.exception("Texture conversion error for %s", source_id)

                elapsed = time.monotonic() - start
                sleep_time = self._min_frame_interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

            client.stop()
        except Exception:
            logger.exception("Capture loop error for source %s", source_id)
            info["running"] = False

    def get_frame(self, source_id: str) -> Optional[tuple[np.ndarray, float, int, int]]:
        """
        Get the latest frame for a source.
        Returns (frame_array, timestamp, width, height) or None.
        """
        with self._captures_lock:
            info = self._captures.get(source_id)
            if not info:
                return None

        with info["frame_lock"]:
            if info["frame"] is None:
                return None
            return (info["frame"].copy(), info["timestamp"], info["width"], info["height"])

    def stop_all(self) -> None:
        """Stop all captures and discovery."""
        self.stop_discovery()
        with self._captures_lock:
            source_ids = list(self._captures.keys())
        for sid in source_ids:
            self.stop_capture(sid)
