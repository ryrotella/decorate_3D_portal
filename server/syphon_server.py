"""
JohnnyChung3D — Syphon/Spout WebSocket streaming server.

Endpoints:
  GET  /api/sources          — list discovered video sources
  WS   /ws/stream/{source_id} — binary MJPEG stream for a source
  WS   /ws/control           — JSON control channel
"""

import asyncio
import json
import logging
import platform
import time
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from frame_encoder import encode_mjpeg

# Load config
config_path = Path(__file__).parent / "config.json"
with open(config_path) as f:
    CONFIG = json.load(f)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("syphon_server")

# Platform-aware source manager
system = platform.system()
if system == "Darwin":
    from source_manager import SyphonSourceManager
    source_manager = SyphonSourceManager(max_fps=CONFIG.get("max_fps", 60))
    logger.info("Using Syphon source manager (macOS)")
elif system == "Windows":
    try:
        from spout_source_manager import SpoutSourceManager
        source_manager = SpoutSourceManager(max_fps=CONFIG.get("max_fps", 60))
        logger.info("Using Spout source manager (Windows)")
    except ImportError:
        from source_manager import SyphonSourceManager
        source_manager = SyphonSourceManager(max_fps=CONFIG.get("max_fps", 60))
        logger.warning("SpoutGL not available, falling back to Syphon manager (will run in mock mode)")
else:
    from source_manager import SyphonSourceManager
    source_manager = SyphonSourceManager(max_fps=CONFIG.get("max_fps", 60))
    logger.warning("Unsupported platform %s — running source manager in mock mode", system)

# FastAPI app
app = FastAPI(title="JohnnyChung3D Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    discovery_interval = CONFIG.get("discovery_interval_sec", 5)
    source_manager.start_discovery(interval=discovery_interval)
    logger.info("Server started on %s:%d", CONFIG["host"], CONFIG["port"])


@app.on_event("shutdown")
async def shutdown():
    source_manager.stop_all()
    logger.info("Server stopped")


@app.get("/api/sources")
async def list_sources():
    """Return list of discovered video sources."""
    servers = source_manager.get_servers()
    return {
        "sources": [
            {
                "id": s["id"],
                "name": s["name"],
                "app": s["app"],
                "type": "syphon" if system == "Darwin" else "spout",
            }
            for s in servers
        ]
    }


@app.websocket("/ws/stream/{source_id:path}")
async def stream_source(websocket: WebSocket, source_id: str):
    """
    Binary WebSocket stream for a Syphon/Spout source.
    Sends MJPEG frames as binary messages.
    """
    await websocket.accept()
    logger.info("Stream client connected for source: %s", source_id)

    # Start capturing if not already
    if not source_manager.start_capture(source_id):
        await websocket.send_json({"error": f"Failed to start capture for {source_id}"})
        await websocket.close()
        return

    quality = CONFIG.get("mjpeg_quality", 80)
    max_fps = CONFIG.get("max_fps", 60)
    min_interval = 1.0 / max_fps
    last_frame_time = 0.0
    frames_sent = 0
    no_frame_count = 0

    try:
        while True:
            now = time.time()

            # Respect FPS limit
            elapsed = now - last_frame_time
            if elapsed < min_interval:
                await asyncio.sleep(min_interval - elapsed)
                continue

            frame_data = source_manager.get_frame(source_id)
            if frame_data is not None:
                frame, timestamp, width, height = frame_data
                encoded = encode_mjpeg(frame, quality=quality, timestamp=timestamp)
                if encoded:
                    await websocket.send_bytes(encoded)
                    last_frame_time = time.time()
                    frames_sent += 1
                    no_frame_count = 0

                    if frames_sent == 1:
                        logger.info(
                            "First frame sent for %s: %dx%d, %d bytes encoded",
                            source_id, width, height, len(encoded),
                        )
                    elif frames_sent % 300 == 0:
                        logger.info("Stream %s: %d frames sent", source_id, frames_sent)
                else:
                    logger.warning("JPEG encode failed for %s (frame %dx%d)", source_id, width, height)
            else:
                no_frame_count += 1
                if no_frame_count == 100:
                    logger.warning("Stream %s: no frames available after 100 polls", source_id)
                elif no_frame_count % 1000 == 0:
                    logger.warning("Stream %s: still no frames (%d polls)", source_id, no_frame_count)
                await asyncio.sleep(0.01)

    except WebSocketDisconnect:
        logger.info("Stream client disconnected for source: %s (sent %d frames)", source_id, frames_sent)
    except Exception:
        logger.exception("Error in stream for source: %s", source_id)
    finally:
        # Don't stop capture here — other clients might be watching
        pass


@app.websocket("/ws/control")
async def control_channel(websocket: WebSocket):
    """
    JSON control channel for client commands.
    Messages:
      {"action": "list_sources"}
      {"action": "start_capture", "source_id": "..."}
      {"action": "stop_capture", "source_id": "..."}
    """
    await websocket.accept()
    logger.info("Control client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            action = msg.get("action")

            if action == "list_sources":
                servers = source_manager.get_servers()
                await websocket.send_json({
                    "type": "sources",
                    "sources": [
                        {"id": s["id"], "name": s["name"], "app": s["app"],
                         "type": "syphon" if system == "Darwin" else "spout"}
                        for s in servers
                    ],
                })

            elif action == "start_capture":
                sid = msg.get("source_id", "")
                ok = source_manager.start_capture(sid)
                await websocket.send_json({"type": "capture_started", "source_id": sid, "ok": ok})

            elif action == "stop_capture":
                sid = msg.get("source_id", "")
                source_manager.stop_capture(sid)
                await websocket.send_json({"type": "capture_stopped", "source_id": sid})

            else:
                await websocket.send_json({"type": "error", "message": f"Unknown action: {action}"})

    except WebSocketDisconnect:
        logger.info("Control client disconnected")
    except Exception:
        logger.exception("Error in control channel")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "syphon_server:app",
        host=CONFIG.get("host", "0.0.0.0"),
        port=CONFIG.get("port", 8765),
        log_level="info",
    )
