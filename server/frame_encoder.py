"""
Frame encoder — converts numpy arrays to MJPEG binary frames.

Binary frame protocol:
  [1 byte]  type (0x01 = JPEG frame)
  [8 bytes] timestamp (float64, seconds since epoch)
  [4 bytes] width (uint32)
  [4 bytes] height (uint32)
  [4 bytes] data length (uint32)
  [N bytes] JPEG data
"""

import struct
import time

import cv2
import numpy as np

FRAME_TYPE_JPEG = 0x01
HEADER_FORMAT = "<BdIII"  # type, timestamp, width, height, data_length
HEADER_SIZE = struct.calcsize(HEADER_FORMAT)


def encode_mjpeg(
    frame: np.ndarray,
    quality: int = 80,
    timestamp: float | None = None,
) -> bytes | None:
    """
    Encode a numpy BGR/BGRA frame as a binary MJPEG message.

    Returns the binary message or None if encoding fails.
    """
    if frame is None or frame.size == 0:
        return None

    # Convert BGRA to BGR if needed (Syphon often returns BGRA)
    if frame.ndim == 3 and frame.shape[2] == 4:
        frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)

    h, w = frame.shape[:2]
    ts = timestamp or time.time()

    # JPEG encode
    encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
    ok, jpeg_data = cv2.imencode(".jpg", frame, encode_params)

    if not ok:
        return None

    data = jpeg_data.tobytes()
    header = struct.pack(HEADER_FORMAT, FRAME_TYPE_JPEG, ts, w, h, len(data))
    return header + data


def decode_frame_header(data: bytes) -> tuple[int, float, int, int, int] | None:
    """
    Decode a binary frame header.
    Returns (type, timestamp, width, height, data_length) or None.
    """
    if len(data) < HEADER_SIZE:
        return None
    return struct.unpack(HEADER_FORMAT, data[:HEADER_SIZE])
