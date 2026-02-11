import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useFaceLandmarker } from '../hooks/useFaceLandmarker';
import CameraPermission from './CameraPermission';
import { HeadPoseTracker } from '../utils/headPose';
import type { SmoothedHeadPose } from '../types';

interface FaceMeshViewProps {
  onHeadPoseUpdate: (pose: SmoothedHeadPose | null) => void;
  smoothingFactor?: number;
  showLandmarks?: boolean;
}

const FACE_OVAL_INDICES = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];

const LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE_INDICES = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];

const FaceMeshView: React.FC<FaceMeshViewProps> = ({
  onHeadPoseUpdate,
  smoothingFactor = 0.3,
  showLandmarks = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackerRef = useRef(new HeadPoseTracker(smoothingFactor));
  const [hasCamera, setHasCamera] = useState(false);

  const { isLoading, error, startDetection, stopDetection } = useFaceLandmarker();

  // Update smoothing factor
  useEffect(() => {
    trackerRef.current.setSmoothingFactor(smoothingFactor);
  }, [smoothingFactor]);

  const drawLandmarks = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      landmarks: Array<{ x: number; y: number; z: number }>,
      width: number,
      height: number
    ) => {
      ctx.save();
      // Mirror the canvas to match mirrored video
      ctx.scale(-1, 1);
      ctx.translate(-width, 0);

      // Draw face oval
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < FACE_OVAL_INDICES.length; i++) {
        const lm = landmarks[FACE_OVAL_INDICES[i]];
        const x = lm.x * width;
        const y = lm.y * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw eyes
      const drawEyePath = (indices: number[]) => {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < indices.length; i++) {
          const lm = landmarks[indices[i]];
          const x = lm.x * width;
          const y = lm.y * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };

      drawEyePath(LEFT_EYE_INDICES);
      drawEyePath(RIGHT_EYE_INDICES);

      // Draw key tracking points
      const keyPoints = [133, 362, 1, 33, 263]; // inner eyes, nose, outer eyes
      ctx.fillStyle = 'rgba(255, 100, 100, 0.8)';
      for (const idx of keyPoints) {
        const lm = landmarks[idx];
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
    []
  );

  const handleResults = useCallback(
    (faceLandmarks: Array<{ x: number; y: number; z: number }>[]) => {
      if (faceLandmarks.length > 0 && faceLandmarks[0].length >= 468) {
        const landmarks = faceLandmarks[0];
        const pose = trackerRef.current.update(landmarks);
        onHeadPoseUpdate(pose);

        // Draw landmarks on canvas
        if (showLandmarks && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            drawLandmarks(ctx, landmarks, canvasRef.current.width, canvasRef.current.height);
          }
        }
      } else {
        onHeadPoseUpdate(null);
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          }
        }
      }
    },
    [onHeadPoseUpdate, showLandmarks, drawLandmarks]
  );

  const handleStream = useCallback(
    (_stream: MediaStream, video: HTMLVideoElement) => {
      videoRef.current = video;
      setHasCamera(true);
    },
    []
  );

  // Start detection when both camera and landmarker are ready
  useEffect(() => {
    if (hasCamera && videoRef.current && !isLoading && !error) {
      startDetection(videoRef.current, handleResults);
    }

    return () => {
      stopDetection();
    };
  }, [hasCamera, isLoading, error, startDetection, stopDetection, handleResults]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <CameraPermission onStream={handleStream} />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <p className="text-xs text-gray-300">Loading face detection...</p>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/60">
          <p className="text-xs text-red-300 p-2 text-center">{error}</p>
        </div>
      )}
    </div>
  );
};

export default FaceMeshView;
