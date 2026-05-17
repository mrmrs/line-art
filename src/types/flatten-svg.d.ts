declare module 'flatten-svg' {
  export interface FlattenedLine {
    points: [number, number][];
    stroke?: string;
    groupId?: string;
  }
  export interface FlattenOptions {
    maxError?: number;
  }
  export function flattenSVG(
    svg: SVGElement | Element,
    options?: FlattenOptions,
  ): FlattenedLine[];
}
