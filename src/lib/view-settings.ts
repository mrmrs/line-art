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
interface ViewSettings {
  paperSize: string;
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
  paperSize: 'square', gridVisible: false, gridStyle: 'lines',
  gridSpacingMm: 10, gridColor: '#a1a1aa',
  setPaperSize: paperSize => { if (Object.hasOwn(PAPER_SIZES, paperSize)) set({ paperSize }); },
  setGridVisible: gridVisible => set({ gridVisible }),
  setGridStyle: gridStyle => set({ gridStyle }),
  setGridSpacingMm: spacing => { if (Number.isFinite(spacing)) set({ gridSpacingMm: Math.max(1, Math.min(100, spacing)) }); },
  setGridColor: gridColor => { if (/^#[0-9a-f]{6}$/i.test(gridColor)) set({ gridColor }); },
}));
