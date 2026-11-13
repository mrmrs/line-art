const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { useViewSettings, resolvePaper, PAPER_UNIT_MM } = require(join(process.env.AUDIT_TEST_OUTPUT, 'view-settings.js'));

test('orientation swaps both physical and projection dimensions for every preset', () => {
  for (const key of ['A4', 'A4L', 'A3', 'A2', 'letter', 'tabloid', '12x18']) {
    const s = useViewSettings.getState();
    s.setPaperSize(key); s.setPaperOrientation('portrait');
    const portrait = resolvePaper(useViewSettings.getState());
    s.setPaperOrientation('landscape');
    const landscape = resolvePaper(useViewSettings.getState());
    assert.ok(portrait.widthMm <= portrait.heightMm);
    assert.equal(landscape.widthMm, portrait.heightMm);
    assert.equal(landscape.heightMm, portrait.widthMm);
    assert.equal(landscape.w, portrait.h);
    assert.equal(landscape.h, portrait.w);
  }
});

test('custom paper retains physical sizes across display units and bounded projection', () => {
  const s = useViewSettings.getState();
  s.setCustomPaperSize(8 * PAPER_UNIT_MM.in, 10 * PAPER_UNIT_MM.in);
  const paper = resolvePaper(useViewSettings.getState());
  assert.equal(paper.widthMm, 203.2); assert.equal(paper.heightMm, 254);
  for (const unit of ['mm', 'cm', 'in']) {
    s.setPaperUnit(unit);
    assert.deepEqual(resolvePaper(useViewSettings.getState()), paper);
  }
  s.setCustomPaperSize(2000, 40);
  const wide = resolvePaper(useViewSettings.getState());
  assert.equal(wide.w / wide.h, 50);
  assert.ok(wide.w <= 2400);
  const previous = useViewSettings.getState();
  for (const bad of [NaN, Infinity, 0, -10, 2001]) s.setCustomPaperSize(bad, 250);
  assert.equal(useViewSettings.getState(), previous);
});
