// Server HTTP tests with an injected planner (no real credits).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';

import { createServer } from '../server/index.mjs';

function goodPlan() {
  return {
    title: '海风把这一天留了下来',
    subtitle: 'A little place for a big memory',
    narrative: '把海岸、灯塔和月亮叠在一起，留下两个人一起看海的晚上。',
    theme: 'coast',
    palette: 'tide',
    sky: 'moon',
    motifs: ['lighthouse', 'sailboat', 'couple'],
    seed: 42,
    dedication: '和你，把日子过成风景',
    decisions: ['灯塔作为回忆的视觉锚点', '波浪串起前后景', '暖光表达安静的陪伴']
  };
}

// Start a server on an ephemeral port and return {url, close}.
function startServer(options) {
  return new Promise((resolve) => {
    const server = createServer(options);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(r))
      });
    });
  });
}

async function postPlan(url, body, headers = {}) {
  return fetch(`${url}/api/plan`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: url,
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('GET /api/health reports provider and availability', async () => {
  const s = await startServer({ planner: async () => goodPlan(), checkAi: () => true });
  try {
    const res = await fetch(`${s.url}/api/health`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.provider, 'Kiro CLI');
    assert.equal(json.aiAvailable, true);
  } finally {
    await s.close();
  }
});

test('POST /api/plan returns a validated plan', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await postPlan(s.url, { story: '一个海边的傍晚，我们看着灯塔亮起来。' });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.source, 'kiro');
    assert.equal(json.cached, false);
    assert.equal(json.plan.theme, 'coast');
    assert.equal(typeof json.elapsedMs, 'number');
  } finally {
    await s.close();
  }
});

test('POST /api/plan caches identical stories', async () => {
  let calls = 0;
  const s = await startServer({ planner: async () => { calls++; return goodPlan(); } });
  try {
    const story = { story: '一个海边的傍晚，我们看着灯塔亮起来。' };
    const first = await (await postPlan(s.url, story)).json();
    const second = await (await postPlan(s.url, story)).json();
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(calls, 1);
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects short stories', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await postPlan(s.url, { story: '短' });
    const json = await res.json();
    assert.equal(res.status, 400);
    assert.equal(json.code, 'story_short');
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects invalid plan from planner', async () => {
  const s = await startServer({ planner: async () => ({ ...goodPlan(), theme: 'space' }) });
  try {
    const res = await postPlan(s.url, { story: '一个海边的傍晚，我们看着灯塔亮起来。' });
    const json = await res.json();
    assert.equal(res.status, 502);
    assert.equal(json.code, 'plan_field_enum');
  } finally {
    await s.close();
  }
});

test('POST /api/plan enforces single concurrent request (429)', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const planner = async () => { await gate; return goodPlan(); };
  const s = await startServer({ planner });
  try {
    const p1 = postPlan(s.url, { story: '第一个足够长的海边故事内容。' });
    // Give the first request time to acquire the lock.
    await new Promise((r) => setTimeout(r, 50));
    const res2 = await postPlan(s.url, { story: '第二个不同的海边故事内容。' });
    assert.equal(res2.status, 429);
    assert.equal((await res2.json()).code, 'busy');
    release();
    const res1 = await p1;
    assert.equal(res1.status, 200);
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects non-JSON content type', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await fetch(`${s.url}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: s.url },
      body: 'hello'
    });
    assert.equal(res.status, 415);
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects cross-origin requests', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await postPlan(s.url, { story: '一个海边的傍晚故事内容。' }, {
      origin: 'http://evil.example.com'
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'forbidden_origin');
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects same-host mismatched origin port', async () => {
  // This demo serves the frontend on the same port; a Vite dev server on a
  // different local port must be rejected just like an external origin.
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const { port } = new URL(s.url);
    const otherPort = Number(port) === 5173 ? 5174 : 5173;
    const res = await postPlan(s.url, { story: '一个海边的傍晚故事内容。' }, {
      origin: `http://127.0.0.1:${otherPort}`
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'forbidden_origin');
  } finally {
    await s.close();
  }
});

test('POST /api/plan rejects malformed JSON body', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await postPlan(s.url, '{ not json');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'bad_json');
  } finally {
    await s.close();
  }
});

test('unknown /api route returns 404', async () => {
  const s = await startServer({ planner: async () => goodPlan() });
  try {
    const res = await fetch(`${s.url}/api/nope`);
    assert.equal(res.status, 404);
  } finally {
    await s.close();
  }
});

test('static request without dist falls through to 404', async () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-empty-'));
  const s = await startServer({ planner: async () => goodPlan(), distDir: emptyDir });
  try {
    // No dist build in test env; path traversal must not escape.
    const res = await fetch(`${s.url}/../server/index.mjs`);
    assert.notEqual(res.status, 200);
  } finally {
    await s.close();
    fs.rmSync(emptyDir, {recursive:true,force:true});
  }
});

test('static serving stays contained after dist exists (injected fixture)', async () => {
  // Remains valid whether or not a real ../dist has been built: we inject a
  // fixture dir and assert containment rather than a fixed status code.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-dist-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>ok</title>');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
  // A secret sibling outside the dist dir that must never be reachable.
  const secret = path.join(os.tmpdir(), `mt-secret-${Date.now()}.txt`);
  fs.writeFileSync(secret, 'SECRET');

  const s = await startServer({ planner: async () => goodPlan(), distDir: dir });
  try {
    const idx = await fetch(`${s.url}/`);
    assert.equal(idx.status, 200);
    assert.match(await idx.text(), /ok/);

    const js = await fetch(`${s.url}/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type') || '', /javascript/);

    // Traversal attempts must never escape the dist dir.
    const escaped = await fetch(`${s.url}/%2e%2e%2f%2e%2e%2f${path.basename(secret)}`);
    const body = escaped.status === 200 ? await escaped.text() : '';
    assert.ok(!body.includes('SECRET'), 'must not serve files outside dist');

    // Unknown route falls back to the contained index.html (SPA).
    const spa = await fetch(`${s.url}/some/deep/route`);
    assert.equal(spa.status, 200);
    assert.match(await spa.text(), /ok/);
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(secret, { force: true });
  }
});

test('client disconnect aborts the planner via injected signal', async () => {
  // A signal-aware delayed planner: resolves only if not aborted first.
  let sawAbort = false;
  const planner = (story, { signal }) => new Promise((resolve, reject) => {
    if (signal && signal.aborted) { sawAbort = true; reject(new Error('aborted')); return; }
    const t = setTimeout(() => resolve(goodPlan()), 2000);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(t);
        sawAbort = true;
        reject(new Error('aborted'));
      }, { once: true });
    }
  });
  const s = await startServer({ planner });
  try {
    const { hostname, port } = new URL(s.url);
    // Raw socket so we can send a request then hard-close mid-flight.
    const sock = net.connect(Number(port), hostname);
    const body = JSON.stringify({ story: '一个足够长的海边傍晚故事内容。' });
    await new Promise((r) => sock.once('connect', r));
    sock.write(
      'POST /api/plan HTTP/1.1\r\n' +
      `Host: ${hostname}:${port}\r\n` +
      `Origin: http://${hostname}:${port}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n` +
      '\r\n' +
      body
    );
    // Let the server acquire the lock and start the planner, then disconnect.
    await new Promise((r) => setTimeout(r, 100));
    sock.destroy();
    // Wait for the abort to propagate to the planner.
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(sawAbort, true, 'planner should observe the abort signal');

    // Busy lock must reset: a fresh request succeeds afterwards.
    const res = await postPlan(s.url, { story: '断线之后的另一个海边故事内容。' });
    assert.equal(res.status, 200);
  } finally {
    await s.close();
  }
});

test('normal request with delayed planner is not aborted', async () => {
  // The same signal-aware delayed planner, but the client waits for the full
  // response. The request 'close' from body end must NOT abort it.
  let aborted = false;
  const planner = (story, { signal }) => new Promise((resolve) => {
    const t = setTimeout(() => resolve(goodPlan()), 120);
    if (signal) {
      signal.addEventListener('abort', () => { aborted = true; clearTimeout(t); }, { once: true });
    }
  });
  const s = await startServer({ planner });
  try {
    const res = await postPlan(s.url, { story: '完整等待完成的海边傍晚故事内容。' });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(aborted, false, 'body-finish close must not abort a live request');
    assert.equal(json.plan.theme, 'coast');
  } finally {
    await s.close();
  }
});
