import { useState, useRef, useCallback } from 'react';
import { SliderRow } from './SliderRow';
import type { ModelEntry } from '../types';

interface ModelManagerProps {
  models: ModelEntry[];
  onLoadModel: (file: File) => void;
  onRemoveModel: (modelId: string) => void;
  onUpdateModel: (modelId: string, config: Partial<ModelEntry>) => void;
}

const ModelManager: React.FC<ModelManagerProps> = ({
  models,
  onLoadModel,
  onRemoveModel,
  onUpdateModel,
}) => {
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onLoadModel(file);
      e.target.value = '';
    }
  }, [onLoadModel]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.gltf') || file.name.endsWith('.glb'))) {
      onLoadModel(file);
    }
  }, [onLoadModel]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <div className="p-3 border-b border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider">3D Models</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 bg-gray-800 rounded transition-colors"
        >
          + Load
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gltf,.glb"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border border-dashed rounded p-2 mb-2 text-center text-[10px] transition-colors ${
          dragOver
            ? 'border-blue-400 bg-blue-900/20 text-blue-300'
            : 'border-gray-700 text-gray-600'
        }`}
      >
        Drop .gltf/.glb here
      </div>

      {/* Model list */}
      <div className="space-y-2">
        {models.map((model) => {
          const isExpanded = expandedModel === model.id;
          return (
            <div
              key={model.id}
              className="bg-gray-800 rounded p-2 border border-gray-700"
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => setExpandedModel(isExpanded ? null : model.id)}
                  className="text-xs text-white font-medium hover:text-blue-300 transition-colors text-left truncate flex-1"
                >
                  {isExpanded ? '[-]' : '[+]'} {model.label}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onUpdateModel(model.id, { visible: !model.visible })}
                    className={`text-[10px] px-1 rounded ${model.visible ? 'text-green-400' : 'text-gray-600'}`}
                  >
                    {model.visible ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => onRemoveModel(model.id)}
                    className="text-gray-600 hover:text-red-400 text-[10px] transition-colors"
                    title="Remove model"
                  >
                    X
                  </button>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 truncate mb-1">{model.fileName}</div>

              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
                  {/* Position */}
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">Position</div>
                  <SliderRow label="X" value={model.posX} min={-0.5} max={0.5} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { posX: v })} />
                  <SliderRow label="Y" value={model.posY} min={-0.5} max={0.5} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { posY: v })} />
                  <SliderRow label="Z" value={model.posZ} min={-0.5} max={0.5} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { posZ: v })} />

                  {/* Rotation */}
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Rotation</div>
                  <SliderRow label="RX" value={model.rotX} min={-180} max={180} step={1} suffix="°"
                    onChange={(v) => onUpdateModel(model.id, { rotX: v })} />
                  <SliderRow label="RY" value={model.rotY} min={-180} max={180} step={1} suffix="°"
                    onChange={(v) => onUpdateModel(model.id, { rotY: v })} />
                  <SliderRow label="RZ" value={model.rotZ} min={-180} max={180} step={1} suffix="°"
                    onChange={(v) => onUpdateModel(model.id, { rotZ: v })} />

                  {/* Scale */}
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Scale</div>
                  <SliderRow label="S" value={model.scale} min={0.01} max={3} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { scale: v })} />

                  {/* Light */}
                  <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Light</div>
                  <SliderRow label="Int" value={model.lightIntensity} min={0} max={3} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { lightIntensity: v })} />
                  <SliderRow label="Dist" value={model.lightDistance} min={0} max={2} step={0.01}
                    onChange={(v) => onUpdateModel(model.id, { lightDistance: v })} />
                  <div className="flex items-center gap-1.5">
                    <label className="text-[10px] text-gray-500 w-6 shrink-0">Col</label>
                    <input
                      type="color"
                      value={model.lightColor}
                      onChange={(e) => onUpdateModel(model.id, { lightColor: e.target.value })}
                      className="h-5 w-8 bg-transparent border border-gray-600 rounded cursor-pointer"
                    />
                    <span className="text-[10px] text-gray-500">{model.lightColor}</span>
                  </div>

                  {/* Animations */}
                  {model.animationCount > 0 && (
                    <>
                      <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Animation</div>
                      <div className="flex items-center gap-1">
                        <select
                          value={model.activeAnimationIndex}
                          onChange={(e) => onUpdateModel(model.id, {
                            activeAnimationIndex: parseInt(e.target.value),
                            animationPlaying: parseInt(e.target.value) >= 0,
                          })}
                          className="flex-1 bg-gray-700 text-[10px] text-gray-300 rounded px-1 py-0.5"
                        >
                          <option value={-1}>None</option>
                          {Array.from({ length: model.animationCount }, (_, i) => (
                            <option key={i} value={i}>Clip {i}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => onUpdateModel(model.id, {
                            animationPlaying: !model.animationPlaying,
                          })}
                          className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            model.animationPlaying
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-400'
                          }`}
                        >
                          {model.animationPlaying ? 'Stop' : 'Play'}
                        </button>
                      </div>
                    </>
                  )}

                  {/* Reset */}
                  <button
                    onClick={() => onUpdateModel(model.id, {
                      posX: 0, posY: 0, posZ: 0,
                      rotX: 0, rotY: 0, rotZ: 0,
                      scale: 1,
                      lightIntensity: 0.5, lightColor: '#ffffff', lightDistance: 0.5,
                    })}
                    className="w-full mt-1.5 text-[10px] py-0.5 text-gray-500 hover:text-white bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                  >
                    Reset Transforms
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModelManager;
