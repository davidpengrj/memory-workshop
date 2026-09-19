import test from 'node:test';
import assert from 'node:assert/strict';
import { makeParts, packParts } from '../src/packing.js';

const SIZES = [140, 180, 220];

// --- 几何辅助：判断两个占地矩形（含 gap 前的净外接框）是否重叠 ---
function overlaps(a, b) {
  return a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6 &&
    a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6;
}

// 校验单张板：无重叠、不越界、与其它件间距 >= gap。
// 完整间距校验：将两个矩形各向外膨胀 gap/2（两者合计膨胀一个 gap）后仍不重叠，
// 等价于两件真实边界之间的间隙 >= gap。之前只膨胀一个矩形，只覆盖半个 gap。
function assertSheetValid(sheet, margin, gap) {
  const pls = sheet.placements;
  for (const p of pls) {
    // 不越界（在 margin 内）。
    assert.ok(p.x >= margin - 1e-6, `越界左 ${p.id}`);
    assert.ok(p.y >= margin - 1e-6, `越界上 ${p.id}`);
    assert.ok(p.x + p.width <= sheet.width - margin + 1e-6, `越界右 ${p.id}`);
    assert.ok(p.y + p.height <= sheet.height - margin + 1e-6, `越界下 ${p.id}`);
  }
  // 两两间距：双方各膨胀 gap/2 后不重叠 → 真实边界间距 >= gap。
  for (let i = 0; i < pls.length; i++) {
    for (let j = i + 1; j < pls.length; j++) {
      const a = { x: pls[i].x - gap / 2, y: pls[i].y - gap / 2, width: pls[i].width + gap, height: pls[i].height + gap };
      const b = { x: pls[j].x - gap / 2, y: pls[j].y - gap / 2, width: pls[j].width + gap, height: pls[j].height + gap };
      assert.ok(!overlaps(a, b), `零件间距不足或重叠：${pls[i].id} / ${pls[j].id}`);
    }
  }
}

test('makeParts rings 模式：每件六层图案 + 五块间隔环', () => {
  const parts = makeParts(180, 1, 'rings');
  const layers = parts.filter((p) => p.kind === 'layer');
  const spacers = parts.filter((p) => p.kind === 'spacer');
  assert.equal(layers.length, 6);
  assert.equal(spacers.length, 5);
  assert.equal(parts.length, 11);
  // layerId 0..5
  assert.deepEqual(layers.map((l) => l.layerId).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  for (const p of parts) {
    assert.equal(p.width, 180);
    assert.equal(p.height, 180);
    assert.equal(p.unit, 1);
    assert.equal(p.unit >= 1, true);
  }
});

test('makeParts strips 模式：20 根条组成五个等尺寸框，长短条端部对接', () => {
  const size = 180;
  const parts = makeParts(size, 1, 'strips');
  const layers = parts.filter((p) => p.kind === 'layer');
  const strips = parts.filter((p) => p.kind === 'strip');
  assert.equal(layers.length, 6);
  assert.equal(strips.length, 20);
  const longs = strips.filter((s) => Math.abs(s.width - size) < 1e-6);
  const shorts = strips.filter((s) => Math.abs(s.width - size * 0.9) < 1e-6);
  assert.equal(longs.length, 10);
  assert.equal(shorts.length, 10);
  const stripH = size * 0.05;
  for (const s of strips) assert.ok(Math.abs(s.height - stripH) < 1e-6, '条宽应为 size*.05');
  // 单框：外 size，内 size*.9。长条覆盖两条边全长 size；短条比长条短两个条宽
  // （每端各让出一个条宽给对接的长条），即 size - 2*stripH = size*.9。
  assert.ok(Math.abs((size - 2 * stripH) - size * 0.9) < 1e-6, '短条应为 size - 2*stripH = size*.9');
  const outerArea = size * size;
  const innerArea = (size * 0.9) * (size * 0.9);
  const frameArea = outerArea - innerArea;
  // 环带面积 = 外 - 内。长短条端部对接、不重叠，正好铺满宽 stripH 的环带，
  // 因此单框四条的面积应精确等于环带面积（不仅仅为正）。
  const oneFrameStripArea = 2 * size * stripH + 2 * (size * 0.9) * stripH;
  assert.ok(Math.abs(oneFrameStripArea - frameArea) < 1e-6, '单框条面积应等于外框减内框环带面积');
  // 五框等面积：任取两框条面积相等。
  const frames = [];
  for (let f = 0; f < 5; f++) {
    const fp = strips.filter((s) => s.name.includes(`框${f + 1} `));
    const area = fp.reduce((sum, s) => sum + s.width * s.height, 0);
    frames.push(area);
  }
  for (let i = 1; i < frames.length; i++) assert.ok(Math.abs(frames[i] - frames[0]) < 1e-6, '五框应等面积');
});

test('makeParts 多件展开：id 唯一、unit 从 1 起编号', () => {
  const parts = makeParts(140, 3, 'strips');
  const ids = new Set(parts.map((p) => p.id));
  assert.equal(ids.size, parts.length, 'id 必须唯一');
  const units = [...new Set(parts.map((p) => p.unit))].sort((a, b) => a - b);
  assert.deepEqual(units, [1, 2, 3]);
  // 3 件 strips：每件 6 层 + 20 条 = 26 → 78。
  assert.equal(parts.length, 78);
});

test('makeParts 拒绝非法尺寸/数量/模式', () => {
  assert.throws(() => makeParts(100, 1, 'strips'), /成品尺寸/);
  assert.throws(() => makeParts(180, 0, 'strips'), /成品数量/);
  assert.throws(() => makeParts(180, 7, 'strips'), /成品数量/);
  assert.throws(() => makeParts(180, 1.5, 'strips'), /成品数量/);
  assert.throws(() => makeParts(180, 1, 'foo'), /间隔模式/);
});

test('packParts 三尺寸 × 两模式在充足库存下全部放入且几何合法', () => {
  for (const size of SIZES) {
    for (const mode of ['rings', 'strips']) {
      const parts = makeParts(size, 1, mode);
      const stocks = [{ id: 's-new', name: '整板', width: 600, height: 400, count: 10, reclaimed: false }];
      // 600x400 板需要与之匹配的设备床（默认 400x415 放不下），显式给出。
      const { sheets, unplaced, stats } = packParts(parts, stocks, { bedWidth: 600, bedHeight: 400 });
      assert.equal(unplaced.length, 0, `${size}/${mode} 应全部放入`);
      assert.equal(stats.placedCount, parts.length);
      assert.equal(stats.totalCount, parts.length);
      for (const sheet of sheets) assertSheetValid(sheet, 4, 3);
      assert.ok(stats.utilization > 0 && stats.utilization <= 1);
      // sheets 仅含已使用板。
      for (const sheet of sheets) assert.ok(sheet.placements.length > 0);
    }
  }
});

test('packParts 有限库存不足时剩余零件进入 unplaced', () => {
  const parts = makeParts(220, 2, 'rings'); // 22 件 220 大方块
  // 一张 460x460 板：与之匹配的 460x460 设备床能放下板本身（不因超床被拒），
  // 但一张板放不下全部 22 件 220 方块（每张约 2x2=4 件），从而真正触发库存不足。
  const stocks = [{ id: 's1', name: '小板', width: 460, height: 460, count: 1, reclaimed: false }];
  const { sheets, unplaced, stats } = packParts(parts, stocks, { bedWidth: 460, bedHeight: 460 });
  // 板未被设备床拒绝，才是真正的“库存件数不足”而非“无可用板”。
  assert.equal(stats.rejectedStocks.length, 0, '板应能放入设备床，不被拒绝');
  assert.ok(stats.placedCount > 0, '应有零件被放入这张板');
  assert.ok(unplaced.length > 0, '库存不足应有未放入零件');
  assert.equal(stats.placedCount + unplaced.length, parts.length);
  assert.equal(stats.sheetCount, sheets.length);
  assert.ok(sheets.length <= 1);
});

test('packParts 优先使用余料板', () => {
  const parts = makeParts(180, 1, 'rings'); // 11 块 180 方
  const stocks = [
    { id: 'new', name: '新板', width: 600, height: 400, count: 5, reclaimed: false },
    { id: 'reclaim', name: '余料', width: 600, height: 400, count: 5, reclaimed: true },
  ];
  // 600x400 板需匹配设备床。
  const { sheets } = packParts(parts, stocks, { bedWidth: 600, bedHeight: 400 });
  // 第一张被使用的板应来自余料。
  const firstUsed = sheets[0];
  assert.equal(firstUsed.reclaimed, true, '应先用余料');
  assert.equal(firstUsed.stockId, 'reclaim');
});

test('packParts 允许旋转零件以放入较窄板', () => {
  // 长条零件在窄板上必须旋转。
  const parts = [
    { id: 'p1', name: '长条', width: 300, height: 20, kind: 'strip', unit: 1 },
    { id: 'p2', name: '长条2', width: 300, height: 20, kind: 'strip', unit: 1 },
  ];
  // 板宽 60（放不下 300 宽的条），高 350 → 旋转后 20 宽 300 高可放。
  const stocks = [{ id: 's', name: '窄板', width: 60, height: 350, count: 2, reclaimed: false }];
  const { sheets, unplaced } = packParts(parts, stocks, { margin: 4, gap: 3 });
  assert.equal(unplaced.length, 0);
  for (const sheet of sheets) {
    for (const pl of sheet.placements) {
      assert.equal(pl.rotated, true, '窄板上应旋转');
      assert.equal(pl.width, 20);
      assert.equal(pl.height, 300);
      assert.equal(pl.originalWidth, 300);
      assert.equal(pl.originalHeight, 20);
    }
    assertSheetValid(sheet, 4, 3);
  }
});

test('packParts 整张板超床可旋转适配；两向都放不下则拒绝并记录', () => {
  const parts = [{ id: 'p1', name: '件', width: 100, height: 100, kind: 'layer', layerId: 0, unit: 1 }];
  // 床 400x415。板 410x300：正放宽 410 > 400 越界，旋转 300x410 → 300<=400,410<=415 可用。
  const stocks = [{ id: 'rot', name: '需旋转板', width: 410, height: 300, count: 1, reclaimed: false }];
  const r1 = packParts(parts, stocks, { bedWidth: 400, bedHeight: 415 });
  assert.equal(r1.unplaced.length, 0);
  assert.equal(r1.stats.rejectedStocks.length, 0);

  // 两个方向都超床：500x500，床 400x415 → 拒绝。
  const stocks2 = [{ id: 'big', name: '超大板', width: 500, height: 500, count: 1, reclaimed: false }];
  const r2 = packParts(parts, stocks2, { bedWidth: 400, bedHeight: 415 });
  assert.equal(r2.stats.rejectedStocks.length, 1);
  assert.equal(r2.stats.rejectedStocks[0].id, 'big');
  assert.equal(r2.unplaced.length, 1, '无可用板则零件未放入');
});

test('packParts margin 与 gap 生效：无重叠、不越界', () => {
  const parts = makeParts(140, 1, 'strips');
  const stocks = [{ id: 's', name: '板', width: 500, height: 500, count: 4, reclaimed: false }];
  const margin = 10;
  const gap = 8;
  // 500x500 板需匹配设备床（默认 400x415 放不下），显式给出。
  const { sheets, unplaced } = packParts(parts, stocks, { margin, gap, bedWidth: 500, bedHeight: 500 });
  assert.equal(unplaced.length, 0);
  for (const sheet of sheets) assertSheetValid(sheet, margin, gap);
});

test('packParts 拒绝 NaN/无穷/负尺寸/超大数量/重复 id', () => {
  const good = [{ id: 'a', name: 'a', width: 100, height: 100, kind: 'layer', unit: 1 }];
  const stock = [{ id: 's', name: 's', width: 400, height: 400, count: 1, reclaimed: false }];

  assert.throws(() => packParts([{ id: 'x', width: NaN, height: 10 }], stock), /有限数字/);
  assert.throws(() => packParts([{ id: 'x', width: Infinity, height: 10 }], stock), /有限数字/);
  assert.throws(() => packParts([{ id: 'x', width: -5, height: 10 }], stock), /为正/);
  assert.throws(() => packParts([{ id: 'x', width: 10, height: 10 }, { id: 'x', width: 10, height: 10 }], stock), /id 重复/);

  // 超过 156 个零件。
  const many = [];
  for (let i = 0; i < 157; i++) many.push({ id: `p${i}`, width: 10, height: 10, kind: 'layer', unit: 1 });
  assert.throws(() => packParts(many, stock), /156/);

  // 库存非法。
  assert.throws(() => packParts(good, [{ id: 's', width: NaN, height: 400, count: 1 }]), /有限数字/);
  assert.throws(() => packParts(good, [{ id: 's', width: 10, height: 400, count: 1 }]), /20\.\.1000/);
  assert.throws(() => packParts(good, [{ id: 's', width: 400, height: 400, count: -1 }]), /非负整数/);
  assert.throws(() => packParts(good, [{ id: 's', width: 400, height: 400, count: 1.5 }]), /非负整数/);
  // 总板超 40。
  assert.throws(() => packParts(good, [{ id: 's', width: 400, height: 400, count: 41 }]), /40/);
  // 库存行超 8。
  const rows = [];
  for (let i = 0; i < 9; i++) rows.push({ id: `s${i}`, width: 400, height: 400, count: 1 });
  assert.throws(() => packParts(good, rows), /8 行/);

  // options 非法。
  assert.throws(() => packParts(good, stock, { bedWidth: 10 }), /设备床/);
  assert.throws(() => packParts(good, stock, { margin: 25 }), /边距/);
  assert.throws(() => packParts(good, stock, { gap: 0 }), /间距/);
  assert.throws(() => packParts(good, stock, { gap: NaN }), /有限数字/);
});

test('packParts 相同输入重复调用输出一致（确定性）', () => {
  const parts = makeParts(180, 2, 'strips');
  const stocks = [
    { id: 'r', name: '余料', width: 500, height: 500, count: 3, reclaimed: true },
    { id: 'n', name: '新板', width: 500, height: 500, count: 5, reclaimed: false },
  ];
  // 500x500 板需匹配设备床。
  const a = packParts(parts, stocks, { margin: 5, gap: 4, bedWidth: 500, bedHeight: 500 });
  const b = packParts(parts, stocks, { margin: 5, gap: 4, bedWidth: 500, bedHeight: 500 });
  assert.deepEqual(a, b);
});

test('packParts stats.utilization 在 0..1 且不悄悄补库存/缩放零件', () => {
  const parts = makeParts(140, 1, 'rings');
  const stocks = [{ id: 's', name: '板', width: 500, height: 500, count: 10, reclaimed: false }];
  // 500x500 板需匹配设备床。
  const { stats, sheets } = packParts(parts, stocks, { bedWidth: 500, bedHeight: 500 });
  assert.ok(stats.utilization >= 0 && stats.utilization <= 1);
  // 每个 placement 的净尺寸应等于原零件尺寸（未缩放；旋转时交换）。
  for (const sheet of sheets) {
    for (const pl of sheet.placements) {
      const orig = parts.find((p) => p.id === pl.id);
      const w = pl.rotated ? pl.height : pl.width;
      const h = pl.rotated ? pl.width : pl.height;
      assert.ok(Math.abs(w - orig.width) < 1e-6, '零件宽不得被缩放');
      assert.ok(Math.abs(h - orig.height) < 1e-6, '零件高不得被缩放');
    }
  }
  // partArea 与 sheetArea 一致性。
  assert.equal(stats.sheetCount, sheets.length);
});

test('packParts 回归：靠板边不留尾部 gap —— 180 方块应放入 188 板（margin4 gap3）', () => {
  // 之前的实现在最后一件之后仍要求一个 gap，导致 180 方块无法放入 188 板。
  // gap 只应在零件之间保留；靠板边的一件其尾部无需 gap。
  // usable = 188 - 2*4 = 180，正好容纳 180 净尺寸，件真实右边界 4+180=184 <= 188-4。
  const parts = [{ id: 'p1', name: '方', width: 180, height: 180, kind: 'layer', layerId: 0, unit: 1 }];
  const stocks = [{ id: 's', name: '正好板', width: 188, height: 188, count: 1, reclaimed: false }];
  const { sheets, unplaced, stats } = packParts(parts, stocks, { margin: 4, gap: 3 });
  assert.equal(unplaced.length, 0, '180 方块应放入 188 板');
  assert.equal(stats.placedCount, 1);
  assert.equal(sheets.length, 1);
  const pl = sheets[0].placements[0];
  // 真实边界须落在 margin 内。
  assert.ok(pl.x >= 4 - 1e-6 && pl.x + pl.width <= 188 - 4 + 1e-6, '件真实边界应在 margin 内');
  assert.ok(pl.y >= 4 - 1e-6 && pl.y + pl.height <= 188 - 4 + 1e-6, '件真实边界应在 margin 内');
  assertSheetValid(sheets[0], 4, 3);
});

test('packParts 回归：相邻两件真实间距不小于整个 gap（不只半个）', () => {
  // 加强后的 assertSheetValid 双向各膨胀 gap/2；此处直接验证真实几何间距 >= gap。
  const parts = makeParts(140, 1, 'strips');
  const stocks = [{ id: 's', name: '板', width: 400, height: 415, count: 4, reclaimed: false }];
  const gap = 6;
  const margin = 4;
  const { sheets } = packParts(parts, stocks, { margin, gap });
  for (const sheet of sheets) {
    const pls = sheet.placements;
    for (let i = 0; i < pls.length; i++) {
      for (let j = i + 1; j < pls.length; j++) {
        const a = pls[i];
        const b = pls[j];
        // 计算两个真实矩形在 x、y 方向的间隙；若两向都重叠区间则视为相邻，间隙取较大分离。
        const overlapX = a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6;
        const overlapY = a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6;
        if (overlapX && overlapY) {
          assert.fail(`零件真实重叠：${a.id} / ${b.id}`);
        }
        // 在其中一个投影方向不重叠时，该方向的真实间隙须 >= gap。
        const gapX = overlapX ? -Infinity : Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
        const gapY = overlapY ? -Infinity : Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
        const sep = Math.max(gapX, gapY);
        assert.ok(sep >= gap - 1e-6, `真实间距 ${sep} 应 >= gap ${gap}：${a.id} / ${b.id}`);
      }
    }
    assertSheetValid(sheet, margin, gap);
  }
});

test('packParts 场景回归：4×(300×80余料) + 4×(300×400新)，size180 q1，床400x415 margin4 gap3', () => {
  const stocks = [
    { id: 'reclaim', name: '余料条', width: 300, height: 80, count: 4, reclaimed: true },
    { id: 'new', name: '新板', width: 300, height: 400, count: 4, reclaimed: false },
  ];
  const opts = { bedWidth: 400, bedHeight: 415, margin: 4, gap: 3 };

  // rings：11 块 180 方；余料 80 高放不下 180 方，只能上新板（每新板约 2 块），
  // 4 张新板最多约 8 块 < 11，故 rings 不完整。
  const ringParts = makeParts(180, 1, 'rings');
  const ringRes = packParts(ringParts, stocks, opts);
  assert.ok(ringRes.unplaced.length > 0, 'rings 应不完整：有未放入零件');
  assert.equal(ringRes.stats.placedCount + ringRes.unplaced.length, ringParts.length);

  // strips：6 层 180 方（只能上新板）+ 20 根窄条（可上余料条）。20 条分布到 4 张余料，
  // 6 层每新板约 2 块 → 3 张新板放下全部层，故 strips 完整且恰用 3 张新板。
  const stripParts = makeParts(180, 1, 'strips');
  const stripRes = packParts(stripParts, stocks, opts);
  assert.equal(stripRes.unplaced.length, 0, 'strips 应完整放入');
  assert.equal(stripRes.stats.placedCount, stripParts.length);
  assert.equal(stripRes.stats.newSheetCount, 3, 'strips 应恰用 3 张新板');
  for (const sheet of stripRes.sheets) assertSheetValid(sheet, opts.margin, opts.gap);
});
