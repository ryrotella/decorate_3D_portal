import { useState, useCallback } from 'react';
import { SliderRow } from './SliderRow';
import type { VideoSource, DepthPlane } from '../types';

interface VideoSourceManagerProps {
  sources: VideoSource[];
  depthPlanes: DepthPlane[];
  serverConnected: boolean;
  onAssignSource: (planeId: string, sourceId: string | null) => void;
  onDropImage: (planeId: string, file: File) => void;
  onDropVideo?: (planeId: string, file: File) => void;
  onAssignUrl?: (planeId: string, url: string) => void;
  onUpdatePlane: (planeId: string, config: Partial<DepthPlane>) => void;
  onAddPlane: () => void;
  onRemovePlane: (planeId: string) => void;
  children?: React.ReactNode;
}

const VideoSourceManager: React.FC<VideoSourceManagerProps> = ({
  sources,
  depthPlanes,
  serverConnected,
  onAssignSource,
  onDropImage,
  onDropVideo,
  onAssignUrl,
  onUpdatePlane,
  onAddPlane,
  onRemovePlane,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(true);
  const [dragSourceId, setDragSourceId] = useState<string | null>(null);
  const [expandedPlane, setExpandedPlane] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});

  const handleDragStart = useCallback((sourceId: string) => {
    setDragSourceId(sourceId);
  }, []);

  const handleDrop = useCallback(
    (planeId: string, e: React.DragEvent) => {
      e.preventDefault();

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
          onDropImage(planeId, file);
          return;
        }
        if (file.type.startsWith('video/') && onDropVideo) {
          onDropVideo(planeId, file);
          return;
        }
      }

      if (dragSourceId) {
        onAssignSource(planeId, dragSourceId);
        setDragSourceId(null);
      }
    },
    [dragSourceId, onAssignSource, onDropImage, onDropVideo]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="absolute top-4 left-4 z-20 p-2 bg-black/70 hover:bg-black/90 text-white rounded backdrop-blur-sm text-xs transition-colors"
        title="Open source manager"
      >
        Sources
      </button>
    );
  }

  return (
    <div className="w-72 bg-gray-900/95 backdrop-blur-sm border-l border-gray-700 flex flex-col overflow-y-auto z-20">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h2 className="text-sm font-medium text-white">Video Sources</h2>
        <button
          onClick={() => setCollapsed(true)}
          className="text-gray-400 hover:text-white text-xs"
        >
          Close
        </button>
      </div>

      {/* Server status */}
      <div className="px-3 py-2 text-xs flex items-center gap-2 border-b border-gray-800">
        <div className={`w-1.5 h-1.5 rounded-full ${serverConnected ? 'bg-green-400' : 'bg-red-400'}`} />
        <span className="text-gray-400">
          {serverConnected ? 'Server connected' : 'Server offline'}
        </span>
      </div>

      {/* Sources list */}
      <div className="p-3 border-b border-gray-800">
        <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-2">Available Sources</h3>
        {sources.length === 0 ? (
          <p className="text-xs text-gray-600 italic">
            {serverConnected ? 'No sources found' : 'Connect server to discover sources'}
          </p>
        ) : (
          <div className="space-y-1">
            {sources.map((source) => (
              <div
                key={source.id}
                draggable
                onDragStart={() => handleDragStart(source.id)}
                className="px-2 py-1.5 bg-gray-800 rounded text-xs text-gray-300 cursor-grab active:cursor-grabbing hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${source.connected ? 'bg-green-400' : 'bg-gray-500'}`} />
                <span className="truncate flex-1">{source.name}</span>
                <span className="text-gray-600 text-[10px]">{source.type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Extra sections (e.g. ModelManager) */}
      {children}

      {/* Depth planes */}
      <div className="p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs text-gray-500 uppercase tracking-wider">Depth Planes</h3>
          <button
            onClick={onAddPlane}
            className="text-[10px] text-gray-400 hover:text-white px-1.5 py-0.5 bg-gray-800 rounded transition-colors"
          >
            + Add
          </button>
        </div>

        <div className="space-y-2">
          {depthPlanes.map((plane) => {
            const isExpanded = expandedPlane === plane.id;
            return (
              <div
                key={plane.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(plane.id, e)}
                className="bg-gray-800 rounded p-2 border border-gray-700 hover:border-gray-600 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-1.5">
                  <button
                    onClick={() => setExpandedPlane(isExpanded ? null : plane.id)}
                    className="text-xs text-white font-medium hover:text-blue-300 transition-colors text-left"
                  >
                    {isExpanded ? '[-]' : '[+]'} {plane.label}
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onUpdatePlane(plane.id, { visible: !plane.visible })}
                      className={`text-[10px] px-1 rounded ${plane.visible ? 'text-green-400' : 'text-gray-600'}`}
                      title={plane.visible ? 'Hide' : 'Show'}
                    >
                      {plane.visible ? 'ON' : 'OFF'}
                    </button>
                    {plane.surface === 'free' && (
                      <button
                        onClick={() => onRemovePlane(plane.id)}
                        className="text-gray-600 hover:text-red-400 text-[10px] transition-colors"
                        title="Remove plane"
                      >
                        X
                      </button>
                    )}
                  </div>
                </div>

                {/* Assigned source */}
                <div className="text-[10px] text-gray-400 mb-1.5">
                  {plane.sourceId ? (
                    <div className="flex items-center gap-1">
                      <span className="text-blue-400 truncate">{plane.sourceId}</span>
                      <button
                        onClick={() => onAssignSource(plane.id, null)}
                        className="text-gray-600 hover:text-red-400"
                      >
                        x
                      </button>
                    </div>
                  ) : (
                    <span className="italic">Drop source, image, or video here</span>
                  )}
                </div>

                {/* URL input */}
                {onAssignUrl && (
                  <div className="mb-1.5">
                    <input
                      type="text"
                      placeholder="Paste video/YouTube URL..."
                      value={urlInputs[plane.id] ?? ''}
                      onChange={(e) => setUrlInputs((prev) => ({ ...prev, [plane.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && urlInputs[plane.id]?.trim()) {
                          onAssignUrl(plane.id, urlInputs[plane.id].trim());
                          setUrlInputs((prev) => ({ ...prev, [plane.id]: '' }));
                        }
                      }}
                      className="w-full bg-gray-700 text-[10px] text-gray-300 rounded px-1.5 py-1 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Opacity slider (always visible) */}
                <SliderRow
                  label="Op" value={plane.opacity} min={0} max={1} step={0.05} suffix="%"
                  onChange={(v) => onUpdatePlane(plane.id, { opacity: v })}
                />

                {/* Expanded transform controls */}
                {isExpanded && (
                  <div className="mt-2 pt-2 border-t border-gray-700 space-y-1">
                    {/* Position offsets */}
                    <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-0.5">Position</div>
                    <SliderRow
                      label="X" value={plane.posX} min={-1} max={1} step={0.01}
                      onChange={(v) => onUpdatePlane(plane.id, { posX: v })}
                    />
                    <SliderRow
                      label="Y" value={plane.posY} min={-1} max={1} step={0.01}
                      onChange={(v) => onUpdatePlane(plane.id, { posY: v })}
                    />
                    <SliderRow
                      label="Z" value={plane.surface === 'free' ? plane.zDepth : plane.posZ}
                      min={plane.surface === 'free' ? -1 : -0.5} max={plane.surface === 'free' ? 0 : 0.5} step={0.01}
                      onChange={(v) => onUpdatePlane(plane.id, plane.surface === 'free' ? { zDepth: v } : { posZ: v })}
                    />

                    {/* Rotation */}
                    <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Rotation</div>
                    <SliderRow
                      label="RX" value={plane.rotX} min={-180} max={180} step={1} suffix="°"
                      onChange={(v) => onUpdatePlane(plane.id, { rotX: v })}
                    />
                    <SliderRow
                      label="RY" value={plane.rotY} min={-180} max={180} step={1} suffix="°"
                      onChange={(v) => onUpdatePlane(plane.id, { rotY: v })}
                    />
                    <SliderRow
                      label="RZ" value={plane.rotZ} min={-180} max={180} step={1} suffix="°"
                      onChange={(v) => onUpdatePlane(plane.id, { rotZ: v })}
                    />

                    {/* Scale */}
                    <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Scale</div>
                    <SliderRow
                      label="SX" value={plane.scaleX} min={0.1} max={3} step={0.05}
                      onChange={(v) => onUpdatePlane(plane.id, { scaleX: v })}
                    />
                    <SliderRow
                      label="SY" value={plane.scaleY} min={0.1} max={3} step={0.05}
                      onChange={(v) => onUpdatePlane(plane.id, { scaleY: v })}
                    />

                    {/* Flip toggles */}
                    <div className="text-[9px] text-gray-600 uppercase tracking-wider mt-1.5 mb-0.5">Flip</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onUpdatePlane(plane.id, { flipH: !plane.flipH })}
                        className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${plane.flipH ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                      >
                        Flip H
                      </button>
                      <button
                        onClick={() => onUpdatePlane(plane.id, { flipV: !plane.flipV })}
                        className={`flex-1 text-[10px] py-0.5 rounded transition-colors ${plane.flipV ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
                      >
                        Flip V
                      </button>
                    </div>

                    {/* Reset button */}
                    <button
                      onClick={() => onUpdatePlane(plane.id, {
                        posX: 0, posY: 0, posZ: 0,
                        rotX: 0, rotY: 0, rotZ: 0,
                        scaleX: 1, scaleY: 1,
                        flipH: false, flipV: false,
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
    </div>
  );
};

export default VideoSourceManager;
