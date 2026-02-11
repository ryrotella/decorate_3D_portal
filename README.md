# JohnnyChung3D

Real-time head-tracked 3D perspective viewer inspired by [Johnny Chung Lee's Wii Remote head tracking](https://johnnylee.net/projects/wii/). Move your head and the on-screen scene shifts perspective as if you're looking through a window into a 3D space.

Designed for use with TouchDesigner, MadMapper, and other creative-coding tools via Syphon (macOS) or Spout (Windows) frame sharing.

## How It Works

1. **MediaPipe Face Landmarker** tracks your head position and orientation through your webcam.
2. An **off-axis (asymmetric frustum) projection** updates in real time based on where your eyes are relative to the screen.
3. A **Python server** captures frames from Syphon/Spout sources and streams them over WebSocket as MJPEG.
4. The **Three.js client** maps those video streams onto planes at different depths, creating a convincing parallax "depth box" illusion.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| 3D Rendering | Three.js r170 |
| Head Tracking | MediaPipe Face Landmarker (tasks-vision) |
| UI | React 18 + TypeScript + Tailwind CSS |
| Build | Vite 6 |
| Server | Python + FastAPI + uvicorn |
| Frame Capture | syphon-python (macOS) / SpoutGL (Windows) |
| Frame Encoding | OpenCV + NumPy |

## Getting Started

### Prerequisites

- **Node.js** 18+
- **Python** 3.10+
- **macOS** with Syphon-compatible app (e.g. TouchDesigner), or **Windows** with Spout

### Client

```bash
cd client
npm install
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/ws` requests to the Python server on port 8765.

### Server (macOS)

```bash
cd server
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python syphon_server.py
```

### Server (Windows)

```bash
cd server
python -m venv venv
venv\Scripts\activate
pip install -r requirements-windows.txt
python syphon_server.py
```

The server starts on port 8765 by default (configurable in `server/config.json`).

## Server API

| Endpoint | Type | Description |
|----------|------|-------------|
| `GET /api/sources` | HTTP | List discovered Syphon/Spout video sources |
| `/ws/stream/{source_id}` | WebSocket | Binary MJPEG frame stream for a source |
| `/ws/control` | WebSocket | JSON control channel |

Binary frame protocol: `[type:1][timestamp:8][width:4][height:4][len:4][jpeg_data:N]`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `D` | Toggle debug overlay |
| `S` | Toggle settings panel |

## Project Structure

```
client/
  src/
    components/   ThreeView, FaceMeshView, DebugOverlay, SettingsPanel,
                  CalibrationWizard, CameraPermission, VideoSourceManager
    hooks/        useFaceLandmarker, useWebSocket, useVideoSources,
                  useMonitorDetection
    utils/        headPose, offAxisCamera, threeScene, calibration,
                  videoTextureManager
    types/        Shared TypeScript interfaces

server/
    syphon_server.py        Main FastAPI server
    source_manager.py       Syphon/Spout source discovery & capture
    spout_source_manager.py Windows Spout capture
    frame_encoder.py        JPEG encoding pipeline
    config.json             Server configuration
```

## Configuration

`server/config.json`:

```json
{
  "host": "0.0.0.0",
  "port": 8765,
  "mjpeg_quality": 80,
  "max_fps": 60,
  "discovery_interval_sec": 5
}
```

Client calibration (screen size, viewing distance, FOV) is stored in `localStorage` and adjustable from the settings panel.

## License

MIT
