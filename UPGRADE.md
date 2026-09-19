# 拾光工坊 — 材料反向设计

用户明确要求升级创新性，并对创想三维/MakerMuse 解决真实问题。保留原有情感设计入口，新增面向定制礼品小店与创客的生产工作台。核心是库存/设备尺寸约束反向影响设计和结构，而不是只下载单件 SVG。

## 本轮任务分工

Kiro 仅负责 `src/packing.js`、`tests/packing.test.mjs`。Codex 负责界面、风险检查、导出、底座与集成。You are not alone in this codebase. Do not overwrite or revert other work. Do not spawn agents. No shell commands or dependency installation.

Kiro 实现纯函数、无外部依赖、浏览器兼容 ESM。不得修改其他文件。

### 导出函数

`makeParts(size, quantity=1, mode='strips')` → 单件零件数组（展开数量）。size 为 140/180/220，quantity 1..6，mode rings 或 strips。每个成品六块 size×size 方形图案，layerId 0..5，kind='layer'；间隔材料：rings 模式为五块 size×size，kind='spacer'。strips 模式用 20 根矩形组成五个框：10 根 size×(size*.05) 长条、10 根 (size*.9)×(size*.05) 短条；kind='strip'，长短条端部对接组成外 size 内 size*.9 的同尺寸框。零件字段 {id,name,width,height,kind,layerId?,unit}，id 唯一，unit 为成品编号1起。

`packParts(parts, stocks, options={})` → {sheets,unplaced,stats}。stocks 为有限库存行数组 {id,name,width,height,count,reclaimed:boolean}。options {bedWidth=400,bedHeight=415,margin=4,gap=3}。必须校验有限数字、范围、合法整数数量，不合法 throw 中文 Error。零件最多156个，stock行最多8、总板数量最多40、板长宽20..1000。设备床20..1000。margin0..20，gap1..15。库存超床尺寸的板不可直接使用，可旋转整张板以适配，两个方向均放不下则跳过并在 stats.rejectedStocks 记录。margin 作用于板边界，gap 为件间最小边界间隙。

实现确定性的矩形启发式排版，可90度旋转零件；优先旧板 reclaimed，然后优先已经打开的板，再尽量少开新板。使用 MaxRects 或稳健的切分空闲矩形方法，确保零件不越界且互不重叠，间距足够。不宣称全局最优，不在图案孔洞内套料。

sheets 仅包含已使用板，每块 {id,stockId,name,width,height,reclaimed,placements:[{...part,x,y,rotated,width,height}]}。placement 的 width,height 是旋转后的占地尺寸，原始零件若需要另存 originalWidth,originalHeight。x,y 是左上毫米坐标。

stats {sheetCount,newSheetCount,reclaimedSheetCount,placedCount,totalCount,partArea,sheetArea,utilization,rejectedStocks}；utilization 使用零件矩形包络占地/已用板面积，0..1；明确不是材料净面积比例。unplaced 为未放入的零件列表。不要悄悄补无限库存、缩放零件、删除部件。

### 测试

验证两结构模式零件数量、尺寸与五框等面积；有限库存不足；余料优先；板与零件旋转；边距/间距/无重叠/不越界；三尺寸×两模式×多个库存；拒绝 NaN/无穷/负尺寸/超大数量；相同输入重复输出一致。只创建实现和测试，Codex 实际运行验证。最终给出算法局限。
