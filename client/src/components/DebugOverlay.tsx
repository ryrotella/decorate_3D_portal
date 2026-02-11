import { useState, useEffect, useRef } from 'react';
import type { SmoothedHeadPose, PerformanceMetrics } from '../types';

interface DebugOverlayProps {
  headPose: SmoothedHeadPose | null;
  debugParams: {
    headX: number;
    headY: number;
    headZ: number;
    screenWidth: number;
    screenHeight: number;
  } | null;
  serverConnected: boolean;
}

const DebugOverlay: React.FC<DebugOverlayProps> = ({
  headPose,
  debugParams,
  serverConnected,
}) => {
  const [visible, setVisible] = useState(false);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    trackingFps: 0,
    trackingLatencyMs: 0,
    renderTimeMs: 0,
    streamLatencyMs: 0,
    frameDecodeMs: 0,
  });

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(performance.now());
  const trackingCountRef = useRef(0);

  // Toggle with 'D' key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        if (e.target === document.body || e.target === null) {
          setVisible((v) => !v);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // FPS counter
  useEffect(() => {
    if (!visible) return;

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - lastFpsTimeRef.current) / 1000;
      setMetrics((m) => ({
        ...m,
        fps: Math.round(frameCountRef.current / elapsed),
        trackingFps: Math.round(trackingCountRef.current / elapsed),
      }));
      frameCountRef.current = 0;
      trackingCountRef.current = 0;
      lastFpsTimeRef.current = now;
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  // Count frames via RAF
  useEffect(() => {
    if (!visible) return;

    let running = true;
    const count = () => {
      if (!running) return;
      frameCountRef.current++;
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    return () => { running = false; };
  }, [visible]);

  // Count tracking updates
  const lastPoseTime = useRef(0);
  useEffect(() => {
    if (headPose && headPose.timestamp !== lastPoseTime.current) {
      trackingCountRef.current++;
      lastPoseTime.current = headPose.timestamp;
    }
  }, [headPose]);

  if (!visible) return null;

  return (
    <div className="absolute top-4 left-4 z-30 bg-black/80 backdrop-blur-sm text-white font-mono text-[10px] p-3 rounded border border-gray-700 max-w-xs leading-relaxed">
      <div className="text-gray-400 mb-1">DEBUG OVERLAY (D to toggle)</div>

      <div className="border-b border-gray-700 pb-1 mb-1">
        <span className="text-gray-500">FPS:</span> {metrics.fps} |{' '}
        <span className="text-gray-500">Track:</span> {metrics.trackingFps} fps
      </div>

      {headPose ? (
        <>
          <div className="text-gray-400 mt-1">Head Pose (norm)</div>
          <div>
            x: {headPose.x.toFixed(3)} y: {headPose.y.toFixed(3)} z: {headPose.z.toFixed(3)}
          </div>
          <div className="text-gray-400 mt-1">Head Pose (world cm)</div>
          <div>
            x: {headPose.worldX.toFixed(1)} y: {headPose.worldY.toFixed(1)} z: {headPose.worldZ.toFixed(1)}
          </div>
          <div className="text-gray-500 mt-0.5">
            IOD: {headPose.interOcularPx.toFixed(4)}
          </div>
        </>
      ) : (
        <div className="text-yellow-500 mt-1">No face detected</div>
      )}

      {debugParams && (
        <>
          <div className="text-gray-400 mt-1">Projection (m)</div>
          <div>
            hd: {debugParams.headX.toFixed(4)}, {debugParams.headY.toFixed(4)}, {debugParams.headZ.toFixed(4)}
          </div>
          <div className="text-gray-500">
            scr: {debugParams.screenWidth.toFixed(3)} x {debugParams.screenHeight.toFixed(3)}
          </div>
        </>
      )}

      <div className="border-t border-gray-700 mt-1 pt-1">
        <span className="text-gray-500">Server:</span>{' '}
        <span className={serverConnected ? 'text-green-400' : 'text-red-400'}>
          {serverConnected ? 'connected' : 'disconnected'}
        </span>
      </div>
    </div>
  );
};

export default DebugOverlay;
