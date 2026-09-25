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
| 断言总数 | **59**（`npm run test:e2e`） |

## 2. 端到端断言（`bash test/e2e.sh`）

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

## 3. 覆盖的行为闭环

**A. 添加引脚模式（点一下加引脚）**
1. 工具栏进入/退出模式；按钮文案随状态变化（Esc 退出时也同步）
2. 模式内守卫：元件不可拖动、画布不可平移、本体起线被拦
3. 轮廓落点预览与真实轮廓点偏差 **0px**（圆形）；生成引脚 `args` 与点击处误差 **≤2px**
4. **六边形（异形轮廓）** 同样成立（polygon 边缘取点）
5. **模式内从已有引脚拖拽拉线可用**；模式内按元件本体拖拽：不拉线、不加引脚、**不移动元件、不平移画布**
6. Esc 退出 → `validateMagnet` / `interacting` 覆盖原样还原、panning 恢复、元件恢复可拖动
7. 退出后本体拉线恢复原生行为；非添加模式点击元件不产生引脚
8. 悬停引脚点「×」删除，**挂在该引脚上的连线一并删除**

**B. 拖拽建引脚（调色板 → 元件）**
9. 拖「引脚」模板到圆形轮廓 → **引脚 +1 且落在轮廓上（≤3px）**，模板**不落地**成节点
10. 普通模板（矩形）照常落地成新元件（节点数 +1）

**C. 连线样式（X6 edge 配置）**
11. 「无箭头」→ `line.targetMarker === null`；「虚线」→ `strokeDasharray === '6 3'`；「流动」→ `block` 箭头 + `style.animation`

**D. 导出 / 导入往返（图 → JSON → 图）**
12. 造一条**从引脚出发**的连线（`source.port = pin-1`）后导出
13. 导出 JSON 含引脚（`ports.groups` + `ports.items` + `args`）与连线端点绑定
14. `clearCells()` 清空整张图（节点数 0）后导入
15. **状态逐字节复原**：节点集合+位置、每个引脚的 id/group/args（含 `1.08 / 57.83` 这类小数）、每条边的 `source/target.cell` 与 `source.port` 完全一致
16. 复原后的引脚仍可交互（悬停出现删除徽章）

**E. 卫生**
17. 全程 `window.onerror` = 0

## 4. 包形态冒烟

```
$ node -e "import('./dist/index.mjs').then(m => console.log(Object.keys(m).join(', ')))"
exports: PortEditor, collectOutlineElements, findNearestOutlinePoint

$ node -e "const m = require('./dist/index.cjs'); console.log(Object.keys(m).join(', '))"
exports: PortEditor, collectOutlineElements, findNearestOutlinePoint
```

产物：`dist/index.mjs`(ESM) / `index.cjs`(CJS) / `index.umd.js`(UMD，全局 `X6PluginPortEditor`) + 5 个 `.d.ts`；
`npx tsc -p tsconfig.json --noEmit` 无错误；对 `@antv/x6` 仅类型引用，三产物**零运行时依赖**。

## 5. 复现步骤

```bash
cd x6-plugin-port-editor
npm install
npm run build        # esbuild 三产物 + tsc 声明
npm run test:e2e     # 静态服务 + 真实 Chrome 跑 59 条断言
npm run demo         # http://127.0.0.1:8732/demo/index.html
```

## 6. 未覆盖 / 未验证（诚实披露）

- 引脚**拖动调整位置**：未实现（X6 中引脚 mousedown 默认被解释为拉线，见 issue #4648/#4649）
- 引脚 hide/show：未实现（属 model 层 API，插件无法新增，需核心改动）
- 大规模节点（数百个）命中性能：无基准测试
- 旋转节点、缩放画布下的落点精度：逻辑上由 SVG CTM 覆盖，**未单独写断言**
- 触摸屏 / 触控笔：未测试
- 导出/导入只覆盖 **cell 数据**：视图缩放与平移需另外存（demo 已示范），选中状态、业务层挂在 cell.data 之外的状态不在其中
