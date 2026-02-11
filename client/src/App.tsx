import { useState, useCallback, useRef, useEffect } from 'react';
import * as THREE from 'three';
import ThreeView from './components/ThreeView';
import FaceMeshView from './components/FaceMeshView';
import VideoSourceManager from './components/VideoSourceManager';
import ModelManagerPanel from './components/ModelManager';
import CalibrationWizard from './components/CalibrationWizard';
import DebugOverlay from './components/DebugOverlay';
import SettingsPanel from './components/SettingsPanel';
import { useVideoSources } from './hooks/useVideoSources';
import { useMonitorDetection } from './hooks/useMonitorDetection';
import { calibrationManager } from './utils/calibration';
import { VideoElementManager } from './utils/videoElementManager';
import { YouTubeOverlayManager } from './utils/youtubeOverlayManager';
import { parseVideoUrl } from './utils/urlDetector';
import type {
  SmoothedHeadPose,
  ThreeViewHandle,
  DepthPlane,
  ModelEntry,
  CalibrationData,
  PerspectiveSettings,
} from './types';

const PLANE_DEFAULTS = { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, flipH: false, flipV: false };

/** Default depth plane definitions */
const DEFAULT_PLANES: DepthPlane[] = [
  { id: 'back', label: 'Back Wall', surface: 'back', zDepth: 0, opacity: 1, visible: false, sourceId: null, ...PLANE_DEFAULTS },
  { id: 'left', label: 'Left Wall', surface: 'left', zDepth: 0, opacity: 1, visible: false, sourceId: null, ...PLANE_DEFAULTS },
  { id: 'right', label: 'Right Wall', surface: 'right', zDepth: 0, opacity: 1, visible: false, sourceId: null, ...PLANE_DEFAULTS },
  { id: 'ceiling', label: 'Ceiling', surface: 'ceiling', zDepth: 0, opacity: 1, visible: false, sourceId: null, ...PLANE_DEFAULTS },
  { id: 'floor', label: 'Floor', surface: 'floor', zDepth: 0, opacity: 1, visible: false, sourceId: null, ...PLANE_DEFAULTS },
];

const DEFAULT_PERSPECTIVE: PerspectiveSettings = {
  nearPlane: 0.01,
  farPlane: 10,
  movementScale: 1.5,
  smoothingFactor: 0.3,
  axisStrength: { x: 1, y: 1, z: 1 },
};

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [showWebcam, setShowWebcam] = useState(true);
  const [depthPlanes, setDepthPlanes] = useState<DepthPlane[]>(DEFAULT_PLANES);
  const [showCalibration, setShowCalibration] = useState(false);
  const [currentHeadPose, setCurrentHeadPose] = useState<SmoothedHeadPose | null>(null);
  const [perspectiveSettings, setPerspectiveSettings] = useState<PerspectiveSettings>(DEFAULT_PERSPECTIVE);
  const [modelEntries, setModelEntries] = useState<ModelEntry[]>([]);
  const threeViewRef = useRef<ThreeViewHandle>(null);
  const videoElManagerRef = useRef(new VideoElementManager());
  const youtubeManagerRef = useRef<YouTubeOverlayManager | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Show calibration wizard on first launch
  useEffect(() => {
    if (!calibrationManager.isCalibrated()) {
      setShowCalibration(true);
    }
  }, []);

  const handleCalibrationComplete = useCallback((_cal: CalibrationData) => {
    setShowCalibration(false);
  }, []);

  const {
    sources,
    connectSource,
    disconnectSource,
    getTexture,
    serverConnected,
  } = useVideoSources();

  const {
    currentMonitorId,
    profiles: monitorProfiles,
    saveCurrentProfile: saveMonitorProfile,
    deleteProfile: deleteMonitorProfile,
  } = useMonitorDetection();

  const handleHeadPoseUpdate = useCallback((pose: SmoothedHeadPose | null) => {
    setCurrentHeadPose(pose);
    if (pose && threeViewRef.current) {
      threeViewRef.current.updateHeadPose(pose);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  /** Drop an image file onto a depth plane */
  const handleDropImage = useCallback((planeId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const loader = new THREE.TextureLoader();
    loader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      threeViewRef.current?.updatePlaneTexture(planeId, texture);
      setDepthPlanes((prev) =>
        prev.map((p) =>
          p.id === planeId
            ? { ...p, sourceId: `image:${file.name}`, visible: true }
            : p
        )
      );
      URL.revokeObjectURL(url);
    });
  }, []);

  /** Load a 3D model file */
  const handleLoadModel = useCallback(async (file: File) => {
    const buffer = await file.arrayBuffer();
    const id = `model-${Date.now()}`;
    const entry: ModelEntry = {
      id,
      label: file.name.replace(/\.(gltf|glb)$/i, ''),
      fileName: file.name,
      posX: 0, posY: 0, posZ: -0.15,
      rotX: 0, rotY: 0, rotZ: 0,
      scale: 1,
      visible: true,
      animationPlaying: false,
      activeAnimationIndex: -1,
      animationCount: 0,
    };
    const updated = await threeViewRef.current?.addModel(entry, buffer);
    setModelEntries((prev) => [...prev, updated ?? entry]);
  }, []);

  /** Remove a 3D model */
  const handleRemoveModel = useCallback((modelId: string) => {
    threeViewRef.current?.removeModel(modelId);
    setModelEntries((prev) => prev.filter((m) => m.id !== modelId));
  }, []);

  /** Update a 3D model's config */
  const handleUpdateModel = useCallback((modelId: string, config: Partial<ModelEntry>) => {
    threeViewRef.current?.setModelConfig(modelId, config);
    setModelEntries((prev) =>
      prev.map((m) => (m.id === modelId ? { ...m, ...config } : m))
    );
  }, []);

  /** Clean up video/YouTube resources for a plane */
  const cleanupPlaneMedia = useCallback((planeId: string, sourceId: string | null) => {
    if (!sourceId) return;
    if (sourceId.startsWith('video:')) {
      videoElManagerRef.current.dispose(planeId);
    } else if (sourceId.startsWith('youtube:')) {
      youtubeManagerRef.current?.destroy(planeId);
    } else if (!sourceId.startsWith('image:')) {
      disconnectSource(sourceId);
    }
  }, [disconnectSource]);

  /** Assign a URL (video or YouTube) to a depth plane */
  const handleAssignUrl = useCallback((planeId: string, url: string) => {
    const parsed = parseVideoUrl(url);
    if (!parsed) return;

    // Clean up any existing source
    const oldPlane = depthPlanes.find((p) => p.id === planeId);
    cleanupPlaneMedia(planeId, oldPlane?.sourceId ?? null);
    threeViewRef.current?.clearPlaneTexture(planeId);

    if (parsed.type === 'youtube') {
      // YouTube overlay
      if (youtubeManagerRef.current) {
        youtubeManagerRef.current.createOverlay(planeId, parsed.videoId);
      }
      setDepthPlanes((prev) =>
        prev.map((p) =>
          p.id === planeId
            ? { ...p, sourceId: `youtube:${parsed.videoId}`, visible: true }
            : p
        )
      );
    } else {
      // Direct video URL
      const texture = videoElManagerRef.current.createFromUrl(planeId, parsed.url);
      threeViewRef.current?.updatePlaneTexture(planeId, texture);
      setDepthPlanes((prev) =>
        prev.map((p) =>
          p.id === planeId
            ? { ...p, sourceId: `video:${parsed.url}`, visible: true }
            : p
        )
      );
    }
  }, [depthPlanes, cleanupPlaneMedia]);

  /** Drop a video file onto a depth plane */
  const handleDropVideo = useCallback((planeId: string, file: File) => {
    const oldPlane = depthPlanes.find((p) => p.id === planeId);
    cleanupPlaneMedia(planeId, oldPlane?.sourceId ?? null);
    threeViewRef.current?.clearPlaneTexture(planeId);

    const texture = videoElManagerRef.current.createFromFile(planeId, file);
    threeViewRef.current?.updatePlaneTexture(planeId, texture);
    setDepthPlanes((prev) =>
      prev.map((p) =>
        p.id === planeId
          ? { ...p, sourceId: `video:${file.name}`, visible: true }
          : p
      )
    );
  }, [depthPlanes, cleanupPlaneMedia]);

  /** Assign a video source to a depth plane */
  const assignSourceToPlane = useCallback(
    (planeId: string, sourceId: string | null) => {
      // If clearing, clean up any media resources
      if (!sourceId) {
        const oldPlane = depthPlanes.find((p) => p.id === planeId);
        cleanupPlaneMedia(planeId, oldPlane?.sourceId ?? null);
        threeViewRef.current?.clearPlaneTexture(planeId);
      }

      setDepthPlanes((prev) =>
        prev.map((p) =>
          p.id === planeId
            ? { ...p, sourceId, visible: sourceId ? true : false }
            : p
        )
      );

      if (sourceId) {
        connectSource(sourceId);
        const texture = getTexture(sourceId);
        threeViewRef.current?.updatePlaneTexture(planeId, texture);
      }
    },
    [connectSource, cleanupPlaneMedia, getTexture, depthPlanes]
  );

  /** Update plane config (z-depth, opacity, visibility) */
  const updatePlaneConfig = useCallback((planeId: string, config: Partial<DepthPlane>) => {
    setDepthPlanes((prev) =>
      prev.map((p) => (p.id === planeId ? { ...p, ...config } : p))
    );
    threeViewRef.current?.setPlaneConfig(planeId, config);
  }, []);

  /** Add a new depth plane */
  const addNewPlane = useCallback(() => {
    const id = `plane-${Date.now()}`;
    const newPlane: DepthPlane = {
      id,
      label: `Plane ${depthPlanes.length + 1}`,
      surface: 'free',
      zDepth: -0.15,
      opacity: 1,
      visible: true,
      sourceId: null,
      ...PLANE_DEFAULTS,
    };
    setDepthPlanes((prev) => [...prev, newPlane]);
    threeViewRef.current?.addPlane(newPlane);
  }, [depthPlanes.length]);

  /** Remove a depth plane */
  const removeExistingPlane = useCallback((planeId: string) => {
    const plane = depthPlanes.find((p) => p.id === planeId);
    if (plane?.sourceId) {
      cleanupPlaneMedia(planeId, plane.sourceId);
    }
    setDepthPlanes((prev) => prev.filter((p) => p.id !== planeId));
    threeViewRef.current?.removePlane(planeId);
  }, [depthPlanes, cleanupPlaneMedia]);

  /** Handle perspective settings changes from the settings panel */
  const handlePerspectiveChange = useCallback((settings: Partial<PerspectiveSettings>) => {
    setPerspectiveSettings((prev) => ({ ...prev, ...settings }));
    // TODO: forward to ThreeSceneManager when exposed
  }, []);

  /** Handle scene config changes from the settings panel */
  const handleSceneChange = useCallback((_config: Record<string, unknown>) => {
    // TODO: forward to ThreeSceneManager when exposed
  }, []);

  // Initialize YouTube overlay manager
  useEffect(() => {
    if (viewportRef.current && !youtubeManagerRef.current) {
      youtubeManagerRef.current = new YouTubeOverlayManager(viewportRef.current);
    }
    return () => {
      youtubeManagerRef.current?.destroyAll();
    };
  }, []);

  // YouTube overlay position tracking
  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const mgr = youtubeManagerRef.current;
      if (mgr) {
        for (const planeId of mgr.getActivePlaneIds()) {
          const rect = threeViewRef.current?.getPlaneScreenRect(planeId);
          if (rect) {
            mgr.updatePosition(planeId, rect);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  // Cleanup video resources on unmount
  useEffect(() => {
    return () => {
      videoElManagerRef.current.disposeAll();
    };
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  return (
    <div className="w-full h-screen bg-black relative flex">
      {/* Main 3D viewport */}
      <div ref={viewportRef} className="flex-1 relative">
        <ThreeView ref={threeViewRef} />

        {/* Webcam + Face Tracking (corner overlay) */}
        {cameraEnabled && (
          <div
            className="absolute bottom-4 right-4 z-10 w-64 h-48 rounded-lg overflow-hidden shadow-2xl border border-white/20"
            style={{ display: showWebcam ? 'block' : 'none' }}
          >
            <FaceMeshView onHeadPoseUpdate={handleHeadPoseUpdate} />
          </div>
        )}

        {/* Debug Overlay (toggle with D key) */}
        <DebugOverlay
          headPose={currentHeadPose}
          debugParams={null}
          serverConnected={serverConnected}
        />

        {/* Settings Panel (toggle with S key) */}
        <SettingsPanel
          perspectiveSettings={perspectiveSettings}
          onPerspectiveChange={handlePerspectiveChange}
          onSceneChange={handleSceneChange}
          onOpenCalibration={() => setShowCalibration(true)}
          monitorProfiles={monitorProfiles}
          currentMonitorId={currentMonitorId}
          onSaveMonitorProfile={saveMonitorProfile}
          onDeleteMonitorProfile={deleteMonitorProfile}
        />

        {/* Toolbar */}
        <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded transition-colors backdrop-blur-sm text-xs"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? '[-]' : '[+]'}
          </button>
          <button
            onClick={() => setCameraEnabled((v) => !v)}
            className={`p-2 hover:bg-black/70 text-white rounded transition-colors backdrop-blur-sm text-xs ${cameraEnabled ? 'bg-black/50' : 'bg-red-900/50'}`}
            title={cameraEnabled ? 'Turn off camera' : 'Turn on camera'}
          >
            {cameraEnabled ? 'Cam' : 'Cam Off'}
          </button>
          <button
            onClick={() => setShowWebcam((v) => !v)}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded transition-colors backdrop-blur-sm text-xs"
            title={showWebcam ? 'Hide feed' : 'Show feed'}
          >
            {showWebcam ? 'Hide' : 'Show'}
          </button>
          {/* <button 
            onClick={() => {
              const next = !showLabels;
              setShowLabels(next);
              threeViewRef.current?.setShowLabels(next);
            }}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded transition-colors backdrop-blur-sm text-xs"
            title={showLabels ? 'Hide plane labels' : 'Show plane labels'}
          >
            {showLabels ? 'Labels' : 'No Lbl'}
          </button> */}
          <button
            onClick={() => setShowCalibration(true)}
            className="p-2 bg-black/50 hover:bg-black/70 text-white rounded transition-colors backdrop-blur-sm text-xs"
            title="Calibration"
          >
            Cal
          </button>
        </div>
      </div>

      {/* Calibration Wizard */}
      {showCalibration && (
        <CalibrationWizard
          onComplete={handleCalibrationComplete}
          onClose={() => setShowCalibration(false)}
        />
      )}

      {/* Video Source Manager sidebar */}
      <VideoSourceManager
        sources={sources}
        depthPlanes={depthPlanes}
        serverConnected={serverConnected}
        onAssignSource={assignSourceToPlane}
        onDropImage={handleDropImage}
        onDropVideo={handleDropVideo}
        onAssignUrl={handleAssignUrl}
        onUpdatePlane={updatePlaneConfig}
        onAddPlane={addNewPlane}
        onRemovePlane={removeExistingPlane}
      >
        <ModelManagerPanel
          models={modelEntries}
          onLoadModel={handleLoadModel}
          onRemoveModel={handleRemoveModel}
          onUpdateModel={handleUpdateModel}
        />
      </VideoSourceManager>
    </div>
  );
}

export default App;
