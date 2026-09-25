# 验证证据（x6-plugin-port-editor v0.1.0）

全部证据由本机真实执行产生，未做任何人工修饰。

## 1. 环境

| 项 | 值 |
|----|----|
| 日期 | 2026-09-25 |
| 系统 | macOS（Apple Silicon）/ Node v24.14.0 |
| 被测库 | @antv/x6 **3.1.8**（npm 包，UMD dist/x6.min.js） |
| 源码对照版本 | antvis/X6 master **v3.1.7**（本地克隆 b14ca27） |
| 浏览器 | 真实 Google Chrome（playwright-cli --browser=chrome，非 jsdom） |
| 事件来源 | Playwright 真实鼠标/键盘事件（mousemove / mousedown / mouseup / press Escape / select），非页面内 dispatchEvent |
| 断言总数 | **94**（插件 59 + 例子 35） |

## 2. 插件端到端断言（`npm run test:e2e`，59 条）

```
=== x6-plugin-port-editor e2e (port 8751) ===
PASS  S0 demo loaded                                       true
PASS  S0 X6 UMD loaded                                     true
PASS  S0 initial pins/edges                                0/0
PASS  S0 add mode off by default                           false
PASS  S0 rect body is a magnet (like real power editors)   true
PASS  S1 toolbar enters add mode                           true
PASS  S1 button reflects the mode                          退出添加（Esc）
PASS  S1 container flagged for crosshair                   true
PASS  S1 nodes are not movable while adding                false
PASS  S1 canvas panning disabled while adding              false
PASS  S2 preview dot visible on hover                      block
PASS  S2 preview dot sits on the outline (px off)          0
PASS  S3 pin count on circle                               1
PASS  S3 pin id generated                                  pin-1
PASS  S3 pin group                                         pin
PASS  S3 pin args match clicked outline point (tol 2px)    true
PASS  S3 pin rendered in DOM                               1
PASS  S4 hexagon pin created                               1
PASS  S4 hexagon pin args on polygon edge (tol 2px)        true
PASS  S5 delete badge shown on pin hover                   block
PASS  S6 in add mode: wire from an existing pin works      1
PASS  S6 wire source port                                  pin-1
PASS  S6 in add mode: wire from element body blocked       1
PASS  S6 blocked drag added no pin                         0
PASS  S6 blocked drag did not move the node                {"x":470,"y":70}
PASS  S6 blocked drag did not pan the canvas               502 206
PASS  S7 Esc exits add mode                                false
PASS  S7 button label restored                             添加引脚
PASS  S7 crosshair class removed                           false
PASS  S7 validateMagnet override restored                  undefined
PASS  S7 interacting option restored                       {"edgeLabelMovable":false}
PASS  S7 nodes movable again                               true
PASS  S7 panning enabled again                             true
PASS  S8 idle: wire from element body works again          2
PASS  S9 idle click adds no pin                            1
PASS  S10 button re-enters add mode                        true
PASS  S10 button exits add mode                            false
PASS  S11 pin removed                                      0
PASS  S11 wires attached to that pin removed               1
PASS  S11 back to idle after deletion                      false
PASS  S12 palette has 4 templates                          4
PASS  S12 drop of the pin template created a pin           1
PASS  S12 pin template did not land as a node              3
PASS  S12 dropped pin sits on the outline (<=3px)          true
PASS  S13 component template landed as a new node          4
PASS  S14 preset 'plain' removed the arrow                 true
PASS  S14 preset 'dashed' set a dash pattern               6 3
PASS  S14 preset 'flow' uses a block marker                block
PASS  S14 preset 'flow' adds a stroke animation            x6pe-flow 30s infinite linear
PASS  S15 pin-bound wire created before export             2
PASS  S15 that wire starts from the pin                    pin-1
PASS  S15 export produced JSON                             true
PASS  S15 JSON carries pins (groups+items+args)            true
PASS  S15 JSON carries edge port bindings                  true
PASS  S15 graph cleared before import                      0
PASS  S15 import succeeded                                 true
PASS  S15 state restored exactly (nodes+pins+args+edge ports) {"nodes":[{"id":"028e8017-b204-415e-a26f-2da68924da4e","pos":{"x":90,"y":350},"pins":[]},{"id":"n-circle","pos":{"x":260,"y":60},"pins":[{"id":"pin-1","group":"pin","args":{"x":1.08,"y":57.83}}]},{"id":"n-hex","pos":{"x":470,"y":250},"pins":[{"id":"pin-1","group":"pin","args":{"x":137.82,"y":26.73}}]},{"id":"n-rect","pos":{"x":470,"y":70},"pins":[]}],"edges":[{"source":{"cell":"n-circle","port":"pin-1"},"target":{"cell":"n-hex","port":null}},{"source":{"cell":"n-rect","port":null},"target":{"cell":"n-hex","port":null}}]}
PASS  S15 restored pin is interactive (badge shows)        block
PASS  S16 no page errors                                   0
=== summary: 59 passed, 0 failed ===
```

覆盖：添加模式与三项守卫（元件不可拖/画布不可平移/本体起线被拦）、圆形与六边形**贴轮廓**落点、
生成引脚 args 精度、模式内从引脚拉线、退出后逐项还原、点轮廓加引脚、拖拽建引脚（调色板）、
连线样式预设、导出/导入**逐字节往返**。

## 3. 例子端到端断言（`npm run test:examples`，35 条）

```
=== examples e2e (port 8755) ===
--- 例 1 · 01-basic ---
PASS  E1 页面就绪                                      true
PASS  E1 初始 3 元件 / 0 连线                        3/0
PASS  E1 初始无引脚                                   0
PASS  E1 进入添加模式                                true
PASS  E1 轮廓落点预览出现                          block
PASS  E1 点击生成引脚 pin-1                          ["pin-1"]
PASS  E1 引脚组自动补为 pin                         pin
PASS  E1 引脚贴在轮廓上（≤2px）                 true
PASS  E1 Esc 退出添加模式                            false
PASS  E1 从引脚拉线成功                             1
PASS  E1 连线起点绑定到引脚                       pin-1
PASS  E1 非添加模式点击不加引脚                 1
PASS  E1 无页面报错                                   0
--- 例 2 · 02-power-editor ---
PASS  E2 页面就绪                                      true
PASS  E2 3 元件 / 调色板 4 模板                     3/4
PASS  E2 自定义元件形状已注册使用              power-ct
PASS  E2 元件自带 terminal 端子组                   terminal
PASS  E2 元件已被选中（选择框已出现）        1
PASS  E2 选择框存在但不再遮挡轮廓（pointerEvents: none） true
PASS  E2 落点判定可穿透可交互覆盖层           true
PASS  E2 选中态下点轮廓仍能加端子（穿透选择框） ["T-1"]
PASS  E2 端子组用项目自己的 terminal              terminal
PASS  E2 端子贴在轮廓上（≤2px）                 true
PASS  E2 撤销一次即移除该端子（一步撤销）  0
PASS  E2 重做恢复该端子                             ["T-1"]
PASS  E2 从端子拉线成功（选择框不再挡）     1
PASS  E2 连线起点绑定到端子                       T-1
PASS  E2 拖端子模板到主变 → 生成端子         1
PASS  E2 端子模板未落地成元件                    3
PASS  E2 拖拽生成的端子也贴轮廓（≤3px）     true
PASS  E2 导出 JSON 含端子数据                       true
PASS  E2 清空整图                                      0
PASS  E2 导入成功                                      true
PASS  E2 往返后状态完全一致                       {"nodes":[{"id":"n-breaker","pins":[]},{"id":"n-ct","pins":[{"id":"T-1","group":"terminal","args":{"x":2.01,"y":48.11}}]},{"id":"n-transformer","pins":[{"id":"T-1","group":"terminal","args":{"x":130.64,"y":26.22}}]}],"edges":[{"source":{"cell":"n-ct","port":"T-1"},"target":{"cell":"n-breaker","port":null}}]}
PASS  E2 无页面报错                                   0
=== summary: 35 passed, 0 failed ===
```

覆盖：例 1 最小接入全链路（预览/生成/贴轮廓/退出/拉线/非模式不误加）；
例 2 电力场景（自定义元件形状生效、项目自己的 `terminal` 组与 `T-` 前缀、
**选中元件后被选择框覆盖的轮廓仍可加端子**（`elementsFromPoint` 穿透）、
从端子拉线、**History 一步撤销/重做**、调色板拖端子模板不落地、导出导入一致）。

## 4. 包形态冒烟

```
$ node -e "import('./dist/index.mjs').then(m => console.log(Object.keys(m).join(', ')))"
exports: PortEditor, collectOutlineElements, findNearestOutlinePoint

$ node -e "const m = require('./dist/index.cjs'); console.log(Object.keys(m).join(', '))"
exports: PortEditor, collectOutlineElements, findNearestOutlinePoint
```

产物：`dist/index.mjs`(ESM) / `index.cjs`(CJS) / `index.umd.js`(UMD，全局 `X6PluginPortEditor`) + `.d.ts`；
`tsc --noEmit` 无错误；对 `@antv/x6` 仅类型引用，三产物**零运行时依赖**。
本地消费方式（tgz / 拷 dist / file: 链接 / 拷 src）见 README §2.1。

## 5. 复现步骤

```bash
cd x6-plugin-port-editor
npm install
npm run build
npm test              # 94 条断言（两套）
npm run demo          # http://127.0.0.1:8732/demo/index.html （examples/ 也可以直接打开）
```

## 6. 未覆盖 / 未验证（诚实披露）

- 引脚**拖动调整位置**：未实现（引脚 mousedown 在 X6 里默认被解释为拉线，见 issue #4648/#4649）
- 引脚 hide/show：未实现（属 model 层 API，插件无法新增，需核心改动）
- 大规模节点（数百个）命中性能：无基准测试
- 旋转节点、缩放画布下的落点精度：逻辑上由 SVG CTM 覆盖，**未单独写断言**
- 触摸屏 / 触控笔：未测试
- 导出/导入只覆盖 cell 数据：视图缩放与平移需另外存（demo 与例 2 已示范），选中状态与业务层外部状态不在其中
- 从 Dnd 落点建引脚时，落点与鼠标位置存在 ≤3px 偏差（用模板中心近似鼠标落点）
