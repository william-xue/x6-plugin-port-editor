# x6-plugin-port-editor

AntV X6 的**交互式引脚（pin / port）编辑器**插件：点一下工具栏的「添加引脚」，把鼠标移到元件**轮廓**上，就地生成一个引脚；从引脚拖拽即可拉线到另一台设备；悬停引脚点「×」删除。

> **接入到已有项目？直接看 [`docs/INTEGRATION.md`](docs/INTEGRATION.md)** —— 前置检查清单、最小接入 10 行、
> 与你已有元件形状/端口定义共存、与 Dnd/Selection/History 等插件共存、添加模式内临时改动哪三个全局开关、
> 已知坑速查表、以及插件依赖的 X6 公开 API 清单（升级 X6 后自查用）。
>
> **想看跑起来的代码？直接看 [`examples/index.html`](examples/index.html)** ——
> 例子是一个**独立消费方项目**（插件从 GitHub 装，不是仓库自带构建），一页讲清「它替你解决什么问题 + 四种引用方式」，然后：
> **例 0 用之前 vs 用之后**（同一批元件左右各一份，用数字量出差别：手工估坐标离真实轮廓 21.9 px，插件落点 0 px）、
> **例 1** 最小接入（原有代码 / 新增 8 行并排对照）、
> **例 3 难形状**（直边 / 带孔洞 / 矩形+双圆 / 同心圆环 / 开放折线，右侧列出插件实际读到了几条轮廓）、
> **例 2** 电力组件场景（自定义元件形状 + 自己的端子组 + 选中态穿透 + History 一步撤销 + 调色板拖拽 + 导出导入），
> 并附**实现原理逐步讲解**。

- 纯插件形态，**不需要改 X6 核心**，也不依赖上游合并
- 对 `@antv/x6` 只有**类型引用**，构建产物零运行时依赖（ESM / CJS / UMD 三种）
- 支持**异形元件**：落点投影到元件真实轮廓上，不是包围盒 ——
  圆 / 多边形 / 自定义 path / **直边 `<line>`** / **带孔洞的一条 path** / **矩形+双圆拼成的变压器符号** 都能贴
  （难形状见 `examples/03-hard-shapes/`，每类都有常驻断言）
- 两种入口：**点一下加引脚**（编辑模式）与**从调色板拖一个引脚到元件上**（Dnd）
- 图可导出为 JSON 再原样复原（含引脚与"从哪个引脚出发"的连线绑定）
- 版本：v0.1.0 ｜ 已在 @antv/x6 **3.1.8** + 真实 Chrome 上通过端到端断言（轮廓缺陷门禁 19 + 插件 59 + 例子 73，共 **151** 条，见 `test/EVIDENCE.md` 与 `npm test`）
- 上游形态：同一份实现已按官方插件形态提交到主仓 —— **antvis/X6#5093**
  （`src/plugin/port-editor/` + `site/docs/tutorial/plugins/port-editor.{zh,en}.md` + 20 条 jsdom 单测；本仓是被上游接受前的可用形态，两者并行维护）
- **唯一对外入口是 GitHub**（本仓不发 npm）：`npm install github:william-xue/x6-plugin-port-editor`

---

## 1. 为什么这个功能只能靠插件补

X6 把引脚定位成「由宿主代码声明的数据」，因此：

| 层 | X6 现状 |
|----|---------|
| 数据层 | 完备：`node.addPort()` / `removePort()` / `portProp()` / `hasPort()` |
| 渲染层 | 完备：引脚 DOM + 布局算法（`absolute` / `line` / `ellipse…`）+ 缓存 |
| 连接层 | 完备：引脚即 magnet，可直接拉线，校验链路完整 |
| **编辑层** | **缺失**：内置 node tool 仅 boundary / button / button-remove / node-editor；内置 plugin 11 个无 port 相关；全仓无 `hidePort`/`showPort` |
| 文档层 | 只教 API（`docs/tutorial/basic/port`「Modifying Connection Ports」只有三段代码示例） |

上游公开表态：issue #3887 维护者回复「The ports cannot be dragged」；issue #4460 要 hide/show 引脚，只被回了 `addPort` 文档链接。

本插件补的就是**编辑层**，且只使用公开 API：

```
graph.use(plugin)                                  // 插件契约：{ name, init(graph, options?) }
node.addPort / removePort / portProp / hasPort     // 数据
node.findView(graph) → view.container              // 轮廓几何
graph.options.connecting.validateMagnet            // 添加模式下屏蔽拉线（X6 调用时读取，可运行时替换）
graph.container                                    // 覆盖层宿主（与内置 snapline 同款做法）
```

---

## 2. 安装

```bash
# A. 直接从 GitHub 装（推荐 —— npm 会 clone 并自动跑 prepare 构建出 dist）
npm install github:william-xue/x6-plugin-port-editor

# B. 锁到某个提交，可复现（机制同 A）
npm install github:william-xue/x6-plugin-port-editor#<commit-sha>

# C. 本地路径（在同一个仓库里改插件、边改边用时用这个）
npm install /path/to/x6-plugin-port-editor
```

```js
// D. 打包器里 import
import { PortEditor } from 'x6-plugin-port-editor'
```

不想用打包器就用 UMD 产物（全局 `X6PluginPortEditor`）：

```html
<script src="x6/node_modules/@antv/x6/dist/x6.min.js"></script>
<script src="x6-plugin-port-editor/dist/index.umd.js"></script>
<!-- window.X6PluginPortEditor.PortEditor -->
```

> **本仓库不发 npm**，A–D 就是全部引用方式（A 已实测：装完 `dist/` 里 mjs/cjs/umd/d.ts 齐全，`import` 正常）。
> peerDependency：`@antv/x6 >= 3.0.0`（开发时实测 3.1.8）。

想先看效果再装？打开 `examples/index.html`（先 `npm run examples:install` 装一次例子的依赖）。

> **`examples/` 就是"你的项目"的样子**：它有自己的 `package.json`，依赖写成
> `github:william-xue/x6-plugin-port-editor#v0.1.0`，`npm install` 时**从 GitHub 真的装一遍**
> （npm 会 clone 并自动跑插件的 `prepare` 构建出 `dist/`），页面加载的是装进来的那份产物。
> `npm run examples:install` 一步搞定；没装就打开页面会被挡住并直接告诉你敲什么命令。

### 2.1 只在自己项目里用、不发 npm —— 四种方式（均已实测）

| 方式 | 命令 / 做法 | 结果与注意 |
|------|-------------|------------|
| **① tgz 安装（最推荐）** | `cd x6-plugin-port-editor && npm pack` → 得到 `x6-plugin-port-editor-0.1.0.tgz` → 在项目里 `npm i /abs/path/x6-plugin-port-editor-0.1.0.tgz` | npm 把包**真实拷贝**进 `node_modules`，行为与"真发过版"一致；含 ESM/CJS/UMD + `.d.ts`。改了插件记得重新 `npm run build && npm pack` 再装一次 |
| **② 拷贝 dist** | 把 `dist/` 拷进项目（如 `src/vendor/port-editor/`），`import { PortEditor } from './vendor/port-editor/index.mjs'` | 零安装、零编译、不用改 tsconfig；适合"用一次就走" |
| **③ file: 依赖（符号链接）** | `npm i /abs/path/x6-plugin-port-editor` | 装成符号链接，**改插件源码项目立刻生效**（适合边改边用）；注意下方两个坑 |
| **④ 直接 import TS 源码** | 把 `src/` 拷进项目（如 `app/vendor/port-editor/`），`import { PortEditor } from './vendor/port-editor/index'` | 零 dist 依赖、完全可改；要求项目能编译 TS + 装了 `@antv/x6`、`tslib`，且 `tsconfig` 开 `skipLibCheck`（实测通过） |

**实测到的三个环境坑（都不是插件的问题）**

1. **项目里需要有 `tslib`**：`@antv/x6@3.1.8` 的 `es/`、`lib/` 产物里 `import { __decorate } from "tslib"`，但它自己的 `package.json` **没有声明 tslib**（实测依赖只有 dom-align / lodash-es / mousetrap / utility-types）。纯净项目打包 X6 会报 `Could not resolve "tslib"`，`npm i tslib` 即解。多数项目能跑是因为 Vue/工具链的传递依赖里带了它。
2. **建议 `tsconfig` 开 `skipLibCheck: true`**（Vue/Vite 官方模板默认就是开的）：用方式 ③（符号链接）时，TS 会顺着链接进插件自己的 `node_modules` 解析 `@antv/x6`/`lodash-es`，而 `lodash-es` 没有自带声明 → 6 条 `TS7016`。开了 `skipLibCheck`：实测 0 条错误。
3. 纯 Node 里 `import { Graph } from '@antv/x6'` 拿不到具名导出（X6 面向浏览器/打包器）。**不影响本插件**（零运行时依赖），但别拿 Node 直接跑 X6 的 DOM 代码。


---

## 3. 30 秒上手

```js
import { Graph } from '@antv/x6'
import { PortEditor } from 'x6-plugin-port-editor'

const graph = new Graph({
  container: document.getElementById('graph'),
  connecting: { allowBlank: false, router: 'orth' },
})

graph.addNode({
  id: 'ct',
  x: 120, y: 120, width: 110, height: 110,
  markup: [{ tagName: 'circle', selector: 'body', attrs: { cx: 55, cy: 55, r: 54 } }],
  attrs: { body: { fill: '#fff', stroke: '#5F95FF', strokeWidth: 2 } },
})

const portEditor = new PortEditor()   // 默认 group = 'pin'，节点上没有该组时自动创建
graph.use(portEditor)

// 工具栏按钮
document.getElementById('btn-add-pin').addEventListener('click', () => {
  portEditor.isAdding() ? portEditor.stopAdding() : portEditor.startAdding()
})
```

跑内置 demo：

```bash
npm install && npm run build && npm run demo
# → http://127.0.0.1:8732/demo/index.html
# demo 里有三个元件：圆形（CT）、矩形（SF6 断路器）、六边形（主变）—— 专门用来验证异形轮廓落点
```

---

## 4. 交互

「添加引脚」是一个**编辑模式**，它的语义是"只改变点击的含义，不改变从引脚拖拽的含义"：

| 动作 | 普通状态 | 添加引脚模式 |
|------|----------|--------------|
| 点击元件 | 无 | **在最近轮廓点生成引脚**（`pin-1`、`pin-2`…，可连续添加） |
| 鼠标移到元件轮廓上 | 无 | 蓝色落点预览（指针在元件内部时投影到最近的一条边） |
| 从**已有引脚**拖拽 | 拉线 | **照常拉线**（加完引脚立刻接线，不必退出模式） |
| 从**元件本体**拖拽 | 拉线（若本体是 magnet） | 无动作：不拉线、不移动元件、不平移画布 |
| 拖动元件 | 移动元件 | 不动作（模式内元件暂不可拖动） |
| 拖动空白画布 | 平移视图 | 不动作（模式内平移暂停） |
| 悬停已有引脚 | 无 | 红色「×」徽章，点击删除该引脚（**连同挂在上面的连线**） |
| `Esc` 或再点一次按钮 | – | 退出模式，以上能力**逐项原样恢复** |

> 模式内的这三条"守卫"都可以关掉：`blockNodeMove`、`blockPanning`，以及"本体起线屏蔽"由内部 magnet 守卫负责。

### 4.1 另一种入口：从调色板拖一个「引脚」到元件上

如果你更习惯"拖拽式"而不是"点一下"，插件提供了现成的落点判定 + Dnd 校验器：

```js
import { Dnd } from '@antv/x6'

// 1) 调色板（一个只读小图）里放一个"引脚"模板：实心圆点
palette.addNode({
  id: 'tpl-pin',
  width: 16, height: 16,
  markup: [{ tagName: 'circle', selector: 'body', attrs: { cx: 8, cy: 8, r: 7 } }],
  attrs: { body: { fill: '#5F95FF' } },
  data: { pinTemplate: true },        // ← 默认判据
})

// 2) 主图装 Dnd，validateNode 直接用插件给的
const dnd = new Dnd({ target: graph, validateNode: portEditor.createDndDropValidator() })
graph.use(dnd)

// 3) 从调色板按下即开始拖拽
palette.on('node:mousedown', ({ node, e }) => dnd.start(node, e))
```

行为：拖到元件上 → 在该元件的**最近轮廓点**生成引脚，模板节点**不落地**；拖到空白 → 什么都不发生。
模板判据可换：`createDndDropValidator({ isPinTemplate: (node) => node.shape === 'my-pin' })`。
普通模板（矩形/圆形/多边形）照常落地成新元件 —— 两种拖拽共用一个 Dnd 实例即可。

> 调色板小图记得 `panning: false`：`interacting: false` 只关掉元件拖动，**X6 的 `panning.enabled` 默认是 `true`**，不关的话你在调色板上按住会把调色板自己拖走（踩过的坑，见 §6-10）。

---

## 4.2 连线样式（这是 X6 的 edge 配置，与引脚插件无关）

X6 默认边定义里就带一个箭头：`attrs.line.targetMarker = 'classic'`（源码 `src/shape/edge.ts:38`），
所以"有箭头"不是插件给的。想怎么配就怎么配，三条路：

```js
// 路 1：所有新边统一（推荐）—— 注意必须返回 Edge 实例
graph.options.connecting.createEdge = function () {
  return this.createEdge({
    shape: 'edge',
    router: { name: 'orth' },              // 路由：normal / orth / manhattan / metro / er / oneside / loop
    connector: { name: 'rounded' },        // 连接器：normal / smooth / rounded / jumpover / loop
    attrs: {
      line: {
        stroke: '#5F95FF',
        strokeWidth: 2,
        strokeDasharray: null,             // '6 3' = 虚线
        targetMarker: null,                // ← 去掉箭头；换成 'classic' | 'block' | 'diamond' | 'circle' | 'circlePlus' | 'cross' | 'async' | 'ellipse' | { name, size, offset, fill }
        sourceMarker: null,
        style: { animation: 'flow 30s infinite linear' },   // 虚线流动（潮流方向感），配 @keyframes { to { stroke-dashoffset: -300 } }
      },
    },
  })
}

// 路 2：改一条已有的边
edge.attr('line/targetMarker', null)
edge.setRouter({ name: 'manhattan' })
edge.setConnector('jumpover')

// 路 3：全局改默认（连 X6 自带的 'edge' 形状一起换掉）
Graph.registerEdge('edge', { /* 你的 markup + attrs */ }, true)
```

可用取值一览（都是 X6 自带的，也可以 `Graph.registerMarker/registerRouter/registerConnector` 自己注册）：

| 项 | 内置取值 |
|----|----------|
| marker（箭头/端点） | `classic` `block` `diamond` `circle` `circlePlus` `cross` `async` `ellipse` `path` |
| router（走线方式） | `normal` `orth` `manhattan` `metro` `er` `oneside` `loop` |
| connector（拐角连接） | `normal` `smooth` `rounded` `jumpover` `loop` |

demo 顶部有个「连线样式」下拉，切的就是这些预设（默认箭头 / 无箭头 / 虚线 / 虚线流动 / 跳线），可以直接对照看。

> ⚠️ `connecting.createEdge` **必须返回 Edge 实例**（用 `graph.createEdge(metadata)`）。返回普通对象会在拖拽建边时抛
> `Uncaught TypeError: r.getSource is not a function` —— X6 拿到返回值后立刻调 `getSource()/setSource()/setTarget()/addTo()`（`src/view/node/index.ts:1030`）。

---

## 4.3 导出 / 导入（图 → JSON → 图，含引脚）

引脚是**节点数据的一部分**（`ports.groups` + `ports.items[].args`），所以 X6 自带的序列化天然覆盖它，不需要插件做额外的事：

```js
// 导出：整张图
const state = {
  graph: graph.toJSON(),                                     // { cells: [...] }，含每个节点的 ports
  viewport: { zoom: graph.zoom(), ...graph.translate() },     // 注意：视口不在 toJSON 里，要单独存
}
localStorage.setItem('drawing', JSON.stringify(state))

// 导入：整张图重建
const saved = JSON.parse(localStorage.getItem('drawing'))
portEditor.stopAdding()          // 导入前先退出添加模式，避免在 magnet 守卫生效时重建
graph.fromJSON(saved.graph)      // 替换整张图（节点、引脚、引脚位置、连线端点绑定全都在里面）
graph.zoom(saved.viewport.zoom)
graph.translate(saved.viewport.tx, saved.viewport.ty)
```

导出的节点长这样（节选，引脚就在 `ports` 里）：

```json
{
  "id": "n-circle",
  "shape": "rect",
  "position": { "x": 260, "y": 60 },
  "ports": {
    "groups": { "pin": { "position": "absolute", "attrs": { "circle": { "r": 4.5, "magnet": true } } } },
    "items": [{ "id": "pin-1", "group": "pin", "args": { "x": 1.08, "y": 57.83 } }]
  }
}
```

连一样：

```json
{ "source": { "cell": "n-circle", "port": "pin-1" }, "target": { "cell": "n-hex" } }
```

**会复原的**：节点/元件形状与样式、引脚（id、group、位置、样式）、连线（含"从哪个引脚出发"的绑定）、自定义端口的 group 定义。
**不会自动复原的**（需要你自己另外存）：视图缩放与平移（见上面 `viewport`）、选中状态、你业务层挂在 `cell.data` 之外的东西。
**不用管的**：插件本身不需要重新挂载（它是 graph 级的）；导入后对新引脚的一切能力照旧。

demo 底部那个 JSON 面板就是干这个的：「导出 JSON」把当前图写进文本框，「导入 JSON」按文本框内容重建 —— 可以手工改 JSON 再导回来，试数据驱动。

---

## 5. API

### 构造 / 选项

```ts
new PortEditor(options?)  // 也可以 graph.use(new PortEditor(), options)
```

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `group` | `string` | `'pin'` | 引脚所属 group |
| `idPrefix` | `string` | `'pin'` | 自动生成 id 的前缀（`pin-1`…） |
| `positionUnit` | `'local' \| 'percent'` | `'local'` | 位置存储语义：`local` = 节点本地像素；`percent` = 相对节点尺寸百分比（resize 时表现不同，见 §6） |
| `outlineSelector` | `string` | 自动 | 指定轮廓元素选择器；不填则用节点内所有几何图形取最近者（异形元件推荐留空） |
| `sampleCount` | `number` | `240` | 轮廓采样上限（约每 2px 一个采样点） |
| `autoCreateGroup` | `boolean` | `true` | 节点缺少该 group 时自动写入一份默认定义（circle + magnet） |
| `groupConfig` | `object` | 见源码 | `autoCreateGroup` 写入的 group 定义，可换成你自己的端子外观 |
| `deleteBadge` | `boolean` | `true` | 悬停引脚是否显示删除徽章 |
| `stopAfterAdd` | `boolean` | `false` | 是否一次只加一个引脚后自动退出模式 |
| `blockNodeMove` | `boolean` | `true` | 添加模式下禁止拖动元件 |
| `blockPanning` | `boolean` | `true` | 添加模式下禁止平移画布 |
| `className` | `string` | – | 附加到覆盖层根节点的 class |
| `onModeChange` | `(adding: boolean) => void` | – | 模式进入/离开时回调（Esc 退出也会触发，便于同步工具栏） |
| `onPortAdded` / `onPortRemoved` | `(args: { node, portId }) => void` | – | 变更回调 |

### 方法

| 方法 | 说明 |
|------|------|
| `startAdding()` / `stopAdding()` / `isAdding()` | 添加模式开关与状态 |
| `addPin(node, localPoint)` | 以节点本地坐标添加引脚，返回 `portId` |
| `addPinAtClient(node, clientX, clientY)` | 以屏幕坐标添加（自动投影到轮廓） |
| `addPinFromDrop(clientX, clientY, node?)` | 拖拽落点建引脚：在落点所在元件的最近轮廓点建引脚，没落在元件上返回 `null` |
| `findNodeAtClient(clientX, clientY)` | 屏幕坐标下的元件（会穿透 Dnd 拖拽层） |
| `createDndDropValidator(options?)` | 生成 X6 Dnd 的 `validateNode`：把「引脚模板」拖到元件上即生成引脚，且模板本身不落地 |
| `removePin(node, portId)` | 删除引脚 |
| `clearPins(node)` | 清空该节点本插件的引脚 |
| `getPins(node)` | 取该节点本插件的引脚列表 |
| `enable()` / `disable()` | `startAdding()` / `stopAdding()` 的别名，兼容 `graph.enablePlugins()` |
| `dispose()` | 卸载插件：解绑事件、还原 `validateMagnet`、移除覆盖层 |

---

## 6. 实现要点（踩过的坑，都在源码注释里）

1. **X6 没有 hover 级 mousemove**：全仓库检索 `'mousemove'` 仅出现在事件类型定义里 —— 核心从不绑定原生 `mousemove`，`node:mousemove` 只在拖拽过程中触发。所以轮廓悬停预览必须由插件在 `graph.container` 上自己监听 mousemove（本插件即如此，capture 阶段绑定）。
2. **贴轮廓 = 投影到真实几何**：用 SVG 的 `getTotalLength()` / `getPointAtLength()` 沿轮廓采样，再在相邻采样点之间做线段最近点修正；多个图形（如变压器 = 矩形 + 圆）取全局最近者。
3. **坐标全部交给 CTM**：指针 → SVG root 用户空间（`getScreenCTM().inverse()`），元素用户空间 ↔ 节点本地空间用 `getCTM()` 链换算。平移、缩放、节点旋转都不用单独处理。
4. **位置语义坑**：X6 的 `normalizePercentage` 会把 **(0,1) 开区间内的裸数字当作比例**（0.5 → 50% 宽度）。插件写入坐标时会把落在该区间的值吸附到 0 或 1，避免"引脚忽然跑到半宽处"。`positionUnit: 'percent'` 用于希望引脚随元件 resize 保持相对位置的场景。
5. **添加模式下屏蔽的是"本体起线"，不是全部拉线**：引脚 mousedown 在 X6 里默认被解释为"开始拉线"（`NodeView.validateMagnet` → `startMagnetDragging`）。插件在模式内让非引脚 magnet 一律返回 `false`（`magnet.closest('.x6-port')` 判断），退出时**原样还原**（e2e 有断言）。这也解释了为什么 v1 **不做引脚拖动**：同一个手势在 issue #4648/#4649 里就是无解冲突。
6. **删除徽章不能挂在 node 的 mouseleave 上**：徽章位于节点之外，指针移向徽章时会触发离开节点 → 徽章会先消失。因此徽章独立于 hover 生命周期，只在"指针移到别的引脚/退出模式/视图变换/被点击"时收起。
7. **添加模式必须是一整套守卫，只拦拉线会出事**：X6 有 `node:unhandled:mousedown` 事件（`src/graph/panning.ts` 监听它）。当元件按下既不触发 magnet 拖拽、也不触发元件拖拽时，**平移会接管** —— 用户以为"在点元件加引脚"，实际是"拖动画布"，视图静默位移，之后所有坐标全部错位。所以模式内要同时：拦非引脚 magnet + 关 `nodeMovable` + 关 panning，退出时逐项还原（e2e 对三项都有断言）。
8. **必须放行"从引脚起线"**：早期版本在模式内屏蔽了所有拉线，导致"加完引脚接不上线"，必须先退出模式。正确语义是"模式只改变点击的含义，不改变从引脚拖拽的含义"。
9. **`view.can('nodeMovable')` 每次调用都读 `graph.options.interacting`**（`src/view/cell/index.ts:353`），因此可以在运行时叠加一个代理函数、退出时还原，不必改任何 cell 数据；panning 同理用公开的 `graph.disablePanning()/enablePanning()`。
10. **X6 的 `panning.enabled` 默认就是 `true`**，而 `interacting: false` 只关掉元件拖动 —— 只读小图（调色板）必须显式 `panning: false`，否则在它上面按下会平移它自己。
11. **拖拽落点判定要穿透覆盖层**：Dnd 的拖拽容器是 `pointer-events: auto`，`document.elementFromPoint` 在拖动过程中只能看到它。插件改用 `document.elementsFromPoint`（复数，返回堆叠栈）逐层找 `.x6-node`，再加一个 8px 光晕的最近盒兜底，落点偏几像素也能落在元件上。
12. **轮廓白名单必须含 `line`**（2026-09-26 修）：`getPointAtLength` 是所有几何元素通用的，但选择器少一个标签就等于**整个节点放不了引脚** —— 实测一个只用 `<line>` 画直边的元件，`collectOutlineElements` 返回 0 个元素，预览与落点全无。直边在电力图里到处都是（母线、横担、分隔线）。
13. **采样点不能用取模绕回首尾**（2026-09-26 修）：一条 `<path>` 可以有好几个子路径（带孔洞的形状），`getPointAtLength` 把它们**当成一条曲线**，交界处直接跳过去；数组首尾同理，它们并不是相邻的两个点。原实现用 `(bestIdx ± 1) % samples.length` 连接，于是连出**屏幕上不存在的线**：实测贴着断口端点 (21,21) 问最近轮廓点，落点就落在这条不存在的线上，离查询点只有 0.32，而真实边在 1.00 外。修法：先把采样点按断口切成若干 `runs`，段只在同一个 run 内相连，不再绕回。

---

## 7. 已知限制与后续

### 7.0 设计红线（用户 2026-09-25 明确否决，不要再提）

> **引脚必须是人刻意为之的产物。**

- ✅ 允许的入口只有两个，且都要求用户的显式意图：
  1. 进入「添加引脚」模式后**主动点击**元件轮廓（形态 A）
  2. 从调色板**主动拖一个引脚模板**到元件上（形态 B）
- ❌ **不做**：从元件边缘拖线时自动生成引脚（形态 C，"拖线即生成"/GoJS 式临时端口）。
  理由（用户原话：这个引脚必须是人刻意为之的东西）：隐式生成的引脚会污染电力元件的端子语义 ——
  端子是有编号/类型/方向的实体，不该因为"手一抖拖了条线"就凭空多出一个无名引脚；图纸的严谨性优先于操作省事。
- ❌ 同理不做：接线时"附近没有引脚就自动补一个"的折中变体。吸附到**既有**引脚可以谈，凭空**新建**不行。
- 任何将来新增的入口，都必须能回答一句："这个引脚是用户在哪一步明确要求创建的？"

### 7.2 轮廓缺陷审计（2026-09-26，真实 Chrome + 真实 X6，数字可复跑）

```bash
npm run test:outline    # 19 条断言门禁（红绿）
npm run test:measure    # 同一批点的测量报告（只打印数字）
```

案例页 `test/defect-cases/`，每个节点只放一个要考的几何形状，查询点与落点都在**节点本地坐标**里比。

| # | 案例 | 修复前 | 修复后 | 结论 |
|---|------|--------|--------|------|
| ① | `<line>` 当轮廓 | 元素 **0** 个，落点**无** | 元素 1 个，落点距离 0.00 | **已修**（白名单补 `line`） |
| ② | 开放折线，贴首点 (21,21) 问 | 落点落在**封口线**上，距离 **0.32** | 落在真实上边，距离 1.00 | **已修**（不再绕回首尾） |
| ③ | 两个子路径，贴缺口起点 (21,21) 问 | 落点落在**跨子路径连线**上，距离 **0.29** | 落在真实左边，距离 1.00 | **已修**（按断口切 run） |
| ③ | 同上，贴孔洞首点 (58,48) 问 | 距离 **0.40**（在幻影线上） | 落在孔洞角 (60,50)，距离 2.83 | **已修** |
| ④ | `visibility:hidden` 的形状 | 参与落点，距离 0.00 | **仍然参与** | 未改 —— 见下 |
| ⑤ | 长周长矩形（1580）拐角 | 偏 **2.13** | **仍然偏 2.13** | 未改 —— 见下 |

**为什么④⑤这次不动**（不是漏了，是判断）：

- **④** 用透明/隐藏矩形当"命中区"是常见做法，一刀切跳过会把这类用法弄坏。该不该处理是设计取舍，交给维护者拍板。
- **⑤** 均匀采样会把拐角削掉一块（深度 ≈ 步长/2，这里 1580/240 ≈ 6.58 → 削掉 2.13）。属**精度增强**，会让 diff 变大；单独一次改进更合适。
  （参照：同一成因在课程仓 13.6 里被修过；按 步长/2 推算，周长 4000 的零件会削掉约 8.4 —— 那是**推算**，不是实测。）

**③ 为什么"中点"测不出来，只有贴着端点才测得出来**：本实现是"先找最近采样点，再看它两侧的段"，不是全网段扫描。断口中部被真实采样点遮住，只有断口端点本身成为最近采样点时才会被够到。这一点在对照课程仓（7.3 是全段扫描）时表现不同 —— 算法不同，缺陷的"可触及面"也不同。

### 7.1 v0.1.0 不做
- 引脚拖动调整位置（与 magnet 拉线同手势冲突，需先解决 #4648/#4649 的语义）
- 引脚 hide/show（`hidePort` 属 model 层新 API，插件无法提供，需核心改动）
- 拓扑校验、自动编号、端子类型规则（属宿主业务层）

**待验证**
- 大规模节点（数百个）下的命中性能（当前实现按需用 `document.elementFromPoint` + DOM 盒预筛，未做基准）
- 旋转/嵌套节点、缩放画布下的落点精度（逻辑上由 CTM 保证，尚未单独断言）

**若要进 X6 核心**：把 `src/port-editor.ts` + `outline.ts` + `overlay.ts` + `style.ts` 搬进 `src/plugin/port-editor/`（目录结构与内置 `src/plugin/dnd`、`src/plugin/selection` 一致），在 `src/plugin/index.ts` 导出，再补 `site/docs/tutorial/plugins/*.md` 与 `site/examples/` 示例即可 —— 一次开发，两条交付路径。注意 X6 上游合并吞吐极低（近 90 天 3 次 merge，外部 feature PR 积压 5 个月以上），这条路径更多是"有实现之后再谈"。

---

## 8. 目录结构

```
x6-plugin-port-editor/
├── src/
│   ├── index.ts          导出面
│   ├── port-editor.ts    插件主体：模式状态机、公开 API、magnet 守卫、命中调度
│   ├── outline.ts        轮廓几何：采样、最近点投影、CTM 换算、采样缓存
│   ├── overlay.ts        覆盖层 DOM：落点预览 + 删除徽章（宿主 = graph.container）
│   ├── style.ts          覆盖层样式（注入一次，可被宿主样式覆盖）
│   └── types.ts          选项与类型
├── demo/                 index.html + demo.js（三个元件：圆 / 矩形 / 六边形）
├── scripts/serve.mjs     零依赖静态服务
├── test/e2e.sh           26 条真实浏览器断言
├── test/EVIDENCE.md      验证证据（原始输出）
└── build.mjs             esbuild(ESM/CJS/UMD) + tsc(.d.ts)
```

## 9. License

MIT
