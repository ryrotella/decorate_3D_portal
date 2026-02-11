import { useState, useEffect, useRef, useCallback } from 'react';
import { calibrationManager } from '../utils/calibration';

export interface MonitorProfile {
  id: string;
  label: string;
  screenWidthCm: number;
  screenHeightCm: number;
  viewingDistanceCm: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
}

const STORAGE_KEY = 'johnnychung3d_monitors';

function getMonitorId(): string {
  // Use screen resolution + position as a rough monitor identifier
  const { width, height, availWidth, availHeight } = window.screen;
  return `${width}x${height}-${availWidth}x${availHeight}-${window.screenX > window.screen.width ? 'ext' : 'pri'}`;
}

function loadProfiles(): Map<string, MonitorProfile> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr: MonitorProfile[] = JSON.parse(raw);
      return new Map(arr.map((p) => [p.id, p]));
    }
  } catch {
    // ignore
  }
  return new Map();
}

function saveProfiles(profiles: Map<string, MonitorProfile>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(profiles.values())));
}

export interface UseMonitorDetectionReturn {
  currentMonitorId: string;
  profiles: MonitorProfile[];
  currentProfile: MonitorProfile | null;
  /** Save a profile for the current monitor */
  saveCurrentProfile: (profile: Partial<MonitorProfile>) => void;
  /** Delete a monitor profile */
  deleteProfile: (id: string) => void;
  /** Whether the monitor has changed since last check */
  monitorChanged: boolean;
}

export function useMonitorDetection(pollIntervalMs = 1000): UseMonitorDetectionReturn {
  const [currentMonitorId, setCurrentMonitorId] = useState(getMonitorId);
  const [profiles, setProfiles] = useState<Map<string, MonitorProfile>>(loadProfiles);
  const [monitorChanged, setMonitorChanged] = useState(false);
  const prevMonitorIdRef = useRef(currentMonitorId);

  // Poll for monitor changes (window moved to different screen)
  useEffect(() => {
    const interval = setInterval(() => {
      const newId = getMonitorId();
      if (newId !== prevMonitorIdRef.current) {
        prevMonitorIdRef.current = newId;
        setCurrentMonitorId(newId);
        setMonitorChanged(true);

        // Auto-apply profile if one exists for this monitor
        const profile = profiles.get(newId);
        if (profile) {
          calibrationManager.setCalibration({
            screenWidthCm: profile.screenWidthCm,
            screenHeightCm: profile.screenHeightCm,
            viewingDistanceCm: profile.viewingDistanceCm,
          });
        }

        // Reset the "changed" flag after a brief delay
        setTimeout(() => setMonitorChanged(false), 3000);
      }
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [pollIntervalMs, profiles]);

  const saveCurrentProfile = useCallback(
    (partial: Partial<MonitorProfile>) => {
      const id = currentMonitorId;
      const existing = profiles.get(id);
      const cal = calibrationManager.getCalibration();

      const profile: MonitorProfile = {
        id,
        label: existing?.label ?? `Monitor ${profiles.size + 1}`,
        screenWidthCm: cal.screenWidthCm,
        screenHeightCm: cal.screenHeightCm,
        viewingDistanceCm: cal.viewingDistanceCm,
        screenX: window.screenX,
        screenY: window.screenY,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        ...existing,
        ...partial,
      };

      const newProfiles = new Map(profiles);
      newProfiles.set(id, profile);
      setProfiles(newProfiles);
      saveProfiles(newProfiles);
    },
    [currentMonitorId, profiles]
  );

  const deleteProfile = useCallback(
    (id: string) => {
      const newProfiles = new Map(profiles);
      newProfiles.delete(id);
      setProfiles(newProfiles);
      saveProfiles(newProfiles);
    },
    [profiles]
  );

  const currentProfile = profiles.get(currentMonitorId) ?? null;

  return {
    currentMonitorId,
    profiles: Array.from(profiles.values()),
    currentProfile,
    saveCurrentProfile,
    deleteProfile,
    monitorChanged,
  };
}
