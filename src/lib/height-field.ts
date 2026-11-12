import * as ln from '@lnjs/core';

// Keep the app's expression compiler separate from the fork's geometric surface.
export class HeightField extends ln.Function {
  constructor(fn: (x: number, y: number) => number, box: ln.Box, above: boolean) {
    super(fn, box, above ? ln.Direction.Above : ln.Direction.Below);
  }
}
