// 拾光工坊 — 材料反向设计：零件展开与有限库存排版。
// 纯函数、无外部依赖、浏览器兼容 ESM。
// 约束意象的参数化剧场：每个成品六层图案 + 五个间隔框（环或长条）。
// 排版使用确定性的 MaxRects 空闲矩形启发式，允许 90 度旋转零件与整张板。
// 不宣称全局最优；不在图案孔洞内套料；不悄悄补库存或缩放零件。

const SUPPORTED_SIZES = [140, 180, 220];
const LAYER_COUNT = 6; // layerId 0..5
const SPACER_FRAMES = 5; // 五个间隔框

// ---------------------------------------------------------------------------
// 零件展开
// ---------------------------------------------------------------------------

// 校验成品参数并返回规范化数值。非法输入抛出中文 Error。
function normalizeMakeArgs(size, quantity, mode) {
  if (!SUPPORTED_SIZES.includes(size)) {
    throw new Error(`成品尺寸必须是 ${SUPPORTED_SIZES.join('/')} 毫米之一，收到：${String(size)}`);
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 6) {
    throw new Error(`成品数量必须是 1 到 6 的整数，收到：${String(quantity)}`);
  }
  if (mode !== 'rings' && mode !== 'strips') {
    throw new Error(`间隔模式必须是 rings 或 strips，收到：${String(mode)}`);
  }
  return { size, quantity, mode };
}

// 展开单个或多个成品的全部零件。unit 从 1 起编号，id 全局唯一。
export function makeParts(size, quantity = 1, mode = 'strips') {
  normalizeMakeArgs(size, quantity, mode);
  const parts = [];
  for (let unit = 1; unit <= quantity; unit++) {
    // 六层方形图案。
    for (let layerId = 0; layerId < LAYER_COUNT; layerId++) {
      parts.push({
        id: `u${unit}-layer-${layerId}`,
        name: `成品${unit} 图案层${layerId + 1}`,
        width: size,
        height: size,
        kind: 'layer',
        layerId,
        unit,
      });
    }
    // 间隔材料。
    if (mode === 'rings') {
      // 每个成品五块 size×size 的整块间隔板（后续由 Codex 挖框，套料只按外接矩形）。
      for (let frame = 0; frame < SPACER_FRAMES; frame++) {
        parts.push({
          id: `u${unit}-spacer-${frame}`,
          name: `成品${unit} 间隔环${frame + 1}`,
          width: size,
          height: size,
          kind: 'spacer',
          unit,
        });
      }
    } else {
      // strips：每框 4 根长条（2 长 + 2 短），端部对接组成外 size / 内 size*.9 的方框。
      // 五框共 10 根长条 size×(size*.05) 与 10 根短条 (size*.9)×(size*.05)。
      const longW = size;
      const shortW = round3(size * 0.9);
      const stripH = round3(size * 0.05);
      for (let frame = 0; frame < SPACER_FRAMES; frame++) {
        // 两根长条（上、下边）。
        for (let i = 0; i < 2; i++) {
          parts.push({
            id: `u${unit}-strip-long-${frame}-${i}`,
            name: `成品${unit} 框${frame + 1} 长条${i + 1}`,
            width: longW,
            height: stripH,
            kind: 'strip',
            unit,
          });
        }
        // 两根短条（左、右边，端部与长条对接，缩短一个条宽）。
        for (let i = 0; i < 2; i++) {
          parts.push({
            id: `u${unit}-strip-short-${frame}-${i}`,
            name: `成品${unit} 框${frame + 1} 短条${i + 1}`,
            width: shortW,
            height: stripH,
            kind: 'strip',
            unit,
          });
        }
      }
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------
// 有限库存排版
// ---------------------------------------------------------------------------

const MAX_PARTS = 156;
const MAX_STOCK_ROWS = 8;
const MAX_TOTAL_SHEETS = 40;
const SHEET_MIN = 20;
const SHEET_MAX = 1000;
const BED_MIN = 20;
const BED_MAX = 1000;

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

// 校验并规范化 options。
function normalizeOptions(options) {
  const o = options && typeof options === 'object' ? options : {};
  const bedWidth = o.bedWidth === undefined ? 400 : o.bedWidth;
  const bedHeight = o.bedHeight === undefined ? 415 : o.bedHeight;
  const margin = o.margin === undefined ? 4 : o.margin;
  const gap = o.gap === undefined ? 3 : o.gap;
  for (const [k, v] of [['bedWidth', bedWidth], ['bedHeight', bedHeight], ['margin', margin], ['gap', gap]]) {
    if (!isFiniteNumber(v)) throw new Error(`排版参数 ${k} 必须是有限数字，收到：${String(v)}`);
  }
  if (bedWidth < BED_MIN || bedWidth > BED_MAX || bedHeight < BED_MIN || bedHeight > BED_MAX) {
    throw new Error(`设备床尺寸必须在 ${BED_MIN}..${BED_MAX} 毫米之间`);
  }
  if (margin < 0 || margin > 20) throw new Error('边距 margin 必须在 0..20 毫米之间');
  if (gap < 1 || gap > 15) throw new Error('间距 gap 必须在 1..15 毫米之间');
  return { bedWidth, bedHeight, margin, gap };
}

// 校验零件数组。
function validateParts(parts) {
  if (!Array.isArray(parts)) throw new Error('零件必须是数组');
  if (parts.length > MAX_PARTS) throw new Error(`零件数量不能超过 ${MAX_PARTS} 个，收到：${parts.length}`);
  const seen = new Set();
  for (const p of parts) {
    if (!p || typeof p !== 'object') throw new Error('每个零件必须是对象');
    if (!isFiniteNumber(p.width) || !isFiniteNumber(p.height)) {
      throw new Error(`零件 ${String(p.id)} 的宽高必须是有限数字`);
    }
    if (p.width <= 0 || p.height <= 0) throw new Error(`零件 ${String(p.id)} 的宽高必须为正`);
    if (p.id === undefined || p.id === null || p.id === '') throw new Error('每个零件必须有非空 id');
    if (seen.has(p.id)) throw new Error(`零件 id 重复：${String(p.id)}`);
    seen.add(p.id);
  }
}

// 校验库存行数组，返回规范化后的库存行。
function validateStocks(stocks) {
  if (!Array.isArray(stocks)) throw new Error('库存必须是数组');
  if (stocks.length > MAX_STOCK_ROWS) throw new Error(`库存行不能超过 ${MAX_STOCK_ROWS} 行，收到：${stocks.length}`);
  const seen = new Set();
  let total = 0;
  const rows = [];
  for (const s of stocks) {
    if (!s || typeof s !== 'object') throw new Error('每个库存行必须是对象');
    if (!isFiniteNumber(s.width) || !isFiniteNumber(s.height)) {
      throw new Error(`库存 ${String(s.id)} 的宽高必须是有限数字`);
    }
    if (s.width < SHEET_MIN || s.width > SHEET_MAX || s.height < SHEET_MIN || s.height > SHEET_MAX) {
      throw new Error(`库存 ${String(s.id)} 的板长宽必须在 ${SHEET_MIN}..${SHEET_MAX} 毫米之间`);
    }
    if (!Number.isInteger(s.count) || s.count < 0) {
      throw new Error(`库存 ${String(s.id)} 的数量必须是非负整数，收到：${String(s.count)}`);
    }
    if (s.id === undefined || s.id === null || s.id === '') throw new Error('每个库存行必须有非空 id');
    if (seen.has(s.id)) throw new Error(`库存 id 重复：${String(s.id)}`);
    seen.add(s.id);
    total += s.count;
    rows.push({
      id: s.id,
      name: s.name === undefined ? String(s.id) : s.name,
      width: s.width,
      height: s.height,
      count: s.count,
      reclaimed: Boolean(s.reclaimed),
    });
  }
  if (total > MAX_TOTAL_SHEETS) throw new Error(`总板数量不能超过 ${MAX_TOTAL_SHEETS} 张，收到：${total}`);
  return rows;
}

// MaxRects：单张板维护一组不重叠的空闲矩形。放入零件后切分被覆盖的空闲矩形。
class Sheet {
  constructor(stock, options, sheetSeq, bedW, bedH) {
    this.id = `sheet-${sheetSeq}`;
    this.stockId = stock.id;
    this.name = stock.name;
    this.width = stock.width;
    this.height = stock.height;
    this.reclaimed = stock.reclaimed;
    this.placements = [];
    this.margin = options.margin;
    this.gap = options.gap;
    // 有效工作区：受 margin 收缩，且不超过设备床尺寸（板本身已确认可放入床内）。
    const usableW = Math.min(this.width, bedW) - 2 * options.margin;
    const usableH = Math.min(this.height, bedH) - 2 * options.margin;
    // 实际可放零件净尺寸的上限（用于校验：零件真实边界必须落在 margin 内）。
    this.usableW = usableW;
    this.usableH = usableH;
    // gap 只在零件之间需要，不在板边之后。因此工作矩形在右、下各预留一个 gap 的
    // 尾部余量：零件占地按 (w+gap)×(h+gap) 计入以保证相邻件间距，但靠板边的最后
    // 一件其尾部 gap 落在这段“余量”里（板外没有邻居），从而不会浪费一条边。
    // 由 (w+gap) <= usableW+gap 可得 w <= usableW，零件真实边界始终 <= 板边减 margin。
    this.free = [];
    if (usableW > 0 && usableH > 0) {
      this.free.push({ x: options.margin, y: options.margin, width: usableW + options.gap, height: usableH + options.gap });
    }
  }

  // 找到最佳空闲矩形放置 w×h（Best Short Side Fit）。返回 {x,y} 或 null。
  findPosition(w, h) {
    let best = null;
    let bestShort = Infinity;
    let bestLong = Infinity;
    for (const fr of this.free) {
      if (fr.width + 1e-6 >= w && fr.height + 1e-6 >= h) {
        const leftoverH = fr.width - w;
        const leftoverV = fr.height - h;
        const shortSide = Math.min(leftoverH, leftoverV);
        const longSide = Math.max(leftoverH, leftoverV);
        if (shortSide < bestShort - 1e-9 || (Math.abs(shortSide - bestShort) < 1e-9 && longSide < bestLong - 1e-9)) {
          best = { x: fr.x, y: fr.y };
          bestShort = shortSide;
          bestLong = longSide;
        }
      }
    }
    return best;
  }

  // 放入零件占地 w×h（含 gap 的外接框），落在 x,y。切分空闲矩形并去除被包含者。
  place(x, y, w, h) {
    const used = { x, y, width: w, height: h };
    const next = [];
    for (const fr of this.free) {
      if (!intersects(fr, used)) {
        next.push(fr);
        continue;
      }
      // 用 used 切割 fr，生成最多四个子矩形。
      // 左
      if (used.x > fr.x + 1e-9) {
        next.push({ x: fr.x, y: fr.y, width: used.x - fr.x, height: fr.height });
      }
      // 右
      const usedRight = used.x + used.width;
      const frRight = fr.x + fr.width;
      if (usedRight < frRight - 1e-9) {
        next.push({ x: usedRight, y: fr.y, width: frRight - usedRight, height: fr.height });
      }
      // 上
      if (used.y > fr.y + 1e-9) {
        next.push({ x: fr.x, y: fr.y, width: fr.width, height: used.y - fr.y });
      }
      // 下
      const usedBottom = used.y + used.height;
      const frBottom = fr.y + fr.height;
      if (usedBottom < frBottom - 1e-9) {
        next.push({ x: fr.x, y: usedBottom, width: fr.width, height: frBottom - usedBottom });
      }
    }
    this.free = pruneContained(next);
  }
}

function intersects(a, b) {
  return a.x < b.x + b.width - 1e-9 && a.x + a.width > b.x + 1e-9 &&
    a.y < b.y + b.height - 1e-9 && a.y + a.height > b.y + 1e-9;
}

function contains(outer, inner) {
  return inner.x >= outer.x - 1e-9 && inner.y >= outer.y - 1e-9 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-9;
}

// 去掉被其它空闲矩形完全包含的冗余矩形，避免空闲集合膨胀。
function pruneContained(rects) {
  const kept = [];
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r.width <= 1e-9 || r.height <= 1e-9) continue;
    let contained = false;
    for (let j = 0; j < rects.length; j++) {
      if (i === j) continue;
      const other = rects[j];
      if (other.width <= 1e-9 || other.height <= 1e-9) continue;
      if (contains(other, r) && !(i > j && contains(r, other))) {
        contained = true;
        break;
      }
    }
    if (!contained) kept.push(r);
  }
  return kept;
}

// 判断库存行是否能在设备床上放下（可整张旋转）。返回 'normal' | 'rotated' | false。
function stockFitsBed(stock, bedW, bedH) {
  if (stock.width <= bedW + 1e-9 && stock.height <= bedH + 1e-9) return 'normal';
  if (stock.height <= bedW + 1e-9 && stock.width <= bedH + 1e-9) return 'rotated';
  return false;
}

export function packParts(parts, stocks, options = {}) {
  validateParts(parts);
  const stockRows = validateStocks(stocks);
  const opt = normalizeOptions(options);
  const { bedWidth, bedHeight, margin, gap } = opt;

  const rejectedStocks = [];

  // 构建可用板池：展开每行 count 张，记录旋转后的实际可用尺寸。确定性顺序：
  // 先 reclaimed 余料，再普通板；行内保持输入顺序。
  const usable = [];
  const ordered = stockRows
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      if (a.s.reclaimed !== b.s.reclaimed) return a.s.reclaimed ? -1 : 1;
      return a.idx - b.idx;
    });
  for (const { s } of ordered) {
    const fit = stockFitsBed(s, bedWidth, bedHeight);
    if (!fit) {
      rejectedStocks.push({ id: s.id, name: s.name, reason: '超出设备床尺寸，两个方向均放不下' });
      continue;
    }
    // 若需旋转整张板，交换板的宽高作为工作尺寸。
    const w = fit === 'rotated' ? s.height : s.width;
    const h = fit === 'rotated' ? s.width : s.height;
    for (let c = 0; c < s.count; c++) {
      usable.push({ stock: { ...s, width: w, height: h }, reclaimed: s.reclaimed });
    }
  }

  // 零件排序：面积大者优先（确定性，area 相同按 id 字典序）。
  const sortedParts = parts
    .map((p) => ({ ...p }))
    .sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (Math.abs(areaA - areaB) > 1e-6) return areaB - areaA;
      const ma = Math.max(a.width, a.height);
      const mb = Math.max(b.width, b.height);
      if (Math.abs(ma - mb) > 1e-6) return mb - ma;
      return String(a.id).localeCompare(String(b.id));
    });

  const openSheets = [];
  let sheetSeq = 0;
  let nextUsableIdx = 0;
  const unplaced = [];

  // 每个零件的占地包含 gap：宽高各加一个 gap，使相邻零件间隔至少 gap。
  // 首个靠 margin 边的零件也隔开，保证与边界不粘连；等价于统一膨胀。
  for (const part of sortedParts) {
    const placed = tryPlacePart(part);
    if (!placed) unplaced.push(stripInternal(part));
  }

  function tryPlacePart(part) {
    const w = part.width;
    const h = part.height;
    const footW = w + gap;
    const footH = h + gap;
    const rotFootW = h + gap;
    const rotFootH = w + gap;

    // 1) 尝试已打开的板（优先 reclaimed，再打开顺序）。
    const candidates = openSheets.slice().sort((a, b) => {
      if (a.reclaimed !== b.reclaimed) return a.reclaimed ? -1 : 1;
      return a.seq - b.seq;
    });
    for (const sheet of candidates) {
      if (attemptOnSheet(sheet, part, w, h, footW, footH, rotFootW, rotFootH)) return true;
    }

    // 2) 尽量少开新板：按可用板池顺序（reclaimed 已排在前）逐张开新板尝试。
    while (nextUsableIdx < usable.length) {
      const slot = usable[nextUsableIdx++];
      const sheet = new Sheet(slot.stock, opt, ++sheetSeq, bedWidth, bedHeight);
      sheet.seq = sheetSeq;
      openSheets.push(sheet);
      if (attemptOnSheet(sheet, part, w, h, footW, footH, rotFootW, rotFootH)) return true;
      // 新板都放不下该零件（例如零件比板还大），继续尝试下一张板。
    }
    return false;
  }

  function attemptOnSheet(sheet, part, w, h, footW, footH, rotFootW, rotFootH) {
    // 优先无旋转，若旋转能得到更贴合位置则比较；此处采用确定性策略：
    // 分别求两方向最佳位置，选 short-side 更优者；相等则不旋转。
    const posNormal = sheet.findPosition(footW, footH);
    const posRot = w === h ? null : sheet.findPosition(rotFootW, rotFootH);

    let choice = null;
    if (posNormal && posRot) {
      const sn = scorePosition(sheet, posNormal, footW, footH);
      const sr = scorePosition(sheet, posRot, rotFootW, rotFootH);
      choice = sr < sn - 1e-9 ? { pos: posRot, rotated: true, fw: rotFootW, fh: rotFootH }
        : { pos: posNormal, rotated: false, fw: footW, fh: footH };
    } else if (posNormal) {
      choice = { pos: posNormal, rotated: false, fw: footW, fh: footH };
    } else if (posRot) {
      choice = { pos: posRot, rotated: true, fw: rotFootW, fh: rotFootH };
    }
    if (!choice) return false;

    sheet.place(choice.pos.x, choice.pos.y, choice.fw, choice.fh);
    const placeW = choice.rotated ? h : w;
    const placeH = choice.rotated ? w : h;
    const placement = {
      ...stripInternal(part),
      x: round3(choice.pos.x),
      y: round3(choice.pos.y),
      rotated: choice.rotated,
      width: round3(placeW),
      height: round3(placeH),
    };
    if (choice.rotated) {
      placement.originalWidth = round3(w);
      placement.originalHeight = round3(h);
    }
    sheet.placements.push(placement);
    return true;
  }

  function scorePosition(sheet, pos, fw, fh) {
    // best short side fit 分数：找到与该位置对应的空闲矩形的短边剩余。
    let best = Infinity;
    for (const fr of sheet.free) {
      if (Math.abs(fr.x - pos.x) < 1e-6 && Math.abs(fr.y - pos.y) < 1e-6 &&
        fr.width + 1e-6 >= fw && fr.height + 1e-6 >= fh) {
        best = Math.min(best, Math.min(fr.width - fw, fr.height - fh));
      }
    }
    return best;
  }

  // 只保留已使用的板。
  const usedSheets = openSheets.filter((s) => s.placements.length > 0);

  // 统计。
  let partArea = 0;
  let placedCount = 0;
  for (const sheet of usedSheets) {
    for (const pl of sheet.placements) {
      placedCount++;
      partArea += pl.width * pl.height;
    }
  }
  let sheetArea = 0;
  let newSheetCount = 0;
  let reclaimedSheetCount = 0;
  for (const sheet of usedSheets) {
    sheetArea += sheet.width * sheet.height;
    if (sheet.reclaimed) reclaimedSheetCount++; else newSheetCount++;
  }
  const utilization = sheetArea > 0 ? round3(Math.min(1, partArea / sheetArea)) : 0;

  const sheets = usedSheets.map((s) => ({
    id: s.id,
    stockId: s.stockId,
    name: s.name,
    width: s.width,
    height: s.height,
    reclaimed: s.reclaimed,
    placements: s.placements,
  }));

  return {
    sheets,
    unplaced,
    stats: {
      sheetCount: usedSheets.length,
      newSheetCount,
      reclaimedSheetCount,
      placedCount,
      totalCount: parts.length,
      partArea: round3(partArea),
      sheetArea: round3(sheetArea),
      utilization,
      rejectedStocks,
    },
  };
}

// 去掉排版内部使用的临时字段（当前零件无内部字段，保持完整拷贝）。
function stripInternal(part) {
  const { ...rest } = part;
  return rest;
}
