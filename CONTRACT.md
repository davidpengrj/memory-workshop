# 拾光剧场 / Memory Theatre — build contract

Hackathon MVP: transform a short personal memory into a physically connected layered shadow-box design. Local-first demo, no hardware or paid API key required. True AI via user's installed and authenticated Kiro CLI. Preset examples are explicitly labeled examples, never masqueraded as fresh AI output.

## Plan schema

```json
{
  "title": "海风把这一天留了下来",
  "subtitle": "A little place for a big memory",
  "narrative": "把海岸、灯塔和月亮叠在一起，留下两个人一起看海的晚上。",
  "theme": "coast",
  "palette": "tide",
  "sky": "moon",
  "motifs": ["lighthouse", "sailboat", "couple"],
  "seed": 42,
  "dedication": "和你，把日子过成风景",
  "decisions": ["灯塔作为回忆的视觉锚点", "波浪串起前后景", "暖光表达安静的陪伴"]
}
```

Allowed themes: coast, mountain, city, garden. Palettes: tide, dusk, forest, rose. Sky: moon, sun, stars. Motifs 1-4 unique from: lighthouse, sailboat, couple, cat, dog, house, pagoda, arch, trees, flowers, mountain, bridge. Title <=30 chars, subtitle <=80, narrative <=220, dedication <=40, decisions exactly 3 nonempty strings <=100 chars each. Seed integer 1..999999. These are bounded declarative scene parameters; never code or SVG from AI. Client owns deterministic physical geometry generation.

## Server API — owned by Kiro

Node ESM, no dependencies beyond Node core. Bind 127.0.0.1:4177 (PORT override). Serve ../dist with safe path handling, MIME types and SPA fallback. No arbitrary local file serving. Export createServer(options) for tests; only listen when invoked directly.

GET /api/health → {ok:true, aiAvailable:boolean, provider:'Kiro CLI'} (check CLI availability, no model call).
POST /api/plan {story:string} → {plan: validatedPlan, source:'kiro', elapsedMs:number}. story 8..1200 Unicode chars after trimming. Use spawn argument array (never shell), kiro-cli chat --agent memory-planner --no-interactive --trust-tools '' prompt; cwd project root. User story explicitly untrusted data. timeout 100 seconds, maximum output 256KB, enforce one concurrent model request / return 429 busy. Kill process on timeout/client disconnect, ensure busy reset. Parse JSON object from plain or fenced response robustly, allow surrounding terminal text, validate schema independently. Reject invalid or extra unsafe fields. Errors meaningful Chinese {error,code}; never silent demo fallback. No personal story in console logs. Basic same-origin localhost protection (Origin, Host, JSON content type) to avoid unintended credit spend. Cache up to 12 recent successful exact stories in memory to save credits; tell response if cached. No durable secrets/storage. Include tests with injected planner function (no real credits during tests) and validation tests in tests/server.test.mjs and tests/planner.test.mjs.

Kiro owns ONLY server/** and tests/server.test.mjs, tests/planner.test.mjs. Parent owns frontend, geometry, all other tests/config/docs and .kiro agents. You are not alone in this codebase; don't revert or edit others' work. No install commands, no autonomous subagents, no broad refactoring. Work with read/write tools.

## Main implementation

React/Vite, handcrafted CSS, Three.js preview from same polygons as exports. Polygon boolean geometry engine: rectangular frame united with ground silhouettes, ground-attached motifs. Five display layers + one solid backing; spacer rings between scenes; glue assembly (no kerf-sensitive press fits). Physical sizes 140,180,220 mm; 3mm plywood or 1.5mm card; minimum bridges explicit. Export ZIP: separate cut SVGs in mm with red closed cut paths, spacer/backing SVG, assembly HTML printable instructions, scene.json, validation.json and colored preview SVG. No machining parameters guessed; requires material test cut. No claim physically tested. 3D lighting is illustrative.
