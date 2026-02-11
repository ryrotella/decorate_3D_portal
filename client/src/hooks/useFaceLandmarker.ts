import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

export interface UseFaceLandmarkerOptions {
  /** Max number of faces to detect */
  maxFaces?: number;
  /** Minimum detection confidence */
  minDetectionConfidence?: number;
  /** Minimum tracking confidence */
  minTrackingConfidence?: number;
}

export interface UseFaceLandmarkerReturn {
  landmarker: FaceLandmarker | null;
  isLoading: boolean;
  error: string | null;
  /** Start detection loop on a video element */
  startDetection: (
    video: HTMLVideoElement,
    onResults: (landmarks: Array<{ x: number; y: number; z: number }>[]) => void
  ) => void;
  /** Stop detection loop */
  stopDetection: () => void;
}

export function useFaceLandmarker(
  options?: UseFaceLandmarkerOptions
): UseFaceLandmarkerReturn {
  const {
    maxFaces = 1,
    minDetectionConfidence = 0.5,
    minTrackingConfidence = 0.5,
  } = options ?? {};

  const [landmarker, setLandmarker] = useState<FaceLandmarker | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rafIdRef = useRef<number | null>(null);
  const lastTimestampRef = useRef<number>(-1);

  // Initialize FaceLandmarker from CDN
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        setIsLoading(true);
        setError(null);

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const fl = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: maxFaces,
          minFaceDetectionConfidence: minDetectionConfidence,
          minFacePresenceConfidence: minDetectionConfidence,
          minTrackingConfidence: minTrackingConfidence,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });

        if (!cancelled) {
          setLandmarker(fl);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to init FaceLandmarker:', err);
          setError(err instanceof Error ? err.message : 'Failed to load face detection');
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [maxFaces, minDetectionConfidence, minTrackingConfidence]);

  const startDetection = useCallback(
    (
      video: HTMLVideoElement,
      onResults: (landmarks: Array<{ x: number; y: number; z: number }>[]) => void
    ) => {
      if (!landmarker) return;

      const detect = () => {
        if (video.readyState >= 2) {
          const now = performance.now();
          // MediaPipe requires strictly increasing timestamps
          if (now > lastTimestampRef.current) {
            try {
              const result = landmarker.detectForVideo(video, now);
              onResults(result.faceLandmarks);
            } catch {
              // Detection may fail on some frames, that's ok
            }
            lastTimestampRef.current = now;
          }
        }
        rafIdRef.current = requestAnimationFrame(detect);
      };

      detect();
    },
    [landmarker]
  );

  const stopDetection = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    lastTimestampRef.current = -1;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      if (landmarker) {
        landmarker.close();
      }
    };
  }, [landmarker]);

  return { landmarker, isLoading, error, startDetection, stopDetection };
}
