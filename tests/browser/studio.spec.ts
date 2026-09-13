import { test, expect } from '@playwright/test';

test('scene reload, SVG modes, export and cancellation', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ln.studio' })).toBeVisible();
  // Load a versioned scene through the actual file picker.
  const scene = await page.evaluate(async () => {
    const types = await import('/src/lib/types.ts');
    const { CAMERA_PRESETS } = await import('/src/lib/cameras.ts');
    return {
      format: 'ln-studio',
      version: 1,
      scene: {
        nodes: [
          {
            id: 'mesh-a',
            name: 'Persisted mesh',
            type: 'mesh',
            visible: true,
            transform: types.DEFAULT_TRANSFORM,
            slicing: types.DEFAULT_SLICING,
            params: {
              format: 'obj',
              fileName: 'triangle.obj',
              data: 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3',
            },
          },
        ],
        cameras: CAMERA_PRESETS,
        renderSettings: types.DEFAULT_RENDER_SETTINGS,
        viewMode: 'single',
        activeCameraIndex: 0,
      },
    };
  });
  await page.locator('input[accept=".lnscene,.json"]').setInputFiles({
    name: 'test.lnscene',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(scene)),
  });
  await expect(page.getByText('Persisted mesh', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count())
    .toBeGreaterThan(0);
  await page.evaluate(async () => {
    const { flushSceneSave } = await import('/src/lib/store.ts');
    await flushSceneSave();
  });
  await page.reload();
  await expect(page.getByText('Persisted mesh', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count())
    .toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Generate SVG', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Download SVG', exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download SVG', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('plotter-art.svg');
  await expect(page.locator('.export-panel [role="alert"]')).toHaveCount(0);
  await page.screenshot({path:'tests/browser/studio-export.png'});
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // Use a larger fixture to keep cancellation available long enough to click.
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const t = await import('/src/lib/types.ts');
    useSceneStore.getState().addNode('cube-grid', 'Cancel fixture', {
      ...t.DEFAULT_CUBE_GRID_PARAMS,
      countX: 20,
      countY: 20,
      countZ: 20,
    });
  });
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
  await page.getByRole('button', { name: 'Generate SVG', exact: true }).click();
  await page
    .getByRole('button', { name: 'Cancel export', exact: true })
    .click();
  await expect(
    page.getByText('Export cancelled.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // Detached SVG transforms, nonzero fills, and open strokes through the parser used by imports.
  const parsed = await page.evaluate(async () => {
    const { parseSvgString } = await import('/src/lib/svg-parse.ts');
    const open = parseSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(10,20)"><path fill="none" d="M0 0 L5 0"/></g></svg>',
      0.1,
      'lines',
    );
    const filled = parseSvgString(
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H10V10H0Z M2 2H8V8H2Z"/></svg>',
      0.1,
      'regions',
    );
    return { open, filled };
  });
  expect(parsed.open.polylines).toEqual([
    [
      [10, 20],
      [15, 20],
    ],
  ]);
  expect(parsed.filled.polylines).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('six views reuse scene messages and measure worker heaps', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Original = window.Worker;
    const metrics = { scenes: 0, renders: 0 };
    (window as unknown as { workerMessages: typeof metrics }).workerMessages =
      metrics;
    window.Worker = class extends Original {
      postMessage(message: unknown, options?: StructuredSerializeOptions) {
        const m = message as { type?: string };
        if (m.type === 'scene') metrics.scenes++;
        if (m.type === 'render') metrics.renders++;
        super.postMessage(message, options);
      }
    };
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ln.studio' })).toBeVisible();
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const t = await import('/src/lib/types.ts');
    useSceneStore.getState().addNode('cube-grid', 'Memory fixture', {
      ...t.DEFAULT_CUBE_GRID_PARAMS,
      countX: 8,
      countY: 8,
      countZ: 8,
    });
    useSceneStore.getState().setViewMode('3x2');
  });
  await expect(page.locator('.viewport')).toHaveCount(6);
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  await page.waitForFunction(
    () => !document.querySelector('.viewport-rendering'),
  );
  const before = await page.evaluate(
    () =>
      (
        window as unknown as {
          workerMessages: { scenes: number; renders: number };
        }
      ).workerMessages,
  );
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().updateCamera(0, { zoom: 1.2 });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { workerMessages: { renders: number } })
            .workerMessages.renders,
      ),
    )
    .toBeGreaterThan(before.renders);
  const after = await page.evaluate(
    () =>
      (
        window as unknown as {
          workerMessages: { scenes: number; renders: number };
        }
      ).workerMessages,
  );
  expect(after.scenes).toBe(before.scenes);
  const session = await page.context().newCDPSession(page);
  await session.send('Runtime.enable');
  const heap = await session.send('Runtime.getHeapUsage');
  console.log('Main-thread heap with six views:', heap.usedSize);
  const workers = page.workers();
  console.log('Live viewport workers:', workers.length);
  const browserSession = await page.context().browser()!.newBrowserCDPSession();
  const targets = await browserSession.send('Target.getTargets');
  const heaps: number[] = [];
  for (const target of targets.targetInfos.filter(
    (t) => t.type === 'worker' && t.url.includes('render-worker'),
  )) {
    const { sessionId } = await browserSession.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: false,
    });
    const used = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Worker heap query timed out')),
        5000,
      );
      const receive = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const result = JSON.parse(event.message);
        if (result.id !== 1) return;
        clearTimeout(timer);
        browserSession.off('Target.receivedMessageFromTarget', receive);
        if (result.error) reject(new Error(result.error.message));
        else resolve(result.result.usedSize);
      };
      browserSession.on('Target.receivedMessageFromTarget', receive);
      void browserSession.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id: 1, method: 'Runtime.getHeapUsage' }),
      });
    });
    heaps.push(used);
    await browserSession.send('Target.detachFromTarget', { sessionId });
  }
  expect(heaps).toHaveLength(6);
  console.log(
    'Viewport worker heaps (bytes):',
    heaps,
    'total:',
    heaps.reduce((a, b) => a + b, 0),
  );
  await page.screenshot({ path: 'tests/browser/studio-six-views.png' });
});

test('text generation is lazy-loaded and invalid work reports a recoverable error', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ln.studio' })).toBeVisible();
  await page.getByRole('button', { name: 'T Text', exact: true }).click();
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  await expect(page.locator('.app-error')).toHaveCount(0);
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    useSceneStore.getState().clearScene();
    useSceneStore
      .getState()
      .addNode('function', 'Unsafe formula', {
        expression: 'globalThis.fetch("/unexpected")',
        bounds: { min: [-1, -1, -1], max: [1, 1, 1] },
        direction: 'below',
      });
  });
  await expect(page.locator('.viewport-stats [role="alert"]')).toContainText(
    /expression/i,
  );
  await page.evaluate(async () => {
    const { useSceneStore } = await import('/src/lib/store.ts');
    const id = useSceneStore.getState().nodes[0].id;
    useSceneStore
      .getState()
      .updateNodeParams(id, { expression: 'Math.sin(x) * Math.cos(y)' });
  });
  await expect(page.locator('.viewport-stats [role="alert"]')).toHaveCount(0);
  await expect
    .poll(() => page.locator('.viewport-svg polyline').count(), {
      timeout: 30000,
    })
    .toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
