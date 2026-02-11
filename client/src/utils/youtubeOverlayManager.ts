interface OverlayRecord {
  container: HTMLDivElement;
  player: YT.Player | null;
  videoId: string;
}

let apiLoaded = false;
let apiLoading = false;
const apiReadyCallbacks: (() => void)[] = [];

function loadYouTubeApi(): Promise<void> {
  if (apiLoaded) return Promise.resolve();

  return new Promise<void>((resolve) => {
    if (apiLoading) {
      apiReadyCallbacks.push(resolve);
      return;
    }
    apiLoading = true;
    apiReadyCallbacks.push(resolve);

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      apiLoading = false;
      if (prev) prev();
      for (const cb of apiReadyCallbacks) cb();
      apiReadyCallbacks.length = 0;
    };

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
}

export class YouTubeOverlayManager {
  private overlays = new Map<string, OverlayRecord>();
  private parentEl: HTMLElement;

  constructor(parentEl: HTMLElement) {
    this.parentEl = parentEl;
  }

  async createOverlay(planeId: string, videoId: string): Promise<void> {
    this.destroy(planeId);

    await loadYouTubeApi();

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.zIndex = '5';
    container.style.pointerEvents = 'auto';
    container.style.overflow = 'hidden';
    container.style.display = 'none'; // hidden until positioned
    this.parentEl.appendChild(container);

    const playerDiv = document.createElement('div');
    container.appendChild(playerDiv);

    const player = new YT.Player(playerDiv, {
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          container.style.display = 'block';
        },
      },
    });

    this.overlays.set(planeId, { container, player, videoId });
  }

  updatePosition(planeId: string, rect: { x: number; y: number; w: number; h: number }): void {
    const record = this.overlays.get(planeId);
    if (!record) return;

    record.container.style.left = `${rect.x}px`;
    record.container.style.top = `${rect.y}px`;
    record.container.style.width = `${rect.w}px`;
    record.container.style.height = `${rect.h}px`;

    // Resize the iframe inside
    const iframe = record.container.querySelector('iframe');
    if (iframe) {
      iframe.style.width = '100%';
      iframe.style.height = '100%';
    }
  }

  has(planeId: string): boolean {
    return this.overlays.has(planeId);
  }

  getActivePlaneIds(): string[] {
    return Array.from(this.overlays.keys());
  }

  destroy(planeId: string): void {
    const record = this.overlays.get(planeId);
    if (!record) return;

    if (record.player) {
      try { record.player.destroy(); } catch { /* ignore */ }
    }
    record.container.remove();
    this.overlays.delete(planeId);
  }

  destroyAll(): void {
    for (const id of Array.from(this.overlays.keys())) {
      this.destroy(id);
    }
  }
}
