const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { createCounterClient, COUNTER_KEYS } = require(join(process.env.AUDIT_TEST_OUTPUT, 'counters.js'));
const response = (body, status = 200) => new Response(body, { status });

test('initial counters load once, use GET text and publish all keys', async () => {
  const calls = [], client = createCounterClient(async (url, options) => {
    calls.push({ url, options }); return response(' 42\n');
  });
  await Promise.all([client.load(), client.load()]);
  assert.equal(calls.length, 4);
  for (const key of COUNTER_KEYS) assert.equal(client.getSnapshot()[key], 42);
  for (const { url, options } of calls) {
    assert.equal(options.method, 'GET');
    assert.ok(COUNTER_KEYS.includes(new URL(url).searchParams.get('name')));
    assert.equal(options.body, undefined);
  }
});

test('successful increment posts once then refreshes count', async () => {
  const calls = [], client = createCounterClient(async (url, options) => {
    calls.push({ url, options }); return response(options.method === 'POST' ? 'ok' : '43');
  });
  await client.increment('SKULLCAT_SVG_EXPORT');
  assert.deepEqual(calls.map(c => c.options.method), ['POST', 'GET']);
  assert.equal(calls[0].url, 'https://ts-gen-count.adam-f8f.workers.dev/increment?name=SKULLCAT_SVG_EXPORT');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(client.getSnapshot().SKULLCAT_SVG_EXPORT, 43);
});

test('offline and HTTP failures never reject, retry POST, or invent totals', async () => {
  for (const failure of [() => { throw new Error('offline'); }, () => response('failed', 503)]) {
    let calls = 0;
    const client = createCounterClient(async () => { calls++; return failure(); });
    await client.increment('SKULLCAT_OBJ_IMPORT');
    assert.equal(calls, 1);
    assert.deepEqual(client.getSnapshot(), {});
  }
  const malformed = createCounterClient(async () => response('{"count":42}'));
  await malformed.load();
  assert.deepEqual(malformed.getSnapshot(), {});
});

test('late initial responses cannot overwrite newer counts', async () => {
  let release;
  let exportGets = 0;
  const client = createCounterClient(async (url, options) => {
    if (options.method === 'POST') return response('ok');
    if (url.includes('SVG_EXPORT') && exportGets++ === 0) return new Promise(resolve => { release = resolve; });
    return response('20');
  });
  const initial = client.load();
  await client.increment('SKULLCAT_SVG_EXPORT');
  release(response('19'));
  await initial;
  assert.equal(client.getSnapshot().SKULLCAT_SVG_EXPORT, 20);
});
