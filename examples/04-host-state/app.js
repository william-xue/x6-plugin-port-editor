/* global X6, X6PluginPortEditor */
// 例 4 · 端子接进你自己的数据。
//
// 接进真实项目时最容易卡住的一步不是"怎么加引脚"，而是"**加完之后我的业务数据怎么办**"。
// 这一页给出一个完整闭环：端子增删 → 采成你自己的数据结构（右边面板实时变）
//   → 清空整图 → 拿这份数据把图重建回来（含端子编号与坐标）。
//
// 关键点：端子本来就是 X6 的数据（node.ports.items[]），插件只是"用交互去写这份数据"。
// 所以监听 X6 自己的 node:change:ports 就够了，插件不需要另造一套事件。

const { Graph } = X6
const { PortEditor } = X6PluginPortEditor

window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

const graph = new Graph({
  container: document.getElementById('graph'),
  grid: true,
  panning: true,
  connecting: { allowBlank: false, allowLoop: false, allowMulti: true },
})

const CIRCLE = { cx: 48, cy: 48, r: 46 }
const HEXAGON = '40,0 120,0 160,60 120,120 40,120 0,60'

const label = (text, y) => ({
  tagName: 'text',
  selector: 'label',
  attrs: { x: '50%', y, textAnchor: 'middle', fontSize: 11, fill: '#555555', text },
})

/** 元件目录：只描述"长什么样 + 叫什么"，端子一概不预置 */
const LIBRARY = {
  ct: {
    title: 'CT',
    width: 96,
    height: 96,
    markup: [
      { tagName: 'circle', selector: 'body', attrs: { ...CIRCLE, fill: '#eef2ff', stroke: '#5f95ff', strokeWidth: 2 } },
      label('CT', 52),
    ],
  },
  transformer: {
    title: '主变',
    width: 160,
    height: 120,
    markup: [
      { tagName: 'polygon', selector: 'body', attrs: { points: HEXAGON, fill: '#f2ecff', stroke: '#7c5cd6', strokeWidth: 2 } },
      label('主变', 66),
    ],
  },
  breaker: {
    title: '断路器',
    width: 130,
    height: 96,
    markup: [
      { tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 130, height: 96, rx: 6, ry: 6, fill: '#eef7ee', stroke: '#2f9e44', strokeWidth: 2 } },
      label('断路器', 54),
    ],
  },
}

// ── 下面这一份就是"你自己的数据"。图是它的一个视图，不是它的真身。──
const MY_STATE = {
  nodes: [
    { id: 'n-ct', kind: 'ct', x: 60, y: 90 },
    { id: 'n-transformer', kind: 'transformer', x: 250, y: 78 },
    { id: 'n-breaker', kind: 'breaker', x: 480, y: 90 },
  ],
  pins: [], // { nodeId, id, x, y } —— 由插件交互产生
}

const portEditor = new PortEditor({
  idPrefix: 'T', // 生成 T-1、T-2…（插件会自己补那个连字符，别写成 'T-'）
  positionUnit: 'local',
  onModeChange: (adding) => {
    const button = document.getElementById('btn-add')
    button.classList.toggle('active', adding)
    button.textContent = adding ? '退出添加（Esc）' : '添加端子'
  },
})
graph.use(portEditor)

/** 把图渲染成"我的数据"：这里就是"从 X6 读回自己结构"的那一步 */
function readMyState() {
  const pins = []
  for (const node of graph.getNodes()) {
    for (const port of node.getPorts()) {
      pins.push({ nodeId: node.id, id: port.id, x: round(port.args && port.args.x), y: round(port.args && port.args.y) })
    }
  }
  return {
    nodes: graph.getNodes().map((node) => ({
      id: node.id,
      kind: node.getData().kind,
      x: Math.round(node.getPosition().x),
      y: Math.round(node.getPosition().y),
    })),
    pins,
  }
}

const round = (value) => (typeof value === 'number' ? Math.round(value * 100) / 100 : value)

function renderState() {
  document.getElementById('state').textContent = JSON.stringify(readMyState(), null, 2)
}

/** 用"我的数据"把图重建出来（含端子编号与坐标） */
function buildFromState(state) {
  graph.clearCells()
  for (const item of state.nodes) {
    const shape = LIBRARY[item.kind]
    graph.addNode({
      id: item.id,
      x: item.x,
      y: item.y,
      width: shape.width,
      height: shape.height,
      markup: shape.markup,
      data: { kind: item.kind, title: shape.title },
    })
  }
  for (const pin of state.pins) {
    const node = graph.getCellById(pin.nodeId)
    if (!node) continue
    node.addPort({ id: pin.id, group: 'pin', args: { x: pin.x, y: pin.y } })
  }
  renderState()
}

// ① 端子一变，"我的数据"跟着变 —— 监听的是 X6 自己的事件，插件不另造一套
graph.on('node:change:ports', renderState)

document.getElementById('btn-add').addEventListener('click', () => {
  portEditor.isAdding() ? portEditor.stopAdding() : portEditor.startAdding()
})

document.getElementById('btn-rebuild').addEventListener('click', () => {
  buildFromState(readMyState())
})

/** 「载入一份示例数据」：不碰画布，直接喂一份数据进去 —— 这就是"从后端加载"的样子 */
document.getElementById('btn-load').addEventListener('click', () => {
  buildFromState({
    nodes: [
      { id: 'n-ct', kind: 'ct', x: 60, y: 90 },
      { id: 'n-transformer', kind: 'transformer', x: 250, y: 78 },
      { id: 'n-breaker', kind: 'breaker', x: 480, y: 90 },
    ],
    pins: [
      { nodeId: 'n-ct', id: 'T-1', x: 15.47, y: 15.47 },
      { nodeId: 'n-transformer', id: 'T-2', x: 80, y: 0 },
      { nodeId: 'n-breaker', id: 'T-3', x: 130, y: 48 },
    ],
  })
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') portEditor.stopAdding()
})

buildFromState(MY_STATE)

// ── 给自动化验证用的钩子 ──
function toClient(element, point) {
  const ctm = element.getScreenCTM()
  return { x: ctm.a * point.x + ctm.c * point.y + ctm.e, y: ctm.b * point.x + ctm.d * point.y + ctm.f }
}

window.__ex = {
  graph,
  plugin: portEditor,

  /** 面板上那份"我的数据" */
  myState: readMyState,
  panelText: () => document.getElementById('state').textContent,

  pinCount: () => graph.getNodes().reduce((sum, node) => sum + node.getPorts().length, 0),
  nodeCount: () => graph.getNodes().length,

  /** 某元件第 index 条轮廓上 ratio 处的点（client），用于真实鼠标点击 */
  outlinePoint(nodeId, ratio = 0.5, index = 0) {
    const node = graph.getCellById(nodeId)
    if (!node) return null
    const view = node.findView(graph)
    if (!view) return null
    const elements = X6PluginPortEditor.collectOutlineElements(view.container, undefined)
    const element = elements[index]
    if (!element) return null
    const local = element.getPointAtLength(element.getTotalLength() * ratio)
    return { local: { x: local.x, y: local.y }, client: toClient(element, local) }
  },

  errors: () => window.__errors,
}