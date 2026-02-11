export interface HeadPose {
  /** Normalized X position (0-1, left to right in camera frame) */
  x: number;
  /** Normalized Y position (0-1, top to bottom in camera frame) */
  y: number;
  /** Estimated depth/distance based on inter-ocular distance */
  z: number;
  /** Raw inter-ocular distance in pixels */
  interOcularPx: number;
  /** Timestamp of detection */
  timestamp: number;
}

export interface SmoothedHeadPose extends HeadPose {
  /** World-space X position in cm */
  worldX: number;
  /** World-space Y position in cm */
  worldY: number;
  /** World-space Z position (distance from screen) in cm */
  worldZ: number;
}

export interface CalibrationData {
  /** Screen width in cm */
  screenWidthCm: number;
  /** Screen height in cm */
  screenHeightCm: number;
  /** Estimated viewing distance in cm */
  viewingDistanceCm: number;
  /** Pixels per cm (derived from screen resolution and physical size) */
  pixelsPerCm: number;
  /** Average inter-ocular distance in pixels at calibration distance */
  referenceInterOcularPx: number;
  /** Average real inter-ocular distance in cm (human average ~6.3cm) */
  realInterOcularCm: number;
}

export interface VideoSource {
  id: string;
  name: string;
  type: 'syphon' | 'spout' | 'webcam' | 'video' | 'youtube';
  /** Whether currently connected and streaming */
  connected: boolean;
  /** Last frame timestamp */
  lastFrameTime: number;
  /** Frame dimensions */
  width: number;
  height: number;
  /** URL for video/youtube sources */
  url?: string;
}

export interface ModelEntry {
  id: string;
  label: string;
  fileName: string;
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
  scale: number;
  visible: boolean;
  animationPlaying: boolean;
  activeAnimationIndex: number;
  animationCount: number;
}

export type RoomSurface = 'back' | 'left' | 'right' | 'ceiling' | 'floor' | 'free';

export interface DepthPlane {
  id: string;
  label: string;
  /** Which room surface this plane maps to. 'free' uses zDepth for a screen-parallel plane. */
  surface: RoomSurface;
  /** Z-depth in world units (only used when surface='free', negative = behind screen) */
  zDepth: number;
  /** Opacity 0-1 */
  opacity: number;
  /** Whether visible in scene */
  visible: boolean;
  /** Assigned video source ID, or null */
  sourceId: string | null;
  /** Position offset from default layout (world units) */
  posX: number;
  posY: number;
  posZ: number;
  /** Rotation in degrees */
  rotX: number;
  rotY: number;
  rotZ: number;
  /** Scale multipliers */
  scaleX: number;
  scaleY: number;
  /** Flip texture horizontally / vertically */
  flipH: boolean;
  flipV: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  trackingFps: number;
  trackingLatencyMs: number;
  renderTimeMs: number;
  streamLatencyMs: number;
  frameDecodeMs: number;
}

export interface PerspectiveSettings {
  /** Near clipping plane */
  nearPlane: number;
  /** Far clipping plane */
  farPlane: number;
  /** Movement scale multiplier */
  movementScale: number;
  /** EMA smoothing factor (0-1, lower = smoother) */
  smoothingFactor: number;
  /** Per-axis strength multipliers */
  axisStrength: { x: number; y: number; z: number };
}

export interface ThreeViewHandle {
  updateHeadPose(pose: SmoothedHeadPose): void;
  updatePlaneTexture(planeId: string, texture: THREE.Texture): void;
  clearPlaneTexture(planeId: string): void;
  setPlaneConfig(planeId: string, config: Partial<DepthPlane>): void;
  addPlane(plane: DepthPlane): void;
  removePlane(planeId: string): void;
  setShowLabels(show: boolean): void;
  getRenderer(): THREE.WebGLRenderer | null;
  addModel(entry: ModelEntry, buffer: ArrayBuffer): Promise<ModelEntry | undefined>;
  removeModel(modelId: string): void;
  setModelConfig(modelId: string, config: Partial<ModelEntry>): void;
  getPlaneScreenRect(planeId: string): { x: number; y: number; w: number; h: number } | null;
}

import type * as THREE from 'three';
