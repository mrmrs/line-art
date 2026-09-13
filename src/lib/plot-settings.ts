export interface PlotSettings {
  marginMm: number;
  penDiameterMm: number;
  maxErrorMm: number;
  minimumGapMm: number;
  removeDuplicates: boolean;
  joinTouching: boolean;
  lockDirection: boolean;
  drawSpeed: number;
  travelSpeed: number;
  liftSeconds: number;
}
export const DEFAULT_PLOT_SETTINGS: PlotSettings = {
  marginMm: 10,
  penDiameterMm: 0.3,
  maxErrorMm: 0.02,
  minimumGapMm: 0,
  removeDuplicates: true,
  joinTouching: true,
  lockDirection: false,
  drawSpeed: 30,
  travelSpeed: 80,
  liftSeconds: 0.25,
};
export interface PlotStats {
  strokes: number;
  penLifts: number;
  inkMm: number;
  travelMm: number;
  estimatedSeconds: number;
}
