export interface LibraryModel {
  id: string;
  name: string;
  description: string;
  url: string;
  source: string;
  license: string;
  attribution: string;
}

/** Bundled, geometry-only meshes. Asset-specific terms: /models/ATTRIBUTION.md. */
export const MODEL_LIBRARY: readonly LibraryModel[] = [
  {
    id: 'suzanne', name: 'Suzanne',
    description: 'Blender’s sculptural monkey head, with rounded eye sockets and a faceted silhouette.',
    url: '/models/suzanne.obj',
    source: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/Suzanne',
    license: 'CC0-1.0', attribution: '© 2017 UX3D. Norbert Nopper (Khronos Suzanne sample).',
  },
  {
    id: 'teapot', name: 'Utah Teapot',
    description: 'The historic graphics model: curved body, looping handle and sweeping spout.',
    url: '/models/utah-teapot.obj', source: 'https://graphics.cs.utah.edu/teapot/',
    license: 'Utah Teapot permissive terms', attribution: 'Historic Utah Teapot, University of Utah. Martin Newell / Jim Blinn / Frank Crow; official mesh generator by Cem Yuksel.',
  },
  {
    id: 'ship', name: 'Pirate ship',
    description: 'A tall sailing ship with billowing sails, layered hull and intricate rigging.',
    url: '/models/pirate-ship.obj', source: 'https://opengameart.org/content/pirate-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Pirate Kit 2.1, ship-pirate-large.',
  },
  {
    id: 'castle', name: 'Watchtower',
    description: 'A tall coastal watchtower with a pointed roof and open lookout.',
    url: '/models/watchtower.obj', source: 'https://opengameart.org/content/pirate-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Pirate Kit 2.1, tower-complete-large.',
  },
  {
    id: 'tree', name: 'Bent palm',
    description: 'An arching trunk topped with long, angular tropical fronds.',
    url: '/models/bent-palm.obj', source: 'https://opengameart.org/content/pirate-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Pirate Kit 2.1, palm-detailed-bend.',
  },
  {
    id: 'rocket', name: 'Spacecraft',
    description: 'A broad-winged science-fiction craft with an angular fuselage and engines.',
    url: '/models/spacecraft.obj', source: 'https://opengameart.org/content/space-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Space Kit 1.0, spaceCraft1.',
  },
  {
    id: 'skull', name: 'Alien fossil',
    description: 'An ancient rib cage with sweeping, repeated arcs and angular bone forms.',
    url: '/models/alien-fossil.obj', source: 'https://opengameart.org/content/space-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Space Kit 1.0, alienBones.',
  },
  {
    id: 'crystal', name: 'Crystal outcrop',
    description: 'A jagged mineral formation with clustered facets and inset ore.',
    url: '/models/crystal-outcrop.obj', source: 'https://opengameart.org/content/space-kit',
    license: 'CC0-1.0', attribution: 'Kenney — Space Kit 1.0, rocksTallOre.',
  },
];
