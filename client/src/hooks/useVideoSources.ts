import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { VideoTextureManager } from '../utils/videoTextureManager';
import type { VideoSource } from '../types';
import type * as THREE from 'three';

export interface UseVideoSourcesOptions {
  serverUrl?: string;
  pollInterval?: number;
}

export interface UseVideoSourcesReturn {
  sources: VideoSource[];
  /** Connect to a source and start receiving frames */
  connectSource: (sourceId: string) => void;
  /** Disconnect from a source */
  disconnectSource: (sourceId: string) => void;
  /** Get the Three.js texture for a source */
  getTexture: (sourceId: string) => THREE.Texture;
  /** Whether connected to the control server */
  serverConnected: boolean;
}

export function useVideoSources(options?: UseVideoSourcesOptions): UseVideoSourcesReturn {
  const {
    serverUrl = `ws://${window.location.host}`,
    pollInterval = 5000,
  } = options ?? {};

  const [sources, setSources] = useState<VideoSource[]>([]);
  const textureManagerRef = useRef(new VideoTextureManager());
  const streamSocketsRef = useRef<Map<string, WebSocket>>(new Map());

  // Control channel
  const { connected: serverConnected, sendJson } = useWebSocket({
    url: `${serverUrl}/ws/control`,
    onTextMessage: (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'sources') {
          setSources(
            msg.sources.map((s: { id: string; name: string; app: string; type: string }) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              connected: streamSocketsRef.current.has(s.id),
              lastFrameTime: 0,
              width: 0,
              height: 0,
            }))
          );
        }
      } catch {
        // ignore
      }
    },
  });

  // Poll for sources
  useEffect(() => {
    if (!serverConnected) return;

    const poll = () => {
      sendJson({ action: 'list_sources' });
    };

    poll();
    const interval = setInterval(poll, pollInterval);
    return () => clearInterval(interval);
  }, [serverConnected, sendJson, pollInterval]);

  // Also fetch from REST endpoint as initial load
  useEffect(() => {
    fetch(`/api/sources`)
      .then((r) => r.json())
      .then((data) => {
        if (data.sources) {
          setSources(
            data.sources.map((s: { id: string; name: string; type: string }) => ({
              id: s.id,
              name: s.name,
              type: s.type,
              connected: false,
              lastFrameTime: 0,
              width: 0,
              height: 0,
            }))
          );
        }
      })
      .catch(() => {
        // server not available yet
      });
  }, []);

  const connectSource = useCallback(
    (sourceId: string) => {
      if (streamSocketsRef.current.has(sourceId)) return;

      const wsUrl = `${serverUrl}/ws/stream/${encodeURIComponent(sourceId)}`;
      console.log(`[useVideoSources] Connecting stream WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      let msgCount = 0;

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          msgCount++;
          if (msgCount === 1) {
            console.log(`[useVideoSources] First binary frame received for ${sourceId}: ${event.data.byteLength} bytes`);
          } else if (msgCount % 300 === 0) {
            console.log(`[useVideoSources] ${sourceId}: ${msgCount} messages received`);
          }
          textureManagerRef.current.processFrame(sourceId, event.data).catch((err) => {
            console.error(`[useVideoSources] processFrame error for ${sourceId}:`, err);
          });
        } else {
          console.log(`[useVideoSources] Non-binary message for ${sourceId}:`, event.data);
        }
      };

      ws.onclose = (event) => {
        console.log(`[useVideoSources] Stream WebSocket closed for ${sourceId}: code=${event.code} reason=${event.reason}`);
        streamSocketsRef.current.delete(sourceId);
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId ? { ...s, connected: false } : s
          )
        );
      };

      ws.onerror = (event) => {
        console.error(`[useVideoSources] Stream WebSocket error for ${sourceId}:`, event);
      };

      ws.onopen = () => {
        console.log(`[useVideoSources] Stream WebSocket connected for ${sourceId}`);
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId ? { ...s, connected: true } : s
          )
        );
      };

      streamSocketsRef.current.set(sourceId, ws);
    },
    [serverUrl]
  );

  const disconnectSource = useCallback((sourceId: string) => {
    const ws = streamSocketsRef.current.get(sourceId);
    if (ws) {
      ws.close();
      streamSocketsRef.current.delete(sourceId);
    }
    textureManagerRef.current.disposeTexture(sourceId);
  }, []);

  const getTexture = useCallback((sourceId: string) => {
    return textureManagerRef.current.getTexture(sourceId);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const [, ws] of streamSocketsRef.current) {
        ws.close();
      }
      streamSocketsRef.current.clear();
      textureManagerRef.current.disposeAll();
    };
  }, []);

  return { sources, connectSource, disconnectSource, getTexture, serverConnected };
}
