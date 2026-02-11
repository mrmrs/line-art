import type { CameraConfig, Vec3 } from './types';

// =============================================================================
// Camera presets and spherical coordinate utilities
// =============================================================================

export const CAMERA_PRESETS: CameraConfig[] = [
  // --- Primary views (used by default grid layouts) ---
  {
    name: 'Hero',
    eye: [4, 3, 2],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Front',
    eye: [0, -5, 0],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Top',
    eye: [0, 0, 5],
    center: [0, 0, 0],
    up: [0, 1, 0],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Right',
    eye: [5, 0, 0],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Isometric',
    eye: [3, 3, 3],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: '3/4 Low',
    eye: [4, 3, 1],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },

  // --- Additional angles ---
  {
    name: 'Back',
    eye: [0, 5, 0],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Left',
    eye: [-5, 0, 0],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Bottom',
    eye: [0, 0, -5],
    center: [0, 0, 0],
    up: [0, 1, 0],
    fovy: 50,
    ortho: true,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'High Angle',
    eye: [3, 3, 5],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Dramatic Low',
    eye: [4, 2, -0.5],
    center: [0, 0, 0.5],
    up: [0, 0, 1],
    fovy: 60,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Wide',
    eye: [8, 6, 4],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 35,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: 'Close-up',
    eye: [2, 1.5, 1],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
  {
    name: '45 Corner',
    eye: [4, 4, 2.5],
    center: [0, 0, 0],
    up: [0, 0, 1],
    fovy: 50,
    ortho: false,
    orthoSize: 3,
    zoom: 1,
  },
];

// --- Spherical coordinate utilities (Z-up) ---

export interface SphericalCoords {
  r: number;     // distance
  theta: number; // azimuth (rotation around Z axis)
  phi: number;   // elevation (angle from Z axis)
}

export function cartesianToSpherical(eye: Vec3, center: Vec3): SphericalCoords {
  const dx = eye[0] - center[0];
  const dy = eye[1] - center[1];
  const dz = eye[2] - center[2];
  const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const theta = Math.atan2(dy, dx);
  const phi = r > 0 ? Math.acos(Math.max(-1, Math.min(1, dz / r))) : 0;
  return { r, theta, phi };
}

export function sphericalToCartesian(
  coords: SphericalCoords,
  center: Vec3,
): Vec3 {
  const { r, theta, phi } = coords;
  return [
    center[0] + r * Math.sin(phi) * Math.cos(theta),
    center[1] + r * Math.sin(phi) * Math.sin(theta),
    center[2] + r * Math.cos(phi),
  ];
}

export function getCamerasForViewMode(mode: string): CameraConfig[] {
  switch (mode) {
    case '1x2':
      return [CAMERA_PRESETS[0], CAMERA_PRESETS[1]];
    case '2x2':
      return [CAMERA_PRESETS[0], CAMERA_PRESETS[1], CAMERA_PRESETS[2], CAMERA_PRESETS[3]];
    case '3x2':
      return CAMERA_PRESETS.slice(0, 6);
    case 'single':
    default:
      return [CAMERA_PRESETS[0]];
  }
}
