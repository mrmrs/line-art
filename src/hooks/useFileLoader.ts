import { useCallback } from 'react';
import { useSceneStore, reportError } from '../lib/store';
import { LIMITS } from '../lib/limits';
import { DEFAULT_TRANSFORM, DEFAULT_SVG_EXTRUDE_PARAMS } from '../lib/types';
import type { MeshParams, SvgExtrudeParams } from '../lib/types';

// =============================================================================
// Hook for loading OBJ/STL/SVG files into the scene
// =============================================================================

type LoadedNode =
  | { kind: 'mesh'; name: string; params: MeshParams }
  | { kind: 'svg-extrude'; name: string; params: SvgExtrudeParams };

async function readFile(file: File): Promise<LoadedNode | null> {
  if (file.size > LIMITS.inputBytes)
    throw new Error(
      `File exceeds ${LIMITS.inputBytes / 1000000} MB input limit`,
    );
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'obj') {
    const text = await file.text();
    return {
      kind: 'mesh',
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
      kind: 'mesh',
      name: file.name,
      params: { data: btoa(binary), format: 'stl', fileName: file.name },
    };
  }

  if (ext === 'svg') {
    const text = await file.text();
    const { parseSvgString } = await import('../lib/svg-parse');
    const parsed = parseSvgString(text, 0.1, 'lines');
    return {
      kind: 'svg-extrude',
      name: file.name,
      params: {
        ...DEFAULT_SVG_EXTRUDE_PARAMS,
        importMode: 'lines',
        sourceSvg: text,
        polylines: parsed.polylines,
        bounds: parsed.bounds,
        filename: file.name,
      },
    };
  }

  return null;
}

export function useFileLoader() {
  const addNode = useSceneStore((s) => s.addNode);

  return useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        let result: LoadedNode | null;
        try {
          result = await readFile(file);
        } catch (error) {
          reportError(error);
          continue;
        }
        if (!result) continue;
        if (result.kind === 'mesh') {
          addNode('mesh', result.name, result.params, { ...DEFAULT_TRANSFORM });
        } else if (result.kind === 'svg-extrude') {
          addNode('svg-extrude', result.name, result.params, {
            ...DEFAULT_TRANSFORM,
          });
        }
      }
    },
    [addNode],
  );
}
