import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { ModelEntry } from '../types';

interface ModelRecord {
  group: THREE.Group;
  mixer: THREE.AnimationMixer | null;
  clips: THREE.AnimationClip[];
  config: ModelEntry;
  baseScale: number;
  activeAction: THREE.AnimationAction | null;
}

export class ModelManager {
  private scene: THREE.Scene;
  private models = new Map<string, ModelRecord>();
  private loader: GLTFLoader;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

    this.loader = new GLTFLoader();
    this.loader.setDRACOLoader(dracoLoader);
  }

  async loadFromBuffer(entry: ModelEntry, buffer: ArrayBuffer): Promise<ModelEntry> {
    const gltf = await this.loader.parseAsync(buffer, '');

    const group = new THREE.Group();
    group.add(gltf.scene);

    // Normalize to fit within ~0.15 bounding sphere
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const baseScale = maxDim > 0 ? 0.15 / maxDim : 1;

    // Center the model within the group
    const center = box.getCenter(new THREE.Vector3());
    gltf.scene.position.sub(center);

    group.scale.setScalar(baseScale * entry.scale);

    const deg = Math.PI / 180;
    group.position.set(entry.posX, entry.posY, entry.posZ);
    group.rotation.set(entry.rotX * deg, entry.rotY * deg, entry.rotZ * deg);
    group.visible = entry.visible;

    // Set up animation mixer if clips exist
    let mixer: THREE.AnimationMixer | null = null;
    const clips = gltf.animations ?? [];
    if (clips.length > 0) {
      mixer = new THREE.AnimationMixer(gltf.scene);
    }

    const updatedEntry: ModelEntry = {
      ...entry,
      animationCount: clips.length,
    };

    this.models.set(entry.id, {
      group,
      mixer,
      clips,
      config: updatedEntry,
      baseScale,
      activeAction: null,
    });

    this.scene.add(group);
    return updatedEntry;
  }

  remove(id: string): void {
    const record = this.models.get(id);
    if (!record) return;

    // Stop animations
    if (record.activeAction) {
      record.activeAction.stop();
    }
    if (record.mixer) {
      record.mixer.stopAllAction();
    }

    // Dispose all geometry/materials/textures
    record.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of materials) {
          if (mat.map) mat.map.dispose();
          if (mat.normalMap) mat.normalMap.dispose();
          if (mat.roughnessMap) mat.roughnessMap.dispose();
          if (mat.metalnessMap) mat.metalnessMap.dispose();
          if (mat.emissiveMap) mat.emissiveMap.dispose();
          if (mat.aoMap) mat.aoMap.dispose();
          mat.dispose();
        }
      }
    });

    this.scene.remove(record.group);
    this.models.delete(id);
  }

  setConfig(id: string, config: Partial<ModelEntry>): void {
    const record = this.models.get(id);
    if (!record) return;

    Object.assign(record.config, config);
    const c = record.config;
    const deg = Math.PI / 180;

    record.group.position.set(c.posX, c.posY, c.posZ);
    record.group.rotation.set(c.rotX * deg, c.rotY * deg, c.rotZ * deg);
    record.group.scale.setScalar(record.baseScale * c.scale);
    record.group.visible = c.visible;

    // Handle animation changes
    if (config.animationPlaying !== undefined || config.activeAnimationIndex !== undefined) {
      if (c.animationPlaying && c.activeAnimationIndex >= 0 && c.activeAnimationIndex < record.clips.length) {
        this.playAnimation(id, c.activeAnimationIndex);
      } else {
        this.stopAnimation(id);
      }
    }
  }

  playAnimation(id: string, clipIndex: number): void {
    const record = this.models.get(id);
    if (!record || !record.mixer || clipIndex < 0 || clipIndex >= record.clips.length) return;

    if (record.activeAction) {
      record.activeAction.stop();
    }

    const clip = record.clips[clipIndex];
    const action = record.mixer.clipAction(clip);
    action.play();
    record.activeAction = action;
  }

  stopAnimation(id: string): void {
    const record = this.models.get(id);
    if (!record) return;

    if (record.activeAction) {
      record.activeAction.stop();
      record.activeAction = null;
    }
  }

  updateAnimations(delta: number): void {
    for (const [, record] of this.models) {
      if (record.mixer && record.config.animationPlaying) {
        record.mixer.update(delta);
      }
    }
  }

  dispose(): void {
    for (const id of Array.from(this.models.keys())) {
      this.remove(id);
    }
  }
}
