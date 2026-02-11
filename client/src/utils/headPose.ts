import type { HeadPose, SmoothedHeadPose } from '../types';
import { calibrationManager } from './calibration';

/** Landmark indices for key face points */
const LANDMARKS = {
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  NOSE_TIP: 1,
} as const;

export interface HeadPoseConfig {
  /** EMA smoothing factor (0-1, lower = smoother, more lag) */
  smoothingFactor: number;
  /** Clamp ranges for normalized x, y */
  clampX: [number, number];
  clampY: [number, number];
  /** Clamp range for depth proxy */
  clampZ: [number, number];
}

const DEFAULT_CONFIG: HeadPoseConfig = {
  smoothingFactor: 0.3,
  clampX: [0, 1],
  clampY: [0, 1],
  clampZ: [0.3, 3.0],
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function ema(current: number, previous: number, alpha: number): number {
  return alpha * current + (1 - alpha) * previous;
}

export class HeadPoseTracker {
  private config: HeadPoseConfig;
  private previousPose: HeadPose | null = null;

  constructor(smoothingOrConfig?: number | Partial<HeadPoseConfig>) {
    if (typeof smoothingOrConfig === 'number') {
      this.config = { ...DEFAULT_CONFIG, smoothingFactor: smoothingOrConfig };
    } else {
      this.config = { ...DEFAULT_CONFIG, ...smoothingOrConfig };
    }
  }

  setSmoothingFactor(factor: number): void {
    this.config.smoothingFactor = clamp(factor, 0.01, 1);
  }

  setConfig(partial: Partial<HeadPoseConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Extract head pose from MediaPipe FaceLandmarker results.
   * landmarks: array of {x, y, z} normalized coordinates from a single face.
   */
  update(landmarks: Array<{ x: number; y: number; z: number }>): SmoothedHeadPose | null {
    if (!landmarks || landmarks.length < 468) return null;

    const leftEyeInner = landmarks[LANDMARKS.LEFT_EYE_INNER];
    const rightEyeInner = landmarks[LANDMARKS.RIGHT_EYE_INNER];
    const noseTip = landmarks[LANDMARKS.NOSE_TIP];
    const leftEyeOuter = landmarks[LANDMARKS.LEFT_EYE_OUTER];
    const rightEyeOuter = landmarks[LANDMARKS.RIGHT_EYE_OUTER];

    // Face center (average of eye inner corners and nose)
    const rawX = (leftEyeInner.x + rightEyeInner.x + noseTip.x) / 3;
    const rawY = (leftEyeInner.y + rightEyeInner.y + noseTip.y) / 3;

    // Inter-ocular distance (inner corners) as depth proxy
    const interOcularPx = Math.sqrt(
      (rightEyeInner.x - leftEyeInner.x) ** 2 +
      (rightEyeInner.y - leftEyeInner.y) ** 2
    );

    // Wider eye distance for secondary depth signal
    const eyeWidth = Math.sqrt(
      (rightEyeOuter.x - leftEyeOuter.x) ** 2 +
      (rightEyeOuter.y - leftEyeOuter.y) ** 2
    );

    // Depth proxy: combine inter-ocular and outer eye width
    const rawZ = (interOcularPx + eyeWidth * 0.5) / 0.15;

    // Clamp raw values
    const x = clamp(rawX, this.config.clampX[0], this.config.clampX[1]);
    const y = clamp(rawY, this.config.clampY[0], this.config.clampY[1]);
    const z = clamp(rawZ, this.config.clampZ[0], this.config.clampZ[1]);

    const now = performance.now();

    const rawPose: HeadPose = {
      x,
      y,
      z,
      interOcularPx,
      timestamp: now,
    };

    // Apply EMA smoothing
    const alpha = this.config.smoothingFactor;
    let smoothed: HeadPose;

    if (this.previousPose) {
      smoothed = {
        x: ema(rawPose.x, this.previousPose.x, alpha),
        y: ema(rawPose.y, this.previousPose.y, alpha),
        z: ema(rawPose.z, this.previousPose.z, alpha),
        interOcularPx: ema(rawPose.interOcularPx, this.previousPose.interOcularPx, alpha),
        timestamp: now,
      };
    } else {
      smoothed = { ...rawPose };
    }

    this.previousPose = smoothed;

    // Convert to world-space coordinates
    const cal = calibrationManager.getCalibration();
    const world = headPoseToWorldPosition(smoothed, cal.screenWidthCm, cal.screenHeightCm, cal.viewingDistanceCm);

    return {
      ...smoothed,
      worldX: world.x,
      worldY: world.y,
      worldZ: world.z,
    };
  }

  reset(): void {
    this.previousPose = null;
  }
}

/**
 * Convert normalized head pose to world-space coordinates (in cm).
 * Origin is at screen center. +X is right, +Y is up, +Z is toward viewer.
 */
export function headPoseToWorldPosition(
  pose: HeadPose,
  screenWidthCm: number,
  screenHeightCm: number,
  baseDistanceCm: number
): { x: number; y: number; z: number } {
  // Normalized (0-1) -> centered (-0.5 to 0.5) -> cm
  // Note: camera image is mirrored, so we invert X
  const x = -(pose.x - 0.5) * screenWidthCm;
  const y = -(pose.y - 0.5) * screenHeightCm;

  // Z: depth proxy maps to viewing distance
  // pose.z ~1.0 at reference distance, larger = closer, smaller = farther
  const z = baseDistanceCm / pose.z;

  return { x, y, z };
}
