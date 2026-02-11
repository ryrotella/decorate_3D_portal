import * as THREE from 'three';

interface VideoRecord {
  video: HTMLVideoElement;
  texture: THREE.VideoTexture;
  objectUrl: string | null;
}

export class VideoElementManager {
  private videos = new Map<string, VideoRecord>();

  createFromUrl(sourceId: string, url: string): THREE.VideoTexture {
    this.dispose(sourceId);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = url;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.play().catch(() => {});

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;

    this.videos.set(sourceId, { video, texture, objectUrl: null });
    return texture;
  }

  createFromFile(sourceId: string, file: File): THREE.VideoTexture {
    this.dispose(sourceId);

    const objectUrl = URL.createObjectURL(file);

    const video = document.createElement('video');
    video.src = objectUrl;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.play().catch(() => {});

    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;

    this.videos.set(sourceId, { video, texture, objectUrl });
    return texture;
  }

  play(sourceId: string): void {
    const record = this.videos.get(sourceId);
    if (record) record.video.play().catch(() => {});
  }

  pause(sourceId: string): void {
    const record = this.videos.get(sourceId);
    if (record) record.video.pause();
  }

  dispose(sourceId: string): void {
    const record = this.videos.get(sourceId);
    if (!record) return;

    record.video.pause();
    record.video.src = '';
    record.video.load();
    record.texture.dispose();
    if (record.objectUrl) {
      URL.revokeObjectURL(record.objectUrl);
    }
    this.videos.delete(sourceId);
  }

  disposeAll(): void {
    for (const id of Array.from(this.videos.keys())) {
      this.dispose(id);
    }
  }
}
