import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { ThreeSceneManager } from '../utils/threeScene';
import type { SmoothedHeadPose, DepthPlane, ModelEntry, ThreeViewHandle } from '../types';

const ThreeView = forwardRef<ThreeViewHandle>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<ThreeSceneManager | null>(null);

  useImperativeHandle(ref, () => ({
    updateHeadPose(pose: SmoothedHeadPose) {
      managerRef.current?.updateHeadPose(pose);
    },

    updatePlaneTexture(planeId: string, texture: THREE.Texture) {
      managerRef.current?.updatePlaneTexture(planeId, texture);
    },

    clearPlaneTexture(planeId: string) {
      managerRef.current?.clearPlaneTexture(planeId);
    },

    setPlaneConfig(planeId: string, config: Partial<DepthPlane>) {
      managerRef.current?.setPlaneConfig(planeId, config);
    },

    addPlane(plane: DepthPlane) {
      managerRef.current?.addPlane(plane);
    },

    removePlane(planeId: string) {
      managerRef.current?.removePlane(planeId);
    },

    setShowLabels(show: boolean) {
      managerRef.current?.setShowLabels(show);
    },

    getRenderer() {
      return managerRef.current?.renderer ?? null;
    },

    async addModel(entry: ModelEntry, buffer: ArrayBuffer) {
      return managerRef.current?.addModel(entry, buffer);
    },

    removeModel(modelId: string) {
      managerRef.current?.removeModel(modelId);
    },

    setModelConfig(modelId: string, config: Partial<ModelEntry>) {
      managerRef.current?.setModelConfig(modelId, config);
    },

    getPlaneScreenRect(planeId: string) {
      return managerRef.current?.getPlaneScreenRect(planeId) ?? null;
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = new ThreeSceneManager(containerRef.current);
    managerRef.current = manager;
    manager.start();

    return () => {
      manager.dispose();
      managerRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
    />
  );
});

ThreeView.displayName = 'ThreeView';

export default ThreeView;
