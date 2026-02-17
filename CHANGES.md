# Auto Point Light for 3D Models

## Summary

Every 3D model placed in the scene now automatically gets an attached point light with per-model controls for brightness, color, and range.

## Files Changed

### `client/src/types/index.ts`
- Added `lightIntensity`, `lightColor`, and `lightDistance` fields to `ModelEntry` interface

### `client/src/utils/modelManager.ts`
- Added `light` (THREE.PointLight) to `ModelRecord`
- `loadFromBuffer`: creates a PointLight and adds it to the model's group on load
- `setConfig`: updates light intensity, color, distance, and visibility when config changes

### `client/src/App.tsx`
- Default light values for new models: intensity `0.5`, color `#ffffff`, distance `0.5`

### `client/src/components/ModelManager.tsx`
- Added **Light** section to expanded model controls:
  - **Int** slider (0–3) — brightness; 0 turns the light off
  - **Dist** slider (0–2) — falloff range
  - **Col** color picker — light tint
- Reset button restores light defaults
