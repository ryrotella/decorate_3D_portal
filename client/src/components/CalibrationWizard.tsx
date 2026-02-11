import { useState, useCallback, useEffect } from 'react';
import { calibrationManager } from '../utils/calibration';
import type { CalibrationData } from '../types';

type Step = 'intro' | 'screen-size' | 'viewing-distance' | 'test';

interface CalibrationWizardProps {
  onComplete: (calibration: CalibrationData) => void;
  onClose: () => void;
}

/** Common screen presets: [label, widthCm, heightCm] */
const SCREEN_PRESETS: [string, number, number][] = [
  ['13" MacBook', 28.7, 17.9],
  ['14" MacBook Pro', 31.3, 21.5],
  ['15" MacBook Air', 33.0, 20.7],
  ['16" MacBook Pro', 35.5, 22.3],
  ['24" iMac', 52.0, 30.3],
  ['27" Monitor', 59.8, 33.6],
  ['32" Monitor', 70.8, 39.8],
];

const CalibrationWizard: React.FC<CalibrationWizardProps> = ({ onComplete, onClose }) => {
  const [step, setStep] = useState<Step>('intro');
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  const [screenWidthCm, setScreenWidthCm] = useState(34);
  const [screenHeightCm, setScreenHeightCm] = useState(19);
  const [viewingDistanceCm, setViewingDistanceCm] = useState(60);
  const [autoEstimate, setAutoEstimate] = useState<number | null>(null);

  // Load existing calibration
  useEffect(() => {
    const cal = calibrationManager.getCalibration();
    setScreenWidthCm(cal.screenWidthCm);
    setScreenHeightCm(cal.screenHeightCm);
    setViewingDistanceCm(cal.viewingDistanceCm);
  }, []);

  // Auto-estimate screen size
  useEffect(() => {
    const detected = calibrationManager.autoDetectScreenSize();
    // Only use if reasonable
    if (detected.widthCm > 10 && detected.widthCm < 120) {
      setAutoEstimate(detected.widthCm);
    }
  }, []);

  const handlePreset = useCallback((widthCm: number, heightCm: number) => {
    setScreenWidthCm(widthCm);
    setScreenHeightCm(heightCm);
  }, []);

  const toDisplay = useCallback((cm: number) => {
    return unit === 'cm' ? cm : cm / 2.54;
  }, [unit]);

  const fromDisplay = useCallback((val: number) => {
    return unit === 'cm' ? val : val * 2.54;
  }, [unit]);

  const handleComplete = useCallback(() => {
    const cal = calibrationManager.setCalibration({
      screenWidthCm,
      screenHeightCm,
      viewingDistanceCm,
    });
    onComplete(cal);
  }, [screenWidthCm, screenHeightCm, viewingDistanceCm, onComplete]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 max-w-md w-full p-6 rounded-lg border border-gray-700 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-sm"
        >
          X
        </button>

        {/* Step: Intro */}
        {step === 'intro' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">Calibration Setup</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              For the best 3D illusion, we need to know your screen size and
              how far you sit from it. This only takes a moment.
            </p>
            <button
              onClick={() => setStep('screen-size')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm transition-colors"
            >
              Get Started
            </button>
            <button
              onClick={() => {
                handleComplete();
                onClose();
              }}
              className="w-full text-gray-500 hover:text-gray-300 py-2 text-xs transition-colors"
            >
              Skip (use defaults)
            </button>
          </div>
        )}

        {/* Step: Screen Size */}
        {step === 'screen-size' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">Screen Size</h2>

            {/* Unit toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => setUnit('cm')}
                className={`px-3 py-1 rounded text-xs ${unit === 'cm' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                cm
              </button>
              <button
                onClick={() => setUnit('in')}
                className={`px-3 py-1 rounded text-xs ${unit === 'in' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                inches
              </button>
            </div>

            {/* Presets */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Quick presets:</p>
              <div className="flex flex-wrap gap-1">
                {SCREEN_PRESETS.map(([label, w, h]) => (
                  <button
                    key={label}
                    onClick={() => handlePreset(w, h)}
                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-[10px] transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {autoEstimate && (
              <p className="text-xs text-gray-500">
                Auto-detected: ~{autoEstimate.toFixed(0)}cm wide
              </p>
            )}

            {/* Width */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Width ({unit})
              </label>
              <input
                type="number"
                value={parseFloat(toDisplay(screenWidthCm).toFixed(1))}
                onChange={(e) => setScreenWidthCm(fromDisplay(parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                step="0.1"
              />
            </div>

            {/* Height */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Height ({unit})
              </label>
              <input
                type="number"
                value={parseFloat(toDisplay(screenHeightCm).toFixed(1))}
                onChange={(e) => setScreenHeightCm(fromDisplay(parseFloat(e.target.value) || 0))}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
                step="0.1"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep('intro')}
                className="text-gray-400 hover:text-white py-2 px-4 text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep('viewing-distance')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Viewing Distance */}
        {step === 'viewing-distance' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">Viewing Distance</h2>
            <p className="text-sm text-gray-400">
              How far do you typically sit from your screen?
            </p>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Distance ({unit})
              </label>
              <input
                type="range"
                min={unit === 'cm' ? 30 : 12}
                max={unit === 'cm' ? 120 : 48}
                step="1"
                value={toDisplay(viewingDistanceCm)}
                onChange={(e) => setViewingDistanceCm(fromDisplay(parseFloat(e.target.value)))}
                className="w-full accent-blue-500"
              />
              <div className="text-center text-white text-lg mt-1">
                {toDisplay(viewingDistanceCm).toFixed(0)} {unit}
              </div>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>Typical ranges:</p>
              <p>Laptop: 45-60 cm (18-24 in)</p>
              <p>Desktop: 55-80 cm (22-32 in)</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep('screen-size')}
                className="text-gray-400 hover:text-white py-2 px-4 text-sm"
              >
                Back
              </button>
              <button
                onClick={() => setStep('test')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded text-sm transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Step: Test */}
        {step === 'test' && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-white">Test Your Setup</h2>
            <p className="text-sm text-gray-400 leading-relaxed">
              Move your head around. The 3D scene should respond as if you're
              looking through a window.
            </p>

            <div className="space-y-1 text-xs text-gray-500">
              <p>Moving left reveals the right side</p>
              <p>Moving right reveals the left side</p>
              <p>Moving up/down changes vertical perspective</p>
            </div>

            <div className="pt-2 border-t border-gray-800 text-xs text-gray-600 space-y-0.5">
              <p>Screen: {screenWidthCm.toFixed(1)} x {screenHeightCm.toFixed(1)} cm</p>
              <p>Distance: {viewingDistanceCm.toFixed(1)} cm</p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep('viewing-distance')}
                className="text-gray-400 hover:text-white py-2 px-4 text-sm"
              >
                Adjust
              </button>
              <button
                onClick={() => {
                  handleComplete();
                  onClose();
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded text-sm transition-colors"
              >
                Complete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CalibrationWizard;
