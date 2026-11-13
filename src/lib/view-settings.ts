import { create } from 'zustand';

// Paper sizes — pixel dimensions at 96 DPI for the render viewport AND
// physical dimensions for the exported <svg width/height>. Plotters honor the
// physical units; viewBox stays in pixel-space so the render coordinates map
// 1:1 to plot coordinates.
export const PAPER_SIZES: Record<
  string,
  {
    w: number;
    h: number; // pixels (render size)
    physW: string;
    physH: string; // physical size attributes
    label: string;
  }
> = {
  square: {
    w: 1024,
    h: 1024,
    physW: '250mm',
    physH: '250mm',
    label: 'Square 250mm',
  },
  A4: {
    w: 794,
    h: 1123,
    physW: '210mm',
    physH: '297mm',
    label: 'A4 (210×297mm)',
  },
  A4L: {
    w: 1123,
    h: 794,
    physW: '297mm',
    physH: '210mm',
    label: 'A4 landscape',
  },
  A3: {
    w: 1123,
    h: 1587,
    physW: '297mm',
    physH: '420mm',
    label: 'A3 (297×420mm)',
  },
  A3L: {
    w: 1587,
    h: 1123,
    physW: '420mm',
    physH: '297mm',
    label: 'A3 landscape',
  },
  A2: {
    w: 1587,
    h: 2245,
    physW: '420mm',
    physH: '594mm',
    label: 'A2 (420×594mm)',
  },
  letter: {
    w: 816,
    h: 1056,
    physW: '8.5in',
    physH: '11in',
    label: 'US Letter (8.5×11in)',
  },
  tabloid: {
    w: 1056,
    h: 1632,
    physW: '11in',
    physH: '17in',
    label: 'Tabloid (11×17in)',
  },
  '12x18': {
    w: 1152,
    h: 1728,
    physW: '12in',
    physH: '18in',
    label: '12×18 in',
  },
};

export function paperDimensions(paperSize: string) {
  const paper = PAPER_SIZES[paperSize] ?? PAPER_SIZES.square;
  const mm = (value: string) => parseFloat(value) * (value.endsWith('in') ? 25.4 : 1);
  return { widthMm: mm(paper.physW), heightMm: mm(paper.physH) };
}
export type PaperOrientation = 'portrait' | 'landscape';
export type PaperUnit = 'mm' | 'cm' | 'in';
export const PAPER_UNIT_MM: Record<PaperUnit, number> = { mm: 1, cm: 10, in: 25.4 };
export const MIN_PAPER_MM = 40;
export const MAX_PAPER_MM = 2000;

export interface ViewSettings {
  optimizePaths: boolean;
  setOptimizePaths: (optimize: boolean) => void;
  paperSize: string;
  paperOrientation: PaperOrientation;
  customWidthMm: number;
  customHeightMm: number;
  paperUnit: PaperUnit;
  setPaperOrientation: (orientation: PaperOrientation) => void;
  setCustomPaperSize: (widthMm: number, heightMm: number) => void;
  setPaperUnit: (unit: PaperUnit) => void;
  gridVisible: boolean;
  gridStyle: 'lines' | 'dots';
  gridSpacingMm: number;
  gridColor: string;
  setPaperSize: (paperSize: string) => void;
  setGridVisible: (visible: boolean) => void;
  setGridStyle: (style: 'lines' | 'dots') => void;
  setGridSpacingMm: (spacing: number) => void;
  setGridColor: (color: string) => void;
}
// Display preferences deliberately stay outside scene undo and export data.
export const useViewSettings = create<ViewSettings>((set) => ({
  optimizePaths: true,
  setOptimizePaths: optimizePaths => set({ optimizePaths }),
  paperSize: 'square', paperOrientation: 'portrait', customWidthMm: 210, customHeightMm: 297, paperUnit: 'mm',
  setPaperOrientation: paperOrientation => { if (paperOrientation === 'portrait' || paperOrientation === 'landscape') set({ paperOrientation }); },
  setPaperUnit: paperUnit => { if (Object.hasOwn(PAPER_UNIT_MM, paperUnit)) set({ paperUnit }); },
  setCustomPaperSize: (widthMm, heightMm) => {
    if (![widthMm, heightMm].every(value => Number.isFinite(value) && value >= MIN_PAPER_MM && value <= MAX_PAPER_MM)) return;
    set({ paperSize: 'custom', customWidthMm: widthMm, customHeightMm: heightMm, paperOrientation: widthMm > heightMm ? 'landscape' : 'portrait' });
  },
  gridVisible: false, gridStyle: 'lines',
  gridSpacingMm: 10, gridColor: '#a1a1aa',
  setPaperSize: paperSize => {
    if (paperSize === 'custom') { set(state => ({ paperSize, paperOrientation: state.customWidthMm > state.customHeightMm ? 'landscape' : 'portrait' })); return; }
    if (Object.hasOwn(PAPER_SIZES, paperSize)) set({ paperSize, paperOrientation: PAPER_SIZES[paperSize].w > PAPER_SIZES[paperSize].h ? 'landscape' : 'portrait' });
  },
  setGridVisible: gridVisible => set({ gridVisible }),
  setGridStyle: gridStyle => set({ gridStyle }),
  setGridSpacingMm: spacing => { if (Number.isFinite(spacing)) set({ gridSpacingMm: Math.max(1, Math.min(100, spacing)) }); },
  setGridColor: gridColor => { if (/^#[0-9a-f]{6}$/i.test(gridColor)) set({ gridColor }); },
}));

/** One source of truth for preview projection, physical grid and SVG export. */
export function resolvePaper(state: Pick<ViewSettings, 'paperSize' | 'paperOrientation' | 'customWidthMm' | 'customHeightMm'>) {
  const custom = state.paperSize === 'custom';
  const preset = PAPER_SIZES[state.paperSize] ?? PAPER_SIZES.square;
  const original = custom ? { widthMm: state.customWidthMm, heightMm: state.customHeightMm } : paperDimensions(state.paperSize);
  const swap = state.paperOrientation === 'landscape' ? original.widthMm < original.heightMm : original.widthMm > original.heightMm;
  const widthMm = swap ? original.heightMm : original.widthMm;
  const heightMm = swap ? original.widthMm : original.heightMm;
  // Keep existing presets unchanged; bound custom raster work while preserving
  // the exact physical aspect ratio (SVG itself remains resolution independent).
  const scale = Math.min(96 / 25.4, 2400 / Math.max(widthMm, heightMm));
  return {
    w: custom ? widthMm * scale : swap ? preset.h : preset.w,
    h: custom ? heightMm * scale : swap ? preset.w : preset.h,
    physW: `${widthMm}mm`, physH: `${heightMm}mm`, widthMm, heightMm,
    label: custom ? 'Custom' : preset.label,
  };
}
