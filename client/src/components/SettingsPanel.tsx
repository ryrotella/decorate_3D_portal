import { useState, useCallback, useEffect } from 'react';
import { calibrationManager } from '../utils/calibration';
import type { PerspectiveSettings, CalibrationData } from '../types';
import type { MonitorProfile } from '../hooks/useMonitorDetection';

interface SettingsPanelProps {
  onPerspectiveChange: (settings: Partial<PerspectiveSettings>) => void;
  onSceneChange: (config: Record<string, unknown>) => void;
  onOpenCalibration: () => void;
  perspectiveSettings: PerspectiveSettings;
  monitorProfiles?: MonitorProfile[];
  currentMonitorId?: string;
  onSaveMonitorProfile?: (profile: Partial<MonitorProfile>) => void;
  onDeleteMonitorProfile?: (id: string) => void;
}

const STORAGE_KEY = 'johnnychung3d_settings';

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  onPerspectiveChange,
  onSceneChange,
  onOpenCalibration,
  perspectiveSettings,
  monitorProfiles = [],
  currentMonitorId = '',
  onSaveMonitorProfile,
  onDeleteMonitorProfile,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [cal, setCal] = useState<CalibrationData>(calibrationManager.getCalibration());
  const [roomDepth, setRoomDepth] = useState(0.5);
  const [showRoom, setShowRoom] = useState(true);
  const [serverUrl, setServerUrl] = useState(`ws://${window.location.hostname}:8765`);

  // Load persisted settings
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.roomDepth !== undefined) setRoomDepth(saved.roomDepth);
        if (saved.showRoom !== undefined) setShowRoom(saved.showRoom);
        if (saved.serverUrl) setServerUrl(saved.serverUrl);
      }
    } catch {
      // ignore
    }
  }, []);

  // Persist settings
  const saveSettings = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomDepth, showRoom, serverUrl }));
  }, [roomDepth, showRoom, serverUrl]);

  useEffect(() => {
    saveSettings();
  }, [saveSettings]);

  const handleExport = useCallback(() => {
    const data = {
      calibration: calibrationManager.getCalibration(),
      perspective: perspectiveSettings,
      scene: { roomDepth, showRoom },
      serverUrl,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'johnnychung3d-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [perspectiveSettings, roomDepth, showRoom, serverUrl]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.calibration) {
          calibrationManager.setCalibration(data.calibration);
          setCal(calibrationManager.getCalibration());
        }
        if (data.perspective) {
          onPerspectiveChange(data.perspective);
        }
        if (data.scene) {
          if (data.scene.roomDepth !== undefined) {
            setRoomDepth(data.scene.roomDepth);
            onSceneChange({ roomDepth: data.scene.roomDepth });
          }
          if (data.scene.showRoom !== undefined) {
            setShowRoom(data.scene.showRoom);
            onSceneChange({ showRoom: data.scene.showRoom });
          }
        }
      } catch {
        // invalid file
      }
    };
    input.click();
  }, [onPerspectiveChange, onSceneChange]);

  const handleReset = useCallback(() => {
    calibrationManager.reset();
    setCal(calibrationManager.getCalibration());
    onPerspectiveChange({
      nearPlane: 0.01,
      farPlane: 10,
      movementScale: 1.5,
      smoothingFactor: 0.3,
      axisStrength: { x: 1, y: 1, z: 1 },
    });
    setRoomDepth(0.5);
    setShowRoom(true);
    onSceneChange({ roomDepth: 0.5, showRoom: true });
    localStorage.removeItem(STORAGE_KEY);
  }, [onPerspectiveChange, onSceneChange]);

  // Toggle with 'S' key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        if (e.target === document.body || e.target === null) {
          setCollapsed((c) => !c);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (collapsed) return null;

  return (
    <div className="absolute top-0 right-0 z-40 w-80 h-full bg-gray-900/95 backdrop-blur-sm border-l border-gray-700 overflow-y-auto">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white">Settings (S)</h2>
          <button
            onClick={() => setCollapsed(true)}
            className="text-gray-400 hover:text-white text-xs"
          >
            Close
          </button>
        </div>

        {/* Calibration */}
        <section className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Calibration</h3>
          <div className="space-y-1 text-xs text-gray-400">
            <p>Screen: {cal.screenWidthCm.toFixed(1)} x {cal.screenHeightCm.toFixed(1)} cm</p>
            <p>Distance: {cal.viewingDistanceCm.toFixed(1)} cm</p>
          </div>
          <button
            onClick={onOpenCalibration}
            className="mt-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
          >
            Recalibrate
          </button>
        </section>

        {/* Perspective Controls */}
        <section className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Perspective</h3>

          <SliderRow
            label="Movement Scale"
            value={perspectiveSettings.movementScale}
            min={0.1}
            max={5}
            step={0.1}
            onChange={(v) => onPerspectiveChange({ movementScale: v })}
          />
          <SliderRow
            label="Smoothing"
            value={perspectiveSettings.smoothingFactor}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(v) => onPerspectiveChange({ smoothingFactor: v })}
          />
          <SliderRow
            label="Near Plane"
            value={perspectiveSettings.nearPlane}
            min={0.001}
            max={0.5}
            step={0.001}
            onChange={(v) => onPerspectiveChange({ nearPlane: v })}
          />
          <SliderRow
            label="Far Plane"
            value={perspectiveSettings.farPlane}
            min={1}
            max={50}
            step={0.5}
            onChange={(v) => onPerspectiveChange({ farPlane: v })}
          />

          <div className="text-[10px] text-gray-500 mt-2 mb-1">Axis Strengths</div>
          <SliderRow
            label="X"
            value={perspectiveSettings.axisStrength.x}
            min={0}
            max={3}
            step={0.1}
            onChange={(v) =>
              onPerspectiveChange({
                axisStrength: { ...perspectiveSettings.axisStrength, x: v },
              })
            }
          />
          <SliderRow
            label="Y"
            value={perspectiveSettings.axisStrength.y}
            min={0}
            max={3}
            step={0.1}
            onChange={(v) =>
              onPerspectiveChange({
                axisStrength: { ...perspectiveSettings.axisStrength, y: v },
              })
            }
          />
          <SliderRow
            label="Z"
            value={perspectiveSettings.axisStrength.z}
            min={0}
            max={3}
            step={0.1}
            onChange={(v) =>
              onPerspectiveChange({
                axisStrength: { ...perspectiveSettings.axisStrength, z: v },
              })
            }
          />
        </section>

        {/* Scene Controls */}
        <section className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Scene</h3>
          <SliderRow
            label="Room Depth"
            value={roomDepth}
            min={0.1}
            max={2}
            step={0.05}
            onChange={(v) => {
              setRoomDepth(v);
              onSceneChange({ roomDepth: v });
            }}
          />
          <div className="flex items-center gap-2 mt-1">
            <input
              type="checkbox"
              id="showRoom"
              checked={showRoom}
              onChange={(e) => {
                setShowRoom(e.target.checked);
                onSceneChange({ showRoom: e.target.checked });
              }}
              className="accent-blue-500"
            />
            <label htmlFor="showRoom" className="text-xs text-gray-400">
              Show wireframe room
            </label>
          </div>
        </section>

        {/* Streaming */}
        <section className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Streaming</h3>
          <div>
            <label className="text-[10px] text-gray-500 block mb-1">Server URL</label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
            />
          </div>
        </section>

        {/* Monitors */}
        <section className="mb-4">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Monitors</h3>
          <div className="text-[10px] text-gray-500 mb-2">
            Current: {currentMonitorId || 'unknown'}
          </div>
          {monitorProfiles.length > 0 ? (
            <div className="space-y-1">
              {monitorProfiles.map((profile) => (
                <div
                  key={profile.id}
                  className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${
                    profile.id === currentMonitorId ? 'bg-blue-900/30 text-blue-300' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  <span className="flex-1 truncate">{profile.label}</span>
                  <span className="text-[10px] text-gray-600">
                    {profile.screenWidth}x{profile.screenHeight}
                  </span>
                  {onDeleteMonitorProfile && (
                    <button
                      onClick={() => onDeleteMonitorProfile(profile.id)}
                      className="text-gray-600 hover:text-red-400 text-[10px]"
                    >
                      X
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-600 italic">No monitor profiles saved</p>
          )}
          {onSaveMonitorProfile && (
            <button
              onClick={() => onSaveMonitorProfile({})}
              className="mt-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
            >
              Save Current Monitor
            </button>
          )}
        </section>

        {/* Import/Export/Reset */}
        <section className="border-t border-gray-700 pt-3">
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="flex-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
            >
              Export
            </button>
            <button
              onClick={handleImport}
              className="flex-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
            >
              Import
            </button>
            <button
              onClick={handleReset}
              className="flex-1 px-2 py-1.5 bg-red-900/50 hover:bg-red-900 text-red-300 rounded text-xs transition-colors"
            >
              Reset
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};

/** Reusable slider row */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-0.5">
      <label className="text-[10px] text-gray-500 w-20 truncate">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-blue-500"
      />
      <span className="text-[10px] text-gray-500 w-10 text-right">
        {value.toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : 1)}
      </span>
    </div>
  );
}

export default SettingsPanel;
