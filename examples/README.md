# 例子（examples）

`examples/` 是一个**独立的消费方项目** —— 这是刻意的：

- 它有自己的 `package.json`，插件依赖写成 `github:william-xue/x6-plugin-port-editor#v0.1.1`，
  跑 `npm install` 时**从 GitHub 真的装一遍**（npm 会 clone 并自动执行插件的 `prepare` 构建出 `dist/`）；
- 页面加载的是 `../node_modules/x6-plugin-port-editor/dist/index.umd.js`，
  **不是仓库自带的构建产物** —— 所以你看到的，就是你自己项目里会长成什么样；
- 装完直接开静态服务就能跑（零打包器）。

```bash
cd x6-plugin-port-editor
cd examples && npm install && cd ..   # 等价于在仓库根目录跑 npm run examples:install
npm run demo                          # 零依赖静态服务，端口 8732
```

> 忘了装依赖就打开页面？页面会挡住并直接告诉你敲哪条命令（`examples/_shared/require-plugin.js`）。
> 顺带说明：仓库根目录的 `demo/` 用的是自带 `dist/`，那是**开发本插件时的自测台**，两者用途不同。

| 例子 | 入口 | 看什么 |
|------|------|--------|
| **首页** | `/examples/index.html` | 它替你解决什么问题、四种引用方式、已知边界 —— 给第一次接触的人看 |
| **例 0 · 用之前 vs 用之后** | `/examples/00-before-after/index.html` | 同一批元件左右各摆一份：左边不接插件（手写坐标），右边接上插件。**用数字量出差别**（手工估坐标离真实轮廓 21.9 px；插件落点 0 px），并且左边点轮廓毫无反应 |
| 例 1 · 最小接入 | `/examples/01-basic/index.html` | 已有 X6 图 → 接上 8 行 → 加引脚 / 拉线 / 删除全链路；页面左侧把「你原有的代码」和「新增的接入代码」并排列出 |
| 例 3 · 难形状 | `/examples/03-hard-shapes/index.html` | 五种最容易"贴不上"的形状：直边 `<line>`、带孔洞 `<path>`、矩形+双圆（变压器）、同心圆环、开放折线。右侧列出插件**实际读到了几条轮廓**，「轮廓可视化」把同一结果画到画布上 |
| **例 4 · 接进你自己的数据** | `/examples/04-host-state/index.html` | 端子增删 → 采成**你自己的数据结构**（右侧面板实时变）→ 用那份数据把图重建回来。证明"端子是数据"能落到业务层：监听 X6 自己的 `node:change:ports` 就够了，插件不另造事件 |
| 例 2 · 电力组件场景 | `/examples/02-power-editor/index.html` | 自定义元件形状（CT / 主变 / 断路器）、项目自己的端子组与样式、选中态穿透、与 Selection / History 共存、调色板拖拽建元件与建端子、导出导入 |

五个例子都有自动化验证：`npm run test:examples`（真实 Chrome、真实鼠标事件）。

---

## 例 0：用之前 vs 用之后（00-before-after）

要回答的问题只有一个：**"我自己也能给端子写坐标，为什么要用你这个插件？"**

左右两边是**同一批元件**（圆的 CT、六边形主变、圆角矩形断路器），差别只有右边多了一行
`graph.use(portEditor)`。左边走 X6 原生的路 —— 端子是**数据**，得在元件定义里声明
`ports.items`，或运行时 `node.addPort({ args: { x, y } })` **自己算坐标**。所以左边给了两个按钮：

| 左边（不接插件） | 结果 |
|------------------|------|
| 「手写坐标（估一个）」 | 端子放在元件框角上 → 实测**离真实轮廓 21.9 px**（在图形外面） |
| 「手写坐标（算准了）」 | 自己把圆心半径算出来 → **0.00 px**，能做到，但每次换形状、每次 resize 都得重算 |
| 用鼠标点轮廓 | **毫无反应** —— X6 核心从不绑定原生 `mousemove`，也没有轮廓命中 |

右边同一批元件：点「添加引脚」→ 悬停出现落点预览 → 点一下 → 引脚落在真实轮廓上（实测 0.00 px）。

「离真实轮廓多少 px」两边用**同一个量法**（都调插件导出的
`collectOutlineElements` + `findNearestOutlinePoint`；左边那个图只是没有 `graph.use(plugin)`），
所以两个数字可比 —— 这也是这页能被 e2e 断言的原因。

---

## 例 4：端子接进你自己的数据（04-host-state）

接进真实项目时最容易卡住的不是"怎么加引脚"，而是"**加完之后我的业务数据怎么办**"。

这一页给一个完整闭环：

```text
在图上点轮廓加端子  →  node:change:ports 触发  →  采成你自己的结构（右侧面板实时变）
                    →  清空整图  →  用那份数据重建回来（端子编号与坐标都活下来）
```

```js
// 你自己的数据长这样，只留业务用得上的字段
{ nodes: [ { id, kind, x, y } ], pins: [ { nodeId, id, x, y } ] }

// 端子一变就重新采一遍 —— 监听的是 X6 自己的事件
graph.on('node:change:ports', renderState)
```

关键点：端子本来就是 X6 的数据（`node.ports.items[]`），插件只是**用交互去写这份数据**。
所以「后端给一份数据 → 载入成图」和「图上改完 → 存回后端」这两头都不需要插件参与。

页面上第三个按钮演示的就是前者：不碰画布，直接喂一份数据进去。

---

## 例 3：难形状（03-hard-shapes）

这一页是给**第一次接触插件的人**看的：它到底能处理什么。五种形状各对应一个真实踩过的坑。

| 形状 | 为什么容易出问题 | 插件读到的轮廓 |
|------|------------------|----------------|
| ① 直边 `<line>`（母线、横担） | 几何白名单里少一个 `line`，这个元件就**一条轮廓都读不到**，预览与落点全无 | 1 条，长度 160 |
| ② 带孔洞 `<path>`（两个子路径） | 浏览器把多个子路径当成**一条曲线**，交界处直接跳过；不按断口切开就会连出一条屏幕上不存在的斜线 | 1 条，长度 760 |
| ③ 矩形 + 两个圆（变压器符号） | 多个图形拼成一个符号，需要**取离指针最近的那条** | 3 条，长度 968 |
| ④ 同心圆环 | 两个同心圆各自独立：从外面点贴外圈，从内圈点贴内圈 | 2 条，长度 527 |
| ⑤ 开放折线 `<polyline>` | 折线首尾本来不连，采样点首尾**不能用取模相连**，否则凭空多出一条封口线 | 1 条，长度 259 |

页面右侧的表格用插件自己导出的 `collectOutlineElements()` 现读，所以它列的就是插件**实际看到的东西**；
「轮廓可视化」把同一结果克隆到根 `<svg>` 上（不放进元件容器 —— 放进去会被插件当成新的候选轮廓），
于是叠加层与原件逐像素重合、又完全不干扰插件。

其中 ①② 两条是 2026-09-26 修掉的真实缺陷，前后对照数字见 [`../test/EVIDENCE.md`](../test/EVIDENCE.md) §6。

---

## 例 1：最小接入（01-basic）

页面右侧的代码与页面行为一一对应，只有两段：

```js
// ① 你原有的代码：Graph 配置、元件 attrs、你自己的端口定义 —— 一行都不用改
const graph = new Graph({ container: '#graph', connecting: { allowBlank: false } })
graph.addNode({ id: 'a', /* ... */, ports: { items: [] } })   // 连端口组都没声明也没关系

// ② 新增的接入代码
const portEditor = new PortEditor({
  onModeChange: (adding) => { btn.classList.toggle('active', adding) },  // 可选用：同步工具栏
})
graph.use(portEditor)
btn.addEventListener('click', () => {
  portEditor.isAdding() ? portEditor.stopAdding() : portEditor.startAdding()
})
```

跑起来会发生什么：

1. 点「添加引脚」→ 画布进入添加模式（光标变十字；元件暂不可拖动、画布暂不可平移）
2. 鼠标移到元件轮廓 → 出现蓝色落点预览（投影到**真实轮廓**，不是包围盒）
3. 点一下 → 生成 `pin-1`，位置就是落点（`ports.groups.pin` 由插件自动补一份默认定义）
4. `Esc` 退出 → 从引脚拖到另一个元件即可拉线（X6 原生 magnet）
5. 重新进入模式，悬停引脚 → 点「×」删除（连在它上面的线一并删掉）

---

## 例 2：电力组件场景（02-power-editor）

这一版贴着你项目的样子来：

```js
// 1) 自定义元件形状：注册一次，全项目复用
Graph.registerNode('power-ct', {
  shape: 'power-ct', width: 96, height: 96,
  markup: [{ tagName: 'circle', selector: 'body', attrs: { cx: 48, cy: 48, r: 46 } },
           { tagName: 'text', selector: 'label', attrs: { x: 48, y: 54, textAnchor: 'middle' } }],
  attrs: { body: { fill: '#fff', stroke: '#5F95FF', strokeWidth: 2 } },
}, true)

// 2) 项目自己的端子组（方形端子 + 标签），名字自己定
const TERMINAL_GROUP = {
  position: 'absolute',
  markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
  attrs: {
    body: { x: -5, y: -5, width: 10, height: 10, fill: '#1677FF', magnet: true },  // magnet 决定能否起线
    label: { fontSize: 9, fill: '#666', textAnchor: 'middle', y: 16 },
  },
  zIndex: 2,
}
const mkPorts = () => ({ groups: { terminal: TERMINAL_GROUP }, items: [] })

// 3) 接入插件：指定你自己的组名与 id 前缀
const portEditor = new PortEditor({
  group: 'terminal',        // ← 用项目里的端子组名（默认是 'pin'）
  idPrefix: 'T',            // 端子 id：T-1、T-2…
  groupConfig: TERMINAL_GROUP,   // 万一某元件没声明该组时兜底
})
graph.use(portEditor)

// 4) 与 Selection / History 共存
graph.use(new Selection({
  enabled: true, rubberband: true, multiple: true, showNodeSelectionBox: true,
  pointerEvents: 'none',    // ← 关键：否则选择框会盖住端子所在处的轮廓
}))
graph.use(new History({ enabled: true }))

// 5) 调色板拖拽：元件模板照常落地；「端子」模板落到元件上变成端子（自身不落地）
const dnd = new Dnd({ target: graph, validateNode: portEditor.createDndDropValidator() })
graph.use(dnd)
palette.on('node:mousedown', ({ node, e }) => dnd.start(node, e))
```

这一版能验证到的行为（e2e 都断言了）：

- 元件是自定义形状（圆的 CT、六边形主变、圆角矩形断路器）→ 落点沿各自**真实轮廓**
- 端子组用项目自己的 `terminal`、id 前缀 `T`
- **选中元件后**（选择框已出现）仍能点轮廓加端子 —— 因为插件的点击与落点判定走 `document.elementsFromPoint`，能穿透覆盖层
- 端子（连在它上面的线）增删**可撤销**；加一个端子 = **一步撤销**（插件把"补组定义 + 加端子"合进一个 batch）
- 调色板拖端子模板到主变 → 主变上生成端子，模板**不落地**成元件
- 导出 JSON（端子 + "从哪个端子出发"的绑定）→ 清空整图 → 导入 → 状态**逐字节一致**

---

## 引脚功能是怎么实现的（原理）

以下每一步都可以在 `src/` 里找到对应实现。

### 1. 引脚在 X6 里本来就是"数据"，不是"交互"

- 数据结构：`node.ports.groups`（每个组的布局算法与样式）+ `node.ports.items[]`（每个引脚，含 `args` 位置）
- 渲染：`NodeView.renderPorts()` 按 `port-layout` 注册表算位置（`absolute` / `line` / `ellipse…`）并缓存 DOM
- 交互：引脚上的 `magnet: true` 才是"能不能从这里起线"的开关

插件做的事就是**用交互去写这份数据**：`node.addPort({ id, group, args })`。所以引脚天然可序列化、可撤销、可导出。

### 2. 落点：把指针投影到"真实轮廓"上（`src/outline.ts`）

1. 取节点 markup 里的几何图形（`rect/circle/ellipse/path/polygon/polyline`，排除端口/标签/工具层）
2. 沿轮廓用 `getTotalLength()` + `getPointAtLength()` 采样（约每 2px 一个点，带缓存）
3. 把指针用 `getCTM()/getScreenCTM()` 换算到该图形的用户空间，找最近采样点，再在相邻两点之间做线段最近点修正
4. 多个图形（如变压器 = 矩形 + 圆）取**全局最近**的那条轮廓
5. 结果换算回节点本地坐标 —— 这正是 `ports.items[].args` 所在的坐标系，所以位置一次写对

几何解析全交给 CTM，**平移/缩放/节点旋转都不用特判**。这也解释了为什么圆、多边形、自定义 path 都能贴合。

### 3. 悬停怎么感知：X6 核心没有 hover 级 mousemove

X6 全仓只有类型定义里出现 `'mousemove'`，**核心从不绑定原生 `mousemove`**；`node:mousemove` 只在拖拽过程中触发。
所以轮廓悬停预览必须由插件自己在 `graph.container` 上监听 `mousemove`（capture 阶段），命中用 `document.elementsFromPoint(...)`（复数，返回堆叠栈）逐层找 `.x6-node` —— 这一步很关键：X6 的选择框、Dnd 的拖拽层都是 `pointer-events: auto`，单数的 `elementFromPoint` 会被它们挡住。

### 4. 添加模式为什么是"一整套守卫"

「添加引脚」是一个编辑模式，语义是**只改变"点击"的含义，不改变"从引脚拖拽"的含义**。模式内临时改三个全局开关，退出逐项还原：

| 临时改动 | 不改会怎样 |
|----------|-----------|
| `graph.options.connecting.validateMagnet` 只放行引脚 magnet | 按元件本体（本来就是 magnet）会被解释成拉线 |
| `graph.options.interacting` 里 `nodeMovable: false` | 按元件加引脚会被当成"拖动元件" |
| `graph.disablePanning()` | X6 在 `node:unhandled:mousedown` 时会启动平移 → "点元件"变成"拖动画布"，视图静默位移、后续坐标全错 |

三条都是**运行时叠加**（X6 在调用时读取这些选项），因此退出后能原样还原，不碰任何 cell 数据；e2e 对三项都断言了"退出后还原"。

### 5. 点击也走容器层，而不是 X6 的 `node:click`

原因同 §3：覆盖层会吞掉点击。插件在 `graph.container` 上监听 `click`（capture），用 `elementsFromPoint` 找元件，并忽略"按下后移动超过 5px"的拖拽。这样即使元件被选中、选择框压在轮廓上，点轮廓依然能加引脚。

### 6. 删除引脚：X6 内建语义 + 一步撤销

X6 自己会在引脚被删掉时移除挂在它上面的边（`Node.processRemovedPort`）。插件把"删引脚 + 连带删边"包进一个 `model.startBatch/stopBatch`，所以是一次撤销。
**不做**的事：不在接线时隐式生成引脚（设计红线，见 `docs/INTEGRATION.md` §8）。

---

## 改成你自己的东西

| 想改什么 | 改哪里 |
|----------|--------|
| 元件形状 / 大小 / 标签 | `Graph.registerNode(...)` 的 `markup` 与 `attrs`（例 2） |
| 端子外观（方形/圆形/带标签） | `TERMINAL_GROUP`，或直接用节点上的 `ports.groups.<你的组名>` |
| 端子组名与 id 前缀 | `new PortEditor({ group: '你的组名', idPrefix: 'X' })` |
| 位置存储语义（resize 行为） | `positionUnit: 'local' \| 'percent'` |
| 只指定某条轮廓 | `outlineSelector: 'body'` |
| 一次只加一个就退出模式 | `stopAfterAdd: true` |
| 不想让插件写任何数据 | `autoCreateGroup: false`（组必须自己声明） |

更多共存与排查细节见 [`../docs/INTEGRATION.md`](../docs/INTEGRATION.md)。
