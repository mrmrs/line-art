import { memo } from 'react';
import type { CubeGridParams, GridSizeMethod, GridPresenceMethod } from '../../lib/types';
import { AUTOMATA_RULE_PRESETS } from '../../lib/automata-grid';
import { suggestCountXForText } from '../../lib/cube-grid';
import { NumberInput, SelectInput, CheckboxInput, Vec3Input, TextInput } from './inputs';
void AUTOMATA_RULE_PRESETS; // (kept for type symmetry; not used here)

interface Props {
  params: CubeGridParams;
  onChange: (p: Record<string, unknown>) => void;
}

export const CubeGridEditor = memo(function CubeGridEditor({ params: gp, onChange }: Props) {
  const dim = gp.dimensions;
  const sm = gp.sizeMethod;
  const pm = gp.presenceMethod;

  const showShellOnly = (
    pm === 'sphere-mask' ||
    pm === 'voxel-pyramid' ||
    pm === 'voxel-torus' ||
    pm === 'voxel-diamond' ||
    pm === 'voxel-cross' ||
    pm === 'menger-sponge'
  );

  return (
    <div className="property-grid">
      {/* Structure */}
      <div className="property-section-label">Grid</div>

      <SelectInput
        label="Type"
        value={dim}
        options={[
          { value: '2d', label: '2D (flat)' },
          { value: '3d', label: '3D (volume)' },
        ]}
        onChange={(v) => onChange({ dimensions: v })}
      />

      <NumberInput label="Count X" value={gp.countX} onChange={(v) => onChange({ countX: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      <NumberInput label="Count Y" value={gp.countY} onChange={(v) => onChange({ countY: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      {dim === '3d' && (
        <NumberInput label="Count Z" value={gp.countZ} onChange={(v) => onChange({ countZ: Math.max(1, Math.round(v)) })} step={1} min={1} max={30} />
      )}
      <NumberInput label="Spacing" value={gp.spacing} onChange={(v) => onChange({ spacing: v })} step={0.05} min={0.1} />

      {/* Size */}
      <div className="property-section-label">Size</div>

      <SelectInput
        label="Method"
        value={sm}
        options={[
          { value: 'uniform', label: 'Uniform' },
          { value: 'noise', label: 'Noise (fractal)' },
          { value: 'radial', label: 'Radial (center)' },
          { value: 'radial-inv', label: 'Radial (edges)' },
          { value: 'sine', label: 'Sine wave' },
          { value: 'random', label: 'Random' },
          { value: 'step', label: 'Staircase' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'manhattan', label: 'Manhattan dist' },
          { value: 'ripple', label: 'Ripple' },
          { value: 'expression', label: 'Expression' },
        ]}
        onChange={(v) => onChange({ sizeMethod: v as GridSizeMethod })}
      />

      <NumberInput label="Min Size" value={gp.sizeMin} onChange={(v) => onChange({ sizeMin: v })} step={0.02} min={0} />
      <NumberInput label="Max Size" value={gp.sizeMax} onChange={(v) => onChange({ sizeMax: v })} step={0.02} min={0.01} />

      {(sm === 'noise' || sm === 'random') && (
        <NumberInput label="Seed" value={gp.noiseSeed} onChange={(v) => onChange({ noiseSeed: Math.round(v) })} step={1} min={0} />
      )}
      {sm === 'noise' && (
        <NumberInput label="Scale" value={gp.noiseScale} onChange={(v) => onChange({ noiseScale: v })} step={0.1} min={0.1} />
      )}
      {sm === 'sine' && (
        <Vec3Input label="Frequency" value={gp.sineFrequency} onChange={(v) => onChange({ sineFrequency: v })} step={0.5} />
      )}
      {sm === 'step' && (
        <NumberInput label="Levels" value={gp.stepCount} onChange={(v) => onChange({ stepCount: Math.max(2, Math.round(v)) })} step={1} min={2} max={20} />
      )}
      {sm === 'gradient' && (
        <SelectInput
          label="Axis"
          value={gp.gradientAxis}
          options={[
            { value: 'x', label: 'X' },
            { value: 'y', label: 'Y' },
            { value: 'z', label: 'Z' },
          ]}
          onChange={(v) => onChange({ gradientAxis: v })}
        />
      )}
      {sm === 'expression' && (
        <TextInput
          label="f(x,y,z,ix,iy,iz,nx,ny,nz) ="
          value={gp.sizeExpression}
          onChange={(v) => onChange({ sizeExpression: v })}
          mono
          full
        />
      )}

      {/* Presence */}
      <div className="property-section-label">Presence</div>

      <SelectInput
        label="Method"
        value={pm}
        options={[
          { value: 'all', label: 'All cells' },
          { value: 'random', label: 'Random' },
          { value: 'threshold', label: 'Size threshold' },
          { value: 'checkerboard', label: 'Checkerboard' },
          { value: 'sphere-mask', label: 'Sphere' },
          { value: 'noise-mask', label: 'Noise mask' },
          { value: 'voxel-pyramid', label: 'Pyramid' },
          { value: 'voxel-torus', label: 'Torus' },
          { value: 'voxel-diamond', label: 'Diamond' },
          { value: 'voxel-cross', label: 'Cross (+)' },
          { value: 'voxel-letter', label: 'Text / Letter' },
          { value: 'menger-sponge', label: 'Menger Sponge' },
          { value: 'city-skyline', label: 'City Skyline' },
          { value: 'heightmap', label: 'Heightmap Terrain' },
          { value: 'maze', label: 'Maze' },
          { value: 'expression', label: 'Expression' },
        ]}
        onChange={(v) => onChange({ presenceMethod: v as GridPresenceMethod })}
      />

      {(pm === 'random' || pm === 'noise-mask') && (
        <NumberInput label="Density" value={gp.presenceProbability} onChange={(v) => onChange({ presenceProbability: Math.max(0, Math.min(1, v)) })} step={0.05} min={0} max={1} />
      )}
      {pm === 'threshold' && (
        <NumberInput label="Min Size" value={gp.presenceThreshold} onChange={(v) => onChange({ presenceThreshold: v })} step={0.02} min={0} />
      )}
      {pm === 'voxel-letter' && (
        <>
          <TextInput
            label="Text"
            value={gp.voxelLetter}
            onChange={(v) => onChange({ voxelLetter: v.toUpperCase() })}
            placeholder="HELLO WORLD"
            full
          />
          {gp.voxelLetter.length > 1 && (
            <div className="property-row">
              <label className="property-label">Auto-size X</label>
              <button
                className="btn btn-xs"
                title={`Set Count X to ${suggestCountXForText(gp.voxelLetter)} for pixel-perfect text`}
                onClick={() => onChange({ countX: suggestCountXForText(gp.voxelLetter) })}
              >
                {suggestCountXForText(gp.voxelLetter)} cols
              </button>
            </div>
          )}
        </>
      )}
      {pm === 'menger-sponge' && (
        <NumberInput label="Depth" value={gp.mengerDepth ?? 2} onChange={(v) => onChange({ mengerDepth: Math.max(1, Math.min(4, Math.round(v))) })} step={1} min={1} max={4} />
      )}
      {pm === 'city-skyline' && (
        <>
          <NumberInput label="Min Height" value={gp.cityMinHeight ?? 1} onChange={(v) => onChange({ cityMinHeight: Math.max(1, Math.round(v)) })} step={1} min={1} />
          <NumberInput label="Max Height" value={gp.cityMaxHeight ?? 8} onChange={(v) => onChange({ cityMaxHeight: Math.max(1, Math.round(v)) })} step={1} min={1} />
          <NumberInput label="Seed" value={gp.citySeed ?? 42} onChange={(v) => onChange({ citySeed: Math.round(v) })} step={1} min={0} />
        </>
      )}
      {pm === 'heightmap' && (
        <>
          <NumberInput label="Noise Scale" value={gp.heightmapScale ?? 0.5} onChange={(v) => onChange({ heightmapScale: v })} step={0.05} min={0.05} />
          <NumberInput label="Seed" value={gp.heightmapSeed ?? 42} onChange={(v) => onChange({ heightmapSeed: Math.round(v) })} step={1} min={0} />
          <NumberInput label="Octaves" value={gp.heightmapOctaves ?? 3} onChange={(v) => onChange({ heightmapOctaves: Math.max(1, Math.min(6, Math.round(v))) })} step={1} min={1} max={6} />
        </>
      )}
      {pm === 'maze' && (
        <>
          <NumberInput label="Seed" value={gp.mazeSeed ?? 42} onChange={(v) => onChange({ mazeSeed: Math.round(v) })} step={1} min={0} />
          <NumberInput label="Wall Width" value={gp.mazeWallThickness ?? 1} onChange={(v) => onChange({ mazeWallThickness: Math.max(1, Math.round(v)) })} step={1} min={1} max={3} />
        </>
      )}

      {showShellOnly && (
        <CheckboxInput label="Shell only" value={gp.voxelShellOnly} onChange={(v) => onChange({ voxelShellOnly: v })} />
      )}

      {pm === 'expression' && (
        <TextInput label="show if:" value={gp.presenceExpression} onChange={(v) => onChange({ presenceExpression: v })} mono full />
      )}
    </div>
  );
});
