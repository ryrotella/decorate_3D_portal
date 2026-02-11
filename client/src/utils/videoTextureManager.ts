import * as THREE from 'three';

const HEADER_SIZE = 21; // 1 + 8 + 4 + 4 + 4 bytes (type + timestamp + w + h + len)

/**
 * Manages video textures from WebSocket binary frames.
 * Decodes JPEG data via createImageBitmap and updates Three.js textures.
 *
 * Uses ImageBitmap directly as the texture source to avoid canvas resize issues
 * with Three.js WebGL2 texStorage2D immutable storage allocation.
 */
export class VideoTextureManager {
  private textures: Map<string, {
    texture: THREE.Texture;
    lastTimestamp: number;
    frameCount: number;
    processing: boolean;
    currentWidth: number;
    currentHeight: number;
    lastBitmap: ImageBitmap | null;
  }> = new Map();

  /**
   * Get or create a texture for a source ID.
   */
  getTexture(sourceId: string): THREE.Texture {
    const entry = this.textures.get(sourceId);
    if (entry) return entry.texture;

    // Create a visible placeholder canvas so the user sees something immediately
    const placeholder = document.createElement('canvas');
    placeholder.width = 64;
    placeholder.height = 64;
    const ctx = placeholder.getContext('2d')!;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WAIT', 32, 36);

    const texture = new THREE.Texture(placeholder);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    this.textures.set(sourceId, {
      texture,
      lastTimestamp: 0,
      frameCount: 0,
      processing: false,
      currentWidth: 64,
      currentHeight: 64,
      lastBitmap: null,
    });
    console.log(`[VTM] Created texture for source: ${sourceId}`);
    return texture;
  }

  /**
   * Process a binary frame message from the WebSocket.
   * Decodes JPEG and updates the corresponding texture.
   */
  async processFrame(sourceId: string, data: ArrayBuffer): Promise<boolean> {
    if (data.byteLength < HEADER_SIZE) {
      console.warn(`[VTM] Frame too small: ${data.byteLength} bytes (need ${HEADER_SIZE})`);
      return false;
    }

    const view = new DataView(data);
    const type = view.getUint8(0);
    if (type !== 0x01) {
      console.warn(`[VTM] Unknown frame type: 0x${type.toString(16)}`);
      return false;
    }

    // Parse header (little-endian)
    const timestamp = view.getFloat64(1, true);
    const width = view.getUint32(9, true);
    const height = view.getUint32(13, true);
    const dataLen = view.getUint32(17, true);

    if (data.byteLength < HEADER_SIZE + dataLen) {
      console.warn(`[VTM] Frame truncated: have ${data.byteLength}, need ${HEADER_SIZE + dataLen}`);
      return false;
    }

    let entry = this.textures.get(sourceId);
    if (!entry) {
      this.getTexture(sourceId);
      entry = this.textures.get(sourceId)!;
    }

    // Skip stale frames
    if (timestamp <= entry.lastTimestamp) return false;

    // Skip if still processing previous frame (prevents pile-up)
    if (entry.processing) return false;
    entry.processing = true;

    // Extract JPEG data
    const jpegData = data.slice(HEADER_SIZE, HEADER_SIZE + dataLen);
    const blob = new Blob([jpegData], { type: 'image/jpeg' });

    try {
      const bitmap = await createImageBitmap(blob);

      // If dimensions changed, dispose the old WebGL texture so Three.js
      // allocates fresh GPU storage at the new size. Without this,
      // texStorage2D immutable storage from the initial upload would
      // silently reject the dimension change.
      if (entry.currentWidth !== width || entry.currentHeight !== height) {
        console.log(`[VTM] Dimension change for ${sourceId}: ${entry.currentWidth}x${entry.currentHeight} → ${width}x${height}, disposing old GPU texture`);
        entry.texture.dispose();
        entry.currentWidth = width;
        entry.currentHeight = height;
      }

      // Close previous bitmap to free memory
      if (entry.lastBitmap) {
        entry.lastBitmap.close();
      }
      entry.lastBitmap = bitmap;

      // Set the ImageBitmap directly as the texture source
      // This avoids canvas resize issues entirely
      entry.texture.image = bitmap;
      entry.texture.needsUpdate = true;

      entry.lastTimestamp = timestamp;
      entry.frameCount++;
      entry.processing = false;

      if (entry.frameCount === 1) {
        console.log(`[VTM] First frame decoded for ${sourceId}: ${width}x${height}, ${dataLen} bytes JPEG`);
      } else if (entry.frameCount % 300 === 0) {
        console.log(`[VTM] ${sourceId}: ${entry.frameCount} frames processed`);
      }

      return true;
    } catch (err) {
      entry.processing = false;
      console.error(`[VTM] Frame decode failed for ${sourceId}:`, err);
      return false;
    }
  }

  /**
   * Dispose a specific texture.
   */
  disposeTexture(sourceId: string): void {
    const entry = this.textures.get(sourceId);
    if (entry) {
      if (entry.lastBitmap) entry.lastBitmap.close();
      entry.texture.dispose();
      this.textures.delete(sourceId);
      console.log(`[VTM] Disposed texture for source: ${sourceId}`);
    }
  }

  /**
   * Dispose all textures.
   */
  disposeAll(): void {
    for (const [id, entry] of this.textures) {
      if (entry.lastBitmap) entry.lastBitmap.close();
      entry.texture.dispose();
      console.log(`[VTM] Disposed texture for source: ${id}`);
    }
    this.textures.clear();
  }
}
