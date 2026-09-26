# 接入指南：把 PortEditor 用到你已有的 AntV X6 项目里

> 目标读者：已经有一个跑着 AntV X6 的项目（自己的元件形状、自己的端口定义、自己的工具栏），
> 现在想加「交互式添加引脚」这个能力，且**不想改 X6 核心**。
>
> 本文所有结论都在 @antv/x6 **3.1.8** + 真实 Chrome 上实测过；断言与证据见 `test/EVIDENCE.md`。
> 想直接看跑起来的代码：**[`examples/`](../examples/README.md)** —— 例 1 最小接入、例 2 电力组件场景（含实现原理讲解）。

---

## 0. 前置检查清单（照着过一遍，3 分钟）

| 检查项 | 命令 / 做法 | 为什么 |
|--------|-------------|--------|
| X6 版本 ≥ 3 | `npm ls @antv/x6` | 插件基于 X6 v3 的 tool/plugin/registry 体系（3.1.7 源码 + 3.1.8 实测） |
| 项目里有 `tslib` | `npm ls tslib`（没有就 `npm i tslib`） | **X6 自己的打包缺陷**：`@antv/x6` 的 `es/`、`lib/` 产物里 `import { __decorate } from "tslib"`，但它的 `package.json` 未声明该依赖。纯净项目打包会报 `Could not resolve "tslib"` |
| `tsconfig.json` 建议开 `skipLibCheck: true` | Vue/Vite 模板默认已开 | 用符号链接方式安装时，TS 会顺着链接解析到插件目录下的 `lodash-es`（无自带声明）→ 6 条 `TS7016` |
| 你的元件本体是不是 magnet？ | 搜 `magnet: true` | 若本体是 magnet（很多流程图/电力图项目如此），请重点读 §4 的语义表 —— 插件在添加模式内会**临时**改变这个行为 |
| 你的 cell 数据是否有严格 schema？ | 看你的 ports 校验 | 插件在节点缺少目标端口组时会自动补一份定义（`autoCreateGroup`，默认开）；若要守住 schema，见 §3.2 |

---

## 1. 引入方式（四选一，详见 README §2.1）

```bash
# A. tgz 安装（最推荐，"像真发过版"）
cd x6-plugin-port-editor && npm run build && npm pack
cd <你的项目> && npm i /abs/path/x6-plugin-port-editor-0.1.0.tgz

# B. 拷 dist（零安装零编译）
cp -r x6-plugin-port-editor/dist <你的项目>/src/vendor/port-editor/
# → import { PortEditor } from './vendor/port-editor/index.mjs'

# C. file: 符号链接（改插件源码项目立刻生效，适合边改边接）
npm i /abs/path/x6-plugin-port-editor

# D. 拷 src 直接编译 TS 源码（零 dist 依赖，完全可改）
cp -r x6-plugin-port-editor/src <你的项目>/src/vendor/port-editor/
```

引入后的包形态：

| 文件 | 用途 |
|------|------|
| `dist/index.mjs` | ESM（打包器、`import`） |
| `dist/index.cjs` | CJS（`require`、老工具链） |
| `dist/index.umd.js` | UMD，全局 `X6PluginPortEditor`（无打包器的页面 `<script>` 直接用） |
| `dist/*.d.ts` | 类型声明 |

包对 `@antv/x6` **只有类型引用**（`import type`），三个产物都**零运行时依赖** —— 不会出现"双份 X6 实例"这类问题，你项目里的那份 X6 就是它用的那份。

---

## 2. 最小接入（10 行）

```js
import { PortEditor } from 'x6-plugin-port-editor'

// 1) 挂在已有的 graph 实例上（不用动你的 Graph 配置）
const portEditor = new PortEditor({
  group: 'pin',                              // 引脚用的端口组名，默认 'pin'
  onModeChange: (adding) => {                // 模式进入/离开都会回调（Esc 退出也回调）
    document.getElementById('btn-add-pin').classList.toggle('active', adding)
  },
})
graph.use(portEditor)

// 2) 工具栏按钮接上
document.getElementById('btn-add-pin')
  .addEventListener('click', () => {
    portEditor.isAdding() ? portEditor.stopAdding() : portEditor.startAdding()
  })
```

就这些。之后：

- 点按钮 → 鼠标移到**任意元件轮廓**上会出现落点预览 → 点一下即生成引脚
- 从引脚拖拽 → X6 原生拉线（连到别的元件）
- 悬停引脚 → 出现红色「×」→ 点击删除该引脚（**连同挂在上面的连线**，X6 内建语义）
- `Esc` 或再点一次按钮 → 退出模式，**你原来的交互逐项还原**

---

## 3. 与你已有的节点定义、端口定义共存

### 3.1 引脚长什么样：优先用你自己的定义

插件默认在节点缺少 `pin` 组时补一份内置定义（白色小圆 + `magnet: true`）。三种做法按需选：

```js
// 做法一（推荐给有成套端子样式的项目）：自己在节点上声明 pin 组，插件只往里加 items
graph.addNode({
  /* ...你自己的元件形状... */
  ports: {
    groups: {
      pin: {
        position: 'absolute',
        markup: [{ tagName: 'circle', selector: 'circle' }],
        attrs: { circle: { r: 5, magnet: true, stroke: '#1677ff', strokeWidth: 2, fill: '#fff' } },
      },
    },
    items: [],
  },
})

// 做法二：让插件生成，但用你的样式
new PortEditor({ groupConfig: { position: 'absolute', attrs: { circle: { r: 5, magnet: true, fill: '#e6f4ff' } } } })

// 做法三：完全不让插件写数据（严格 schema 的项目）
new PortEditor({ autoCreateGroup: false })   // 缺组时不写，只 console.warn 一次
```

### 3.2 元件是异形轮廓（圆、多边形、变压器符号）—— 默认就能贴

插件默认把节点 markup 里**所有几何图形**（`rect/circle/ellipse/path/polygon/polyline/line`）都当作候选轮廓，
指针落在哪个附近就投影到哪条轮廓上，所以"矩形 + 两个圆"的变压器符号、六边形、自定义 path 都能贴。

想指定只用某一条轮廓：

```js
new PortEditor({ outlineSelector: 'body' })   // 用 markup 里 selector 为 body 的那个图形
```

节点是 `shape: 'html'` / foreignObject 这类拿不到几何轮廓的元件时，插件会退化为"包围盒四周"落点（已在源码里做兜底）。

### 3.3 引脚位置的存储语义

| `positionUnit` | args 存什么 | resize 元件时 |
|----------------|-------------|----------------|
| `'local'`（默认） | 节点本地像素，如 `{x: 55, y: 0}` | 引脚保持像素偏移（可能要重排） |
| `'percent'` | 相对尺寸的百分比，如 `{x: '50.000%'}` | 引脚按比例跟着走 |

> 注：X6 的 `normalizePercentage` 会把 **(0,1) 开区间内的裸数字当成比例**（`0.5` → 半宽）。
> 插件写入 `local` 坐标时会把落在该区间的值吸附到 0 或 1，避免"引脚突然跑到半宽处"。

---

## 4. 与"元件本体是 magnet"的共存（最需要注意的一节）

「添加引脚」是一个**编辑模式**，语义是：**只改变"点击"的含义，不改变"从引脚拖拽"的含义**。

| 动作 | 你的普通状态 | 添加引脚模式内 |
|------|--------------|----------------|
| 点击元件 | 你的原逻辑 | **在最近轮廓点生成引脚** |
| 鼠标移到轮廓 | 无 | 落点预览 |
| 从**已有引脚**拖拽 | 拉线 | **照常拉线**（加完引脚立刻接线，不必先退出） |
| 从**元件本体**拖拽 | 拉线（本体是 magnet 时）| 无动作：不拉线、**不移动元件、不平移画布** |
| 拖动元件 | 移动元件 | 不动作 |
| 拖动空白 | 平移视图 | 不动作 |
| `Esc` / 再点按钮 | — | 退出，以上能力**逐项原样还原** |

模式内插件会临时改三个全局开关，退出时逐项还原（e2e 对三项都有断言）：

| 临时改动 | 为什么 | 还原方式 |
|----------|--------|----------|
| `graph.options.connecting.validateMagnet` | 阻止"按元件本体"被解释成拉线（只放行引脚 magnet） | 若你原本就有 `validateMagnet`，插件**包装**它（模式内仍会调用你的逻辑），退出时恢复原函数 |
| `graph.options.interacting`（`nodeMovable: false`）| 否则按元件想加引脚会被 X6 当成拖动元件 | 用代理函数叠加，退出时恢复原值 |
| `graph.disablePanning()` | X6 在 `node:unhandled:mousedown` 时会启动平移；拦了拉线又不关平移的话，"点元件加引脚"会变成"拖动画布" | 退出时 `enablePanning()`（仅当原本可平移） |

三条都能关：`blockNodeMove: false`、`blockPanning: false`（各自恢复原行为）。
若你的项目自己管理 `interacting`，建议保留默认 true 让插件包一层，或把 `blockNodeMove` 关掉自己处理。

---

## 5. 与其它 X6 插件共存

| 插件 | 共存情况 |
|------|----------|
| `Dnd`（拖拽落图） | 可直接用插件给的校验器实现"从调色板拖一个引脚到元件上"：`new Dnd({ target: graph, validateNode: portEditor.createDndDropValidator() })`，详见 README §4.1 |
| `Selection` | ⚠️ **必须注意**：X6 的节点选框 `div.x6-widget-selection-box` 是 `pointer-events: auto`，正好盖在元件轮廓上（引脚所在处）。选中元件后按引脚**起不了线**。处理：`new Selection({ pointerEvents: 'none' })`（推荐）或 `showNodeSelectionBox: false`。插件检测到这种情况会 `console.warn` 提醒；插件自身不受影响（点击与落点判定走 `elementsFromPoint`，可穿透覆盖层）。实测见 `examples/02-power-editor` |
| `Snapline` / `Scroller` / `MiniMap` | 不冲突；插件不动这些插件的状态 |
| `History` | 引脚增删都走 model API，因此**可撤销**；插件已把"补组定义 + 加引脚"、"删引脚 + X6 连带删掉的线"各自合进一个 `model.startBatch/stopBatch`，所以**一步撤销**。宿主自己组合多步操作时也可用同样手法合批 |
| `Keyboard` | 插件自己监听 `Escape`（只在添加模式内生效），不与 Keyboard 插件的快捷键注册冲突 |
| `Transform` | 与 `positionUnit: 'percent'` 配合更自然（resize 后引脚按比例贴合） |

---

## 6. 导出 / 导入（图 → JSON → 图）

引脚是**节点数据的一部分**（`ports.groups` + `ports.items[].args`），X6 自带序列化天然覆盖：

```js
// 导出
const state = {
  graph: graph.toJSON(),                                  // { cells: [...] }，含 ports
  viewport: { zoom: graph.zoom(), ...graph.translate() },  // 视口不在 toJSON 里，单独存
}

// 导入
portEditor.stopAdding()        // 先退出添加模式再重建
graph.fromJSON(state.graph)
graph.zoom(state.viewport.zoom)
graph.translate(state.viewport.tx, state.viewport.ty)
```

已实测：节点/引脚（id、group、位置、样式）、连线（含"从哪个引脚出发"的 `source.port`）都能**逐字节复原**；
复原后的引脚依旧可交互。demo 底部 JSON 面板就是干这个的。

---

## 7. 已知坑速查（现象 → 原因 → 处理）

| 现象 | 原因 | 处理 |
|------|------|------|
| 打包报 `Could not resolve "tslib"` | X6 的 `es/lib` 产物 import tslib，但 X6 未声明该依赖 | `npm i tslib` |
| `tsc` 报 `TS7016: lodash-es`（6 条） | 符号链接安装时 TS 顺着链接解析到插件目录下的 `lodash-es` | `tsconfig` 开 `skipLibCheck: true` |
| **选中元件后，按引脚拉不出线** | X6 Selection 的节点选框盖住轮廓（引脚就在轮廓上），`pointer-events: auto` | `new Selection({ pointerEvents: 'none' })` 或 `showNodeSelectionBox: false`；插件会 console.warn 提醒 |
| 拖拽建边时报 `r.getSource is not a function` | `connecting.createEdge` 返回了普通对象 | 必须返回 Edge 实例：`this.createEdge(metadata)` |
| 加了引脚后想点元件，结果画布被拖走了 | X6 `panning.enabled` 默认 `true`，`interacting:false` 只关元件拖动 | 只读小图/调色板显式 `panning: false`；插件在添加模式内会自动关 |
| 从调色板拖东西上来，落点判定找不到元件 | Dnd 拖拽容器 `pointer-events: auto` 盖住画布，`elementFromPoint` 看不到元件 | 插件已用 `document.elementsFromPoint` 穿透；自己写落点判定时别用单数版本 |
| 引脚"跑到半宽处" | `normalizePercentage` 把 (0,1) 的小数当比例 | 插件已吸附处理；自己写 args 时避免 0<x<1 的裸数字 |
| 点元件加引脚时，元件被拖动 | 元件可拖动 + 无 magnet 消费该次按下 | 保持 `blockNodeMove: true`（默认） |

---

## 8. 设计红线（本项目明确不做）

> **引脚必须是人刻意为之的产物。**

- 允许的入口只有两个：① 添加模式内**主动点击**轮廓；② 从调色板**主动拖**引脚模板到元件上。
- **不做**"拖线即生成引脚"（GoJS 式临时端口），也不做"接线时附近没引脚就自动补一个"。
  理由：端子是有编号/类型/方向的实体，凭空多出的无名引脚会污染图纸数据；图纸严谨性优先于操作省事。
- 任何将来新增的入口，都必须能回答："这个引脚是用户在哪一步明确要求创建的？"

---

## 9. 插件用到的 X6 公开 API 清单（升级 X6 后自查用）

**X6 API**：`graph.use / getPlugin`、`graph.on / off`、`graph.getNodes`、`graph.container`、`graph.options.connecting.validateMagnet`、
`graph.options.interacting`、`graph.isPannable / disablePanning / enablePanning`、`graph.toJSON / fromJSON`、`graph.zoom / translate`、
`node.addPort / removePort / hasPort / getPorts / prop('ports/groups')`、`node.findView(graph)`、`view.container`、`view.can('nodeMovable')`。

**浏览器 / SVG API**：`document.elementsFromPoint`、`document.elementFromPoint`、`Element.closest`、
`getScreenCTM()`、`getCTM()`、`getTotalLength()`、`getPointAtLength()`、`DOMPoint/matrixTransform`（均为标准 API，无需 polyfill）。

升级 X6 后最该先跑的回归点：**添加模式内"从引脚拉线仍可用"** 与 **"按下元件本体不会平移/拖动"** —— 这两条依赖
`validateMagnet` 与 `interacting` 的调用时机（X6 在调用时读取，所以插件可以运行时叠加、退出还原）。

---

## 10. 自测

```bash
npm install && npm run build
npm run test:e2e          # 插件的 59 条断言（真实 Chrome：模式守卫、贴轮廓、删引脚、拖拽建引脚、连线样式、导出导入）
npm run test:examples     # 五个例子的 73 条断言（用之前vs之后 / 最小接入 / 难形状 / 接进你自己的数据 / 电力场景）
npm test                  # 上面三套一起跑（外加轮廓缺陷门禁，共 151 条）
npm run demo              # http://127.0.0.1:8732/demo/index.html 手工验收（examples/ 也可直接打开）
```

`test/EVIDENCE.md` 记录了最近一次完整跑通的原始输出、覆盖清单，以及**明确未验证**的部分（引脚拖动、hide/show、大规模性能、旋转/缩放断言、触摸设备）。
