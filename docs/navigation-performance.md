# Camera navigation

The navigation regression was reproduced with a 12 × 12 × 12 cube grid and a sphere, using 60 actual mouse movements over roughly two seconds in Chromium. Instrumentation counts worker requests/results, distinct visible SVG frames, and main-thread animation-frame intervals.

Before the fix, a 2,049 ms drag submitted 59 render requests and received seven results, but displayed **zero frames during the drag**. Individual renders took 222–283 ms. Main-thread frame intervals were healthy (16.8 ms p95), isolating the primary bottleneck to rendering and result delivery rather than mouse event handling.

## Causes and changes

- The viewport accepted only the newest request ID. Continuous movement invalidated every completed result. The main thread now permits one in-flight render and one replaceable pending request, and presents completed compatible navigation frames while newer camera input is pending. Scene, settings, and viewport-size changes invalidate incompatible results. Release schedules an exact render for the final camera.
- The old drag setting increased `step`, which the continuous occlusion renderer no longer uses. Navigation now projects a cached, evenly sampled wireframe with at most 6,000 original segments. It skips hidden-line removal and uses one compact SVG path. The preview is visibly labeled; exact rendering and exports retain the full scene and occlusion algorithm.
- Camera movement previously wrote to the global store on each animation frame. Gestures now update local state, committing once when they end, so history and persistence track deliberate camera changes.
- Wheel zoom previously applied the same 8% step to tiny and large deltas. Normalized exponential scaling respects wheel magnitude and reverses consistently. CSS zoom feedback is tied to the camera that produced the displayed SVG.
- Panning now uses the actual camera basis and world units per screen pixel, including zoom, projection type, and viewport height. Pointer capture keeps gestures active beyond viewport boundaries.

The preview bounds projection and SVG size, but initial scene preparation still generates and compiles full geometry. An already-running exact render must also finish before the next preview starts. Extremely expensive scene construction or occlusion can therefore delay the first interactive frame. Hidden lines are intentionally visible in the temporary wireframe; the exact occluded view returns after interaction ends.

## Regression coverage

`tests/browser/navigation.spec.ts` exercises real pointer and wheel input. Renderer unit tests verify bounded deterministic previews, original-segment sampling, and unchanged exact output. Run `npm run test:browser -- tests/browser/navigation.spec.ts`; `NAV_BASELINE=1` enables measurement without the navigation performance assertions for before/after comparisons.

## Measured result

The same Chromium interaction after the fix produced **60 distinct visible frames during a 2,045 ms drag**, compared with zero before. Preview rendering took 2.2–5.2 ms, and the maximum request-to-result time fell from 304.5 ms to 5.4 ms. At most one render was outstanding. The gesture created exactly one camera-store update and one undo entry. After release, the full occlusion render took 289 ms; its SVG matched the final camera request.

| Measurement | Before | After |
| --- | ---: | ---: |
| Visible frames during roughly 2 seconds of dragging | 0 | 60 |
| Render time during movement | 222–283 ms | 2.2–5.2 ms |
| Zoom increase from a −1 pixel wheel event | 8% | 0.1501% |
| Zoom increase from a −120 pixel wheel event | 8% | 19.7217% |
| Zoom after equal opposite wheel events | 0.9936× | 1× |
| Pan distance at 2× zoom relative to 1× zoom | 1× | 0.5× |

These are fixture measurements, not a universal frame-rate guarantee. Browser regressions also inject 250–350 ms result-delivery delays to check stale-scene rejection and zoom compensation across the gesture's document commit. Tests cover pointer capture beyond the viewport, one-step undo, and Top/Bottom camera pan directions.

## Zoom review (November 2026)

Two additional browser regressions exposed remaining wheel issues after the original orbit fix. During orthographic wheel input, the displayed 3,075-polyline exact SVG was replaced by a one-path wireframe preview. In perspective, a −120 pixel wheel event applied a `matrix(1.19722, 0, 0, 1.19722, 0, 0)` CSS transform even though the renderer implements zoom by moving the camera eye. A flat scale cannot represent that depth-dependent projection and therefore jumps when the actual projection arrives.

Orthographic wheel gestures now scale the existing exact artwork without issuing worker requests during the gesture. The final camera still gets an exact render on release/idle; changes to the scene, settings, dimensions, pan or orbit continue to render. Perspective retains the existing camera model for saved-scene compatibility and uses correctly projected navigation previews without the inaccurate CSS scale. The viewport itself also keeps the selected paper background, so shrinking an SVG cannot expose a gray border that makes the paper appear to resize.

The added tests exercise twelve actual wheel events, assert unchanged SVG markup and zero new render requests during orthographic zoom, verify fixed viewport bounds and paper color while zooming out, and inject delayed worker replies to verify perspective does not apply the incorrect scale. Perspective interaction still temporarily shows a labeled wireframe, and an already-running exact render can delay its first preview, as noted above.
