import { useCallback } from 'react';
import { useSceneStore } from '../lib/store';
import { DEFAULT_TRANSFORM } from '../lib/types';
import type { MeshParams } from '../lib/types';

// =============================================================================
// Hook for loading OBJ/STL files into the scene
// =============================================================================

async function readFileAsMesh(file: File): Promise<{ name: string; params: MeshParams } | null> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'obj') {
    const text = await file.text();
    return {
      name: file.name,
      params: { data: text, format: 'obj', fileName: file.name },
    };
  }

  if (ext === 'stl') {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return {
      name: file.name,
      params: { data: btoa(binary), format: 'stl', fileName: file.name },
    };
  }

  return null;
}

export function useFileLoader() {
  const addNode = useSceneStore((s) => s.addNode);

  return useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        const result = await readFileAsMesh(file);
        if (result) {
          addNode('mesh', result.name, result.params, { ...DEFAULT_TRANSFORM });
        }
      }
    },
    [addNode],
  );
}
