import * as THREE from 'three';
import type { SmoothedHeadPose, PerspectiveSettings } from '../types';
import { calibrationManager } from './calibration';

const DEFAULT_SETTINGS: PerspectiveSettings = {
  nearPlane: 0.01,
  farPlane: 10,
  movementScale: 1.5,
  smoothingFactor: 0.3,
  axisStrength: { x: 1, y: 1, z: 1 },
};

/**
 * Off-axis perspective camera that creates the "window into a box" illusion.
 *
 * Uses asymmetric frustum (makePerspective) so the projection shifts
 * based on the viewer's head position, as if looking through a real window.
 */
export class OffAxisCamera {
  public camera: THREE.PerspectiveCamera;
  public settings: PerspectiveSettings;

  // Screen dimensions in Three.js world units (meters)
  private screenWidth: number;
  private screenHeight: number;

  // Current head position in world units
  private headX = 0;
  private headY = 0;
  private headZ = 0.6; // default ~60cm

  constructor(aspect: number, settings?: Partial<PerspectiveSettings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };

    this.camera = new THREE.PerspectiveCamera(
      45,
      aspect,
      this.settings.nearPlane,
      this.settings.farPlane
    );

    // Convert screen physical size to world units (cm -> meters for Three.js)
    const cal = calibrationManager.getCalibration();
    this.screenWidth = cal.screenWidthCm / 100;
    this.screenHeight = cal.screenHeightCm / 100;

    this.camera.position.set(0, 0, cal.viewingDistanceCm / 100);
    this.camera.lookAt(0, 0, 0);
  }

  /** Update screen dimensions (e.g., after recalibration) */
  updateScreenDimensions(widthCm: number, heightCm: number): void {
    this.screenWidth = widthCm / 100;
    this.screenHeight = heightCm / 100;
  }

  /** Update settings */
  updateSettings(partial: Partial<PerspectiveSettings>): void {
    Object.assign(this.settings, partial);
    this.camera.near = this.settings.nearPlane;
    this.camera.far = this.settings.farPlane;
  }

  /**
   * Update projection matrix from smoothed head pose.
   * This is the core of the off-axis illusion.
   */
  updateFromHeadPose(pose: SmoothedHeadPose): void {
    const { movementScale, axisStrength } = this.settings;

    // Convert world position from cm to meters, apply scale and axis strength
    this.headX = (pose.worldX / 100) * movementScale * axisStrength.x;
    this.headY = (pose.worldY / 100) * movementScale * axisStrength.y;
    this.headZ = Math.max(0.1, (pose.worldZ / 100) * axisStrength.z);

    this.updateProjectionMatrix();
  }

  /** Manually set head position in meters (for testing/debug) */
  setHeadPosition(x: number, y: number, z: number): void {
    this.headX = x;
    this.headY = y;
    this.headZ = Math.max(0.1, z);
    this.updateProjectionMatrix();
  }

  /**
   * Compute and apply the asymmetric frustum.
   *
   * The key insight: the frustum boundaries shift based on the viewer's
   * offset from the screen center. This creates natural parallax as if
   * the screen were a real window.
   */
  private updateProjectionMatrix(): void {
    const halfW = this.screenWidth / 2;
    const halfH = this.screenHeight / 2;
    const near = this.settings.nearPlane;
    const far = this.settings.farPlane;
    const dist = this.headZ;

    // Asymmetric frustum boundaries at the near plane
    // Shift by head offset, scaled by near/dist ratio
    const nearOverDist = near / dist;

    const left = (-halfW - this.headX) * nearOverDist;
    const right = (halfW - this.headX) * nearOverDist;
    const bottom = (-halfH - this.headY) * nearOverDist;
    const top = (halfH - this.headY) * nearOverDist;

    // Apply asymmetric frustum
    this.camera.projectionMatrix.makePerspective(left, right, bottom, top, near, far);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    // Move camera to head position (the camera IS the viewer's eye)
    this.camera.position.set(this.headX, this.headY, dist);
    this.camera.lookAt(this.headX, this.headY, 0);
  }

  /** Handle window resize */
  handleResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.updateProjectionMatrix();
  }

  /** Get current debug parameters */
  getDebugParams(): {
    headX: number;
    headY: number;
    headZ: number;
    screenWidth: number;
    screenHeight: number;
    settings: PerspectiveSettings;
  } {
    return {
      headX: this.headX,
      headY: this.headY,
      headZ: this.headZ,
      screenWidth: this.screenWidth,
      screenHeight: this.screenHeight,
      settings: { ...this.settings },
    };
  }
}
