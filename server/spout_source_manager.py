"""
SpoutSourceManager — discovers Spout senders on Windows, captures frames as numpy arrays.

Same interface as SyphonSourceManager for cross-platform compatibility.
Uses SpoutGL to interface with Spout framework.
"""

import threading
import time
import logging
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


class SpoutSourceManager:
    """Manages discovery and capture from Spout sources on Windows."""

    def __init__(self, max_fps: int = 60):
        self.max_fps = max_fps
        self._min_frame_interval = 1.0 / max_fps

        self._servers: list[dict] = []
        self._servers_lock = threading.Lock()

        self._captures: dict[str, dict] = {}
        self._captures_lock = threading.Lock()

        self._discovery_running = False
        self._discovery_thread: Optional[threading.Thread] = None

        self._spout_available = False
        try:
            import SpoutGL  # noqa: F401
            self._spout_available = True
        except ImportError:
            logger.warning("SpoutGL not installed — running in mock mode")

    def start_discovery(self, interval: float = 5.0) -> None:
        if self._discovery_running:
            return

        self._discovery_running = True
        self._discovery_thread = threading.Thread(
            target=self._discovery_loop,
            args=(interval,),
            daemon=True,
        )
        self._discovery_thread.start()
        logger.info("Spout discovery started (interval=%.1fs)", interval)

    def stop_discovery(self) -> None:
        self._discovery_running = False
        if self._discovery_thread:
            self._discovery_thread.join(timeout=10)
            self._discovery_thread = None

    def _discovery_loop(self, interval: float) -> None:
        while self._discovery_running:
            try:
                self._discover_servers()
            except Exception:
                logger.exception("Error during Spout discovery")
            time.sleep(interval)

    def _discover_servers(self) -> None:
        if not self._spout_available:
            return

        try:
            import SpoutGL

            receiver = SpoutGL.SpoutReceiver()
            count = receiver.getSenderCount()

            new_list = []
            for i in range(count):
                name = receiver.getSenderName(i)
                sender_id = name
                new_list.append({
                    "name": name,
                    "app": name,
                    "id": sender_id,
                })

            receiver.release()

            with self._servers_lock:
                if new_list != self._servers:
                    self._servers = new_list
                    logger.info(
                        "Discovered %d Spout sender(s): %s",
                        len(new_list),
                        [s["id"] for s in new_list],
                    )
        except Exception:
            logger.exception("Failed to enumerate Spout senders")

    def get_servers(self) -> list[dict]:
        with self._servers_lock:
            return list(self._servers)

    def start_capture(self, source_id: str) -> bool:
        with self._captures_lock:
            if source_id in self._captures:
                return True

        if not self._spout_available:
            logger.warning("Cannot start capture — SpoutGL not available")
            return False

        server_desc = None
        with self._servers_lock:
            for s in self._servers:
                if s["id"] == source_id:
                    server_desc = s
                    break

        if not server_desc:
            logger.error("Source %s not found in discovered senders", source_id)
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
        logger.info("Started capture for Spout sender: %s", source_id)
        return True

    def stop_capture(self, source_id: str) -> None:
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

        logger.info("Stopped capture for Spout sender: %s", source_id)

    def _capture_loop(self, source_id: str, server_desc: dict, info: dict) -> None:
        try:
            import SpoutGL

            receiver = SpoutGL.SpoutReceiver()
            receiver.setReceiverName(server_desc["name"])

            buffer = None

            while info["running"]:
                start = time.monotonic()

                # Try to receive a frame
                result = receiver.receiveImage(buffer, SpoutGL.GL_RGBA, False, 0)

                if receiver.isUpdated():
                    w = receiver.getSenderWidth()
                    h = receiver.getSenderHeight()
                    buffer = np.empty(w * h * 4, dtype=np.uint8)
                    result = receiver.receiveImage(buffer, SpoutGL.GL_RGBA, False, 0)

                if result and buffer is not None:
                    w = receiver.getSenderWidth()
                    h = receiver.getSenderHeight()
                    frame = buffer.reshape((h, w, 4))

                    with info["frame_lock"]:
                        info["frame"] = frame.copy()
                        info["width"] = w
                        info["height"] = h
                        info["timestamp"] = time.time()

                elapsed = time.monotonic() - start
                sleep_time = self._min_frame_interval - elapsed
                if sleep_time > 0:
                    time.sleep(sleep_time)

            receiver.release()
        except Exception:
            logger.exception("Capture loop error for Spout sender %s", source_id)
            info["running"] = False

    def get_frame(self, source_id: str) -> Optional[tuple[np.ndarray, float, int, int]]:
        with self._captures_lock:
            info = self._captures.get(source_id)
            if not info:
                return None

        with info["frame_lock"]:
            if info["frame"] is None:
                return None
            return (info["frame"].copy(), info["timestamp"], info["width"], info["height"])

    def stop_all(self) -> None:
        self.stop_discovery()
        with self._captures_lock:
            source_ids = list(self._captures.keys())
        for sid in source_ids:
            self.stop_capture(sid)
