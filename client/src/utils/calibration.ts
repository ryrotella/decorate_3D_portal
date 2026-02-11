import type { CalibrationData } from '../types';

const STORAGE_KEY = 'johnnychung3d_calibration';
const CALIBRATED_KEY = 'johnnychung3d_calibrated';

const DEFAULT_CALIBRATION: CalibrationData = {
  screenWidthCm: 34,
  screenHeightCm: 19,
  viewingDistanceCm: 60,
  pixelsPerCm: 0,
  referenceInterOcularPx: 0.1,
  realInterOcularCm: 6.3,
};

class CalibrationManager {
  private data: CalibrationData;

  constructor() {
    this.data = this.load();
    if (this.data.pixelsPerCm === 0) {
      this.data.pixelsPerCm = this.computePixelsPerCm();
    }
  }

  private load(): CalibrationData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_CALIBRATION, ...JSON.parse(raw) };
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_CALIBRATION };
  }

  save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    localStorage.setItem(CALIBRATED_KEY, 'true');
  }

  isCalibrated(): boolean {
    return localStorage.getItem(CALIBRATED_KEY) === 'true';
  }

  getCalibration(): CalibrationData {
    return { ...this.data };
  }

  setCalibration(partial: Partial<CalibrationData>): CalibrationData {
    Object.assign(this.data, partial);
    if (partial.screenWidthCm || partial.screenHeightCm) {
      this.data.pixelsPerCm = this.computePixelsPerCm();
    }
    this.save();
    return this.getCalibration();
  }

  reset(): CalibrationData {
    this.data = { ...DEFAULT_CALIBRATION };
    this.data.pixelsPerCm = this.computePixelsPerCm();
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CALIBRATED_KEY);
    return this.getCalibration();
  }

  private computePixelsPerCm(): number {
    const screenWidthPx = window.screen.width * (window.devicePixelRatio || 1);
    return screenWidthPx / this.data.screenWidthCm;
  }

  /** Convert pixels to cm using current calibration */
  getCmPerPixel(): number {
    return this.data.screenWidthCm / (window.screen.width * (window.devicePixelRatio || 1));
  }

  /** Estimate viewing distance from measured face width in normalized coordinates */
  estimateViewingDistanceFromFaceWidth(faceWidthNorm: number, videoWidthPx: number): number {
    // Average human inter-ocular distance is ~6.3cm
    // faceWidthNorm * videoWidthPx gives us pixel width of the inter-ocular distance
    const faceWidthPx = faceWidthNorm * videoWidthPx;
    // Using pinhole camera model: distance = (realSize * focalLength) / pixelSize
    // Simplified: we use a reference ratio
    const referenceFaceWidthPx = 100; // rough baseline at ~60cm
    const referenceDistanceCm = 60;
    return (referenceDistanceCm * referenceFaceWidthPx) / faceWidthPx;
  }

  /** Auto-detect screen size from devicePixelRatio and screen dimensions */
  autoDetectScreenSize(): { widthCm: number; heightCm: number } {
    // This is approximate — CSS pixels don't map perfectly to physical size
    // Use 96 DPI as standard baseline
    const widthInches = window.screen.width / 96; // CSS pixels at 96dpi baseline
    const heightInches = window.screen.height / 96;
    return {
      widthCm: widthInches * 2.54,
      heightCm: heightInches * 2.54,
    };
  }
}

export const calibrationManager = new CalibrationManager();
