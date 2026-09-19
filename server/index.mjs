// Memory Theatre local server. Node ESM, Node core only.
// Serves ../dist and exposes /api/health and /api/plan.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { validateStory, validatePlan, defaultPlanner, PlanError } from './plan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(PROJECT_ROOT, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8'
};

const MAX_BODY_BYTES = 64 * 1024;
const CACHE_LIMIT = 12;

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length
  });
  res.end(body);
}

function sendError(res, status, error, code) {
  sendJson(res, status, { error, code });
}

// Default availability probe: does `kiro-cli` exist? No model call.
function defaultCheckAi() {
  try {
    const r = spawnSync('kiro-cli', ['--version'], {
      stdio: 'ignore',
      timeout: 5000
    });
    // ENOENT (binary missing) surfaces as r.error; a launched CLI has none.
    return r.error == null && r.status === 0;
  } catch {
    return false;
  }
}

// Basic same-origin localhost protection to avoid unintended credit spend.
// This production demo serves the frontend on the same port, so the Origin
// (when present) must match the request Host exactly — including the port.
// A mismatched port on the same host (e.g. a Vite dev server on another port)
// is rejected just like an external origin.
function isSameOriginLocalhost(req) {
  const host = req.headers.host || '';
  const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
  if (!hostOk) return false;

  const origin = req.headers.origin;
  if (origin) {
    let u;
    try {
      u = new URL(origin);
    } catch {
      return false;
    }
    const h = u.hostname;
    if (!(h === '127.0.0.1' || h === 'localhost' || h === '::1')) {
      return false;
    }
    // Compare the Origin's host authority against the request Host header.
    // origin.host already carries the port (or none for default 80/443);
    // require an exact match so a different port is rejected.
    if (u.host !== host) {
      return false;
    }
  }
  return true;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new PlanError('请求体过大。', 'body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Resolve a URL path to a safe file inside distDir, or null if unsafe/missing.
async function resolveStatic(distDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const rel = decoded.replace(/^\/+/, '');
  const abs = path.resolve(distDir, rel);
  // Ensure the resolved path stays within distDir.
  if (abs !== distDir && !abs.startsWith(distDir + path.sep)) {
    return null;
  }
  try {
    const st = await fsp.stat(abs);
    if (st.isDirectory()) {
      const indexPath = path.join(abs, 'index.html');
      if (fs.existsSync(indexPath)) return indexPath;
      return null;
    }
    return abs;
  } catch {
    return null;
  }
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': type });
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  stream.pipe(res);
}

async function serveStatic(distDir, req, res) {
  const filePath = await resolveStatic(distDir, req.url || '/');
  if (filePath) {
    serveFile(res, filePath);
    return;
  }
  // SPA fallback to index.html for non-API GET routes.
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    serveFile(res, indexPath);
    return;
  }
  sendError(res, 404, '资源不存在。', 'not_found');
}

export function createServer(options = {}) {
  const planner = options.planner || defaultPlanner;
  const checkAi = options.checkAi || defaultCheckAi;
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  // Injectable so tests can point at a fixture dir; defaults to ../dist.
  const distDir = options.distDir ? path.resolve(options.distDir) : DIST_DIR;

  // In-memory single-flight lock + small LRU-ish cache.
  let busy = false;
  const cache = new Map(); // story -> plan

  function cacheGet(story) {
    if (!cache.has(story)) return null;
    const plan = cache.get(story);
    // refresh recency
    cache.delete(story);
    cache.set(story, plan);
    return plan;
  }

  function cacheSet(story, plan) {
    if (cache.has(story)) cache.delete(story);
    cache.set(story, plan);
    while (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  async function handlePlan(req, res) {
    if (req.method !== 'POST') {
      sendError(res, 405, '方法不被允许。', 'method_not_allowed');
      return;
    }
    if (!isSameOriginLocalhost(req)) {
      sendError(res, 403, '仅允许本机同源访问。', 'forbidden_origin');
      return;
    }
    const ctype = (req.headers['content-type'] || '').toLowerCase();
    if (!ctype.includes('application/json')) {
      sendError(res, 415, '请求需要 JSON 内容类型。', 'unsupported_media_type');
      return;
    }

    let raw;
    try {
      raw = await readBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const e = err instanceof PlanError ? err : new PlanError('读取请求失败。', 'body_error');
      sendError(res, 413, e.message, e.code);
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      sendError(res, 400, '请求不是有效的 JSON。', 'bad_json');
      return;
    }

    let story;
    try {
      story = validateStory(parsed && parsed.story);
    } catch (err) {
      sendError(res, 400, err.message, err.code || 'story_invalid');
      return;
    }

    // Cache hit: no credit spend.
    const cached = cacheGet(story);
    if (cached) {
      sendJson(res, 200, {
        plan: cached,
        source: 'kiro',
        elapsedMs: 0,
        cached: true
      });
      return;
    }

    if (busy) {
      sendError(res, 429, 'AI 正在处理另一个请求，请稍候。', 'busy');
      return;
    }
    busy = true;

    const controller = new AbortController();
    // A request 'close' can fire when the request body finishes streaming,
    // well before the model responds. Watch the *response* close instead and
    // only abort if the response has not been fully written (a real client
    // disconnect), never on a normal completed request.
    const onClose = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on('close', onClose);

    const started = Date.now();
    try {
      const rawPlan = await planner(story, { projectRoot, signal: controller.signal });
      const plan = validatePlan(rawPlan);
      const elapsedMs = Date.now() - started;
      cacheSet(story, plan);
      if (!res.writableEnded) {
        sendJson(res, 200, { plan, source: 'kiro', elapsedMs, cached: false });
      }
    } catch (err) {
      if (res.writableEnded) return;
      if (err instanceof PlanError) {
        const status = err.code === 'aborted' ? 499 : 502;
        sendError(res, status, err.message, err.code);
      } else {
        sendError(res, 502, 'AI 规划失败，请稍后再试。', 'plan_failed');
      }
    } finally {
      busy = false;
      res.removeListener('close', onClose);
    }
  }

  function handleHealth(req, res) {
    let aiAvailable = false;
    try {
      aiAvailable = Boolean(checkAi());
    } catch {
      aiAvailable = false;
    }
    sendJson(res, 200, { ok: true, aiAvailable, provider: 'Kiro CLI' });
  }

  const server = http.createServer((req, res) => {
    const url = req.url || '/';
    const pathname = url.split('?')[0];

    if (pathname === '/api/health') {
      handleHealth(req, res);
      return;
    }
    if (pathname === '/api/plan') {
      handlePlan(req, res).catch(() => {
        if (!res.writableEnded) sendError(res, 500, '服务器内部错误。', 'internal');
      });
      return;
    }
    if (pathname.startsWith('/api/')) {
      sendError(res, 404, '接口不存在。', 'not_found');
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(distDir, req, res).catch(() => {
        if (!res.writableEnded) sendError(res, 500, '服务器内部错误。', 'internal');
      });
      return;
    }
    sendError(res, 405, '方法不被允许。', 'method_not_allowed');
  });

  return server;
}

// Only listen when invoked directly.
const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const port = Number(process.env.PORT) || 4177;
  const server = createServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Memory Theatre server on http://127.0.0.1:${port}`);
  });
}
