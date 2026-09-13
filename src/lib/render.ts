// Public renderer API. UI code communicates with workers instead of importing this module.
export {
  renderScene,
  renderScenePerPen,
  computeProjectedPaths,
  clearMeshCache,
  clearGeneratorCache,
} from './geometry-service';
export { multiPenSvg } from './svg-output';
export type { PhysicalSize, PenGroup } from './svg-output';
