The app now installs fork **0.8.0**, adding analytic intersection contours to the Boolean clipping engine. The preceding 0.7.0 fork work was committed locally as **`eb1bee5` — Implement continuous hidden-line rendering and event-based Boolean clipping**. Its detailed commit description records the ray/visibility changes, regression evidence, packaging, and limitations. The subsequent contour work is a separate, uncommitted change; nothing has been pushed or published.

[View the before/after SVG](boolean-contours-comparison.svg). Both columns use the same geometry and cameras. Blue highlights the newly generated seams; ordinary application output uses the selected stroke color. The gallery covers a planar sphere cut, cylindrical bore, sphere lens, and nested cuts. [Diagnostic render results](boolean-contours-results.json) are single runs, not benchmark medians.

Implemented contour families:

- Plane/plane seams between box faces, cylinder caps, and cone bases.
- Sphere/plane circles, including affine ellipsoids cut by those planar faces.
- Sphere/sphere circles when their relative transform preserves spheres, including shapes sharing a common nonuniform affine frame.
- Coaxial sphere/cylinder and sphere/cone intersection circles, including common affine transforms.

Nested Booleans regenerate supported contours against the complete expression. Plane/quadric events on circles are solved through two bounded tangent-half-angle charts, so subsequent cuts find analytic arc endpoints. Adjacent straight seams meet those endpoints without gaps caused by clipping a previously tessellated chord. Closed periodic curves share the exact same first/last endpoint.

Generated seams preserve both incident surfaces through transforms. This keeps an exposed planar cut rim complete in an oblique view. Complete parallel ellipses that coincide in an orthographic projection are drawn once at their near depth; near/far-plane clipping does not incorrectly suppress a visible rear rim. Tangent contacts and zero-radius curves are omitted.

Library precision controls are available through the optional fourth `BooleanShape` constructor argument:

```ts
new ln.BooleanShape(operation, a, b, {
  contours: true,
  contourTolerance: 0.0001,
  maxContourPoints: 100000,
});
```

Tolerance is in that Boolean's coordinate frame, and defaults to `1e-4` of its bounding-box diagonal. Affine circles use a conservative world-space sagitta bound. An outer instance scales the resulting geometry and tolerance. This is independent of the app's existing pixel-quality control and is not a physical pen-width guarantee. Generated vertices and candidate pairs are bounded; exhaustion reports an explicit error. `contours: false` restores operand-only strokes without changing occlusion.

Validation completed locally:

- 55 library tests, including 15 new contour regressions.
- Circle closure and analytic surface membership; finite plane seams; thin lenses; affine frames; nested endpoint alignment; tolerance and work budgets; oblique rim visibility; coincident projected rims; near-plane cases.
- 30 app tests, including verification of a newly generated circular boundary through app projection.
- Six browser scenarios, including four-camera Boolean rendering, actual worker final-pass behavior, and physical SVG export.
- Lint, production build, and visual inspection of the SVG comparison and browser scene.

This is the first contour-generation phase. Arbitrary ellipsoid/ellipsoid, off-axis sphere/cylinder, general cylinder/cone, and mesh intersection contours remain unsupported; those pairs keep their existing clipped strokes. Floating-point degeneracies and all forms of overlapping-stroke cleanup are not universally solved. Dense Boolean event-pair acceleration remains a separate performance follow-up. The new feature adds boundary-classification and drawing work rather than claiming a universal speedup.

The app vendors the source, builds, declarations, and algorithm notes in `vendor/lnjs-core-0.8.0.tgz`. [Refresh instructions](../vendor/README.md) reproduce the installation. The 0.6.0 and 0.7.0 artifacts remain comparison baselines.
