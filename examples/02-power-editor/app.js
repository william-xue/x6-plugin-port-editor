/* global X6, X6PluginPortEditor */
/**
 * 例 2 · 电力组件场景
 * 目的：演示"和已有的 X6 项目结合"的完整样子：
 *   - 自定义元件形状（Graph.registerNode：CT / 主变 / 断路器）
 *   - 自己命名的端子组 + 自己的端子样式（不再用默认的 'pin'）
 *   - 调色板拖拽建元件 / 拖拽建端子（Dnd + createDndDropValidator）
 *   - 与 Selection / History 插件共存（端子增删可撤销）
 *   - 导出 / 导入（端子与连线端点绑定一起往返）
 */
const { Graph, Dnd, Selection, History } = X6
const { PortEditor } = X6PluginPortEditor

window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

// ─────────────────────────── 你项目里已有的东西 ───────────────────────────

// 1) 自己的端子组定义（方形端子 + 文字标签），名字叫 'terminal'
const TERMINAL_GROUP = {
  position: 'absolute',
  markup: [
    { tagName: 'rect', selector: 'body' },
    { tagName: 'text', selector: 'label' },
  ],
  attrs: {
    body: {
      x: -5,
      y: -5,
      width: 10,
      height: 10,
      fill: '#1677FF',
      stroke: '#FFFFFF',
      strokeWidth: 1,
      magnet: true, // ← 能起线的关键
    },
    label: { fontSize: 9, fill: '#666666', textAnchor: 'middle', y: 16 },
  },
  zIndex: 2,
}

// 2) 自定义元件形状（注册一次，全项目复用）
Graph.registerNode(
  'power-ct',
  {
    shape: 'power-ct',
    width: 96,
    height: 96,
    markup: [
      { tagName: 'circle', selector: 'body', attrs: { cx: 48, cy: 48, r: 46 } },
      { tagName: 'text', selector: 'label', attrs: { x: 48, y: 54, textAnchor: 'middle', fontSize: 13 } },
    ],
    attrs: {
      body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 },
      label: { text: 'CT', fill: '#1f1f1f' },
    },
  },
  true,
)

Graph.registerNode(
  'power-transformer',
  {
    shape: 'power-transformer',
    width: 150,
    height: 110,
    markup: [
      { tagName: 'polygon', selector: 'body', attrs: { points: '37,0 113,0 150,55 113,110 37,110 0,55' } },
      { tagName: 'text', selector: 'label', attrs: { x: 75, y: 60, textAnchor: 'middle', fontSize: 13 } },
    ],
    attrs: {
      body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 },
      label: { text: '主变', fill: '#1f1f1f' },
    },
  },
  true,
)

Graph.registerNode(
  'power-breaker',
  {
    shape: 'power-breaker',
    width: 150,
    height: 64,
    markup: [
      { tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 150, height: 64, rx: 6, ry: 6 } },
      { tagName: 'text', selector: 'label', attrs: { x: 75, y: 38, textAnchor: 'middle', fontSize: 13 } },
    ],
    attrs: {
      body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 },
      label: { text: '断路器', fill: '#1f1f1f' },
    },
  },
  true,
)

// 3) 图实例 + 其它插件（Selection / History）
const graph = new Graph({
  container: document.getElementById('graph'),
  grid: true,
  panning: true,
  connecting: { allowBlank: false, allowLoop: false, allowMulti: true, router: { name: 'orth' }, connector: { name: 'rounded' } },
})

// 注意 pointerEvents: 'none'：X6 的选择框是 pointer-events:auto，正好盖在元件轮廓上（也就是端子所在的位置），
// 选中元件后按端子会起不了线。设成 none（或 showNodeSelectionBox: false）即可；插件检测到这种情况会 console.warn 提醒。
graph.use(
  new Selection({
    enabled: true,
    rubberband: true,
    multiple: true,
    showNodeSelectionBox: true,
    pointerEvents: 'none',
  }),
)
const history = new History({ enabled: true })
graph.use(history)

// 4) 已有的元件实例（注意 ports.groups 里是我们的 'terminal'）
const mkPorts = () => ({ groups: { terminal: TERMINAL_GROUP }, items: [] })

const ct = graph.addNode({ id: 'n-ct', shape: 'power-ct', x: 300, y: 70, ports: mkPorts() })
const breaker = graph.addNode({
  id: 'n-breaker',
  shape: 'power-breaker',
  x: 540,
  y: 80,
  attrs: { label: { text: 'SF6 断路器' } },
  ports: mkPorts(),
})
const transformer = graph.addNode({
  id: 'n-transformer',
  shape: 'power-transformer',
  x: 520,
  y: 260,
  ports: mkPorts(),
})

// ───────────────────── 接入插件：指定你自己的端子组名 ─────────────────────
const portEditor = new PortEditor({
  group: 'terminal', // ← 用你项目里的端子组名（默认是 'pin'）
  idPrefix: 'T', // 端子 id：T-1、T-2…
  groupConfig: TERMINAL_GROUP, // 万一某个元件没声明该组，用它兜底
  onModeChange: () => syncModeButton(),
})
graph.use(portEditor)

// ───────────────────── 调色板：拖元件 / 拖端子 ─────────────────────
const palette = new Graph({
  container: document.getElementById('palette'),
  width: 112,
  height: 250,
  interacting: false,
  panning: false, // 只读小图必须关平移（X6 的 panning 默认是开着的）
  grid: false,
})

const paletteNode = (id, y, shape, width, height, extra = {}) =>
  palette.addNode({ id, x: (112 - width) / 2, y, shape, width, height, ...extra })

paletteNode('tpl-ct', 8, 'power-ct', 56, 56)
paletteNode('tpl-transformer', 78, 'power-transformer', 72, 53, { attrs: { label: { text: '主变' } } })
paletteNode('tpl-breaker', 146, 'power-breaker', 96, 41, { attrs: { label: { text: '断路器' } } })

// 「端子」模板：实心方点，拖到元件上就变成一个端子（自身不落地）
palette.addNode({
  id: 'tpl-terminal',
  x: 48,
  y: 204,
  width: 16,
  height: 16,
  markup: [{ tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 16, height: 16, rx: 3, ry: 3 } }],
  attrs: { body: { fill: '#1677FF', stroke: '#FFFFFF', strokeWidth: 1 } },
  data: { pinTemplate: true }, // ← createDndDropValidator 的默认判据
})

const dnd = new Dnd({ target: graph, scaled: false, validateNode: portEditor.createDndDropValidator() })
graph.use(dnd)
palette.on('node:mousedown', ({ node, e }) => dnd.start(node, e))

// ───────────────────── 工具栏 ─────────────────────
const btnAdd = document.getElementById('btn-add-pin')
const statusEl = document.getElementById('status')
const jsonEl = document.getElementById('json')

function refreshStatus() {
  const pins = [ct, breaker, transformer]
    .map((n) => `${n.id.replace('n-', '')}=${portEditor.getPins(n).length}`)
    .join(' ')
  statusEl.textContent = `terminals[${pins}] nodes=${graph.getNodes().length} edges=${graph.getEdges().length} adding=${portEditor.isAdding()}`
}

function syncModeButton() {
  const adding = portEditor.isAdding()
  btnAdd.classList.toggle('active', adding)
  btnAdd.textContent = adding ? '退出添加（Esc）' : '添加引脚'
  refreshStatus()
}

btnAdd.addEventListener('click', () => {
  portEditor.isAdding() ? portEditor.stopAdding() : portEditor.startAdding()
})

document.getElementById('btn-undo').addEventListener('click', () => history.canUndo() && history.undo())
document.getElementById('btn-redo').addEventListener('click', () => history.canRedo() && history.redo())

document.getElementById('btn-clear-pins').addEventListener('click', () => {
  graph.getNodes().forEach((n) => portEditor.clearPins(n))
  refreshStatus()
})

// 导出 / 导入（原理见 docs/INTEGRATION.md §6）
const exportState = () => ({
  graph: graph.toJSON(),
  viewport: { zoom: graph.zoom(), ...graph.translate() },
})

function importState(state) {
  if (!state || !state.graph) return false
  portEditor.stopAdding()
  graph.fromJSON(state.graph)
  if (state.viewport) {
    if (typeof state.viewport.zoom === 'number') graph.zoom(state.viewport.zoom)
    graph.translate(state.viewport.tx || 0, state.viewport.ty || 0)
  }
  refreshStatus()
  return true
}

document.getElementById('btn-export').addEventListener('click', () => {
  jsonEl.value = JSON.stringify(exportState(), null, 2)
  refreshStatus()
})

document.getElementById('btn-import').addEventListener('click', () => {
  try {
    importState(JSON.parse(jsonEl.value || '{}'))
  } catch (err) {
    window.__errors.push('import failed: ' + err.message)
  }
})

graph.on('edge:connected', refreshStatus)
graph.on('edge:removed', refreshStatus)
graph.on('node:change:ports', refreshStatus)
graph.on('node:added', refreshStatus)
graph.on('cell:removed', refreshStatus)

syncModeButton()

// ───────────────────── e2e 辅助（与插件实现无关，用原始 DOM 几何） ─────────────────────
const outlineEl = (id) => {
  const node = graph.getCellById(id)
  const view = node.findView(graph)
  return view.container.querySelector('circle,rect,polygon,path,ellipse,polyline')
}

window.__ex = {
  graph,
  palette,
  plugin: portEditor,
  history,
  nodes: { ct, breaker, transformer },
  pinsOf: (id) => portEditor.getPins(graph.getCellById(id)).map((p) => ({ id: p.id, group: p.group, args: p.args })),
  nodeCount: () => graph.getNodes().length,
  outlinePoint(id, ratio) {
    const el = outlineEl(id)
    const total = el.getTotalLength()
    const p = el.getPointAtLength(total * ratio)
    const svgPoint = new DOMPoint(p.x, p.y).matrixTransform(el.getCTM())
    const screen = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(el.ownerSVGElement.getScreenCTM())
    const nodeView = graph.getCellById(id).findView(graph)
    const local = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(nodeView.container.getCTM().inverse())
    return { client: { x: screen.x, y: screen.y }, local: { x: local.x, y: local.y } }
  },
  outlineDistance(id, x, y) {
    const el = outlineEl(id)
    const total = el.getTotalLength()
    let best = Infinity
    for (let i = 0; i <= 400; i += 1) {
      const p = el.getPointAtLength((total * i) / 400)
      best = Math.min(best, Math.hypot(p.x - x, p.y - y))
    }
    return best
  },
  pinCenter(id, portId) {
    const el = graph.getCellById(id).findView(graph).container.querySelector(`[port="${portId}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  bodyCenter(id) {
    const r = outlineEl(id).getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  paletteItemCenter(id) {
    const view = palette.getCellById(id).findView(palette)
    const r = view.container.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  sourcePortOfEdge(index) {
    const edge = graph.getEdges()[index]
    return edge ? { source: edge.getSource(), target: edge.getTarget() } : null
  },
  edgeCount: () => graph.getEdges().length,
  exportJSON() {
    jsonEl.value = JSON.stringify(exportState(), null, 2)
    return jsonEl.value
  },
  importJSON(text) {
    return importState(JSON.parse(text == null ? jsonEl.value || '{}' : text))
  },
  pinState() {
    const nodes = graph
      .getNodes()
      .map((n) => ({
        id: n.id,
        pins: portEditor
          .getPins(n)
          .map((p) => ({ id: p.id, group: p.group, args: p.args || {} }))
          .sort((a, b) => String(a.id).localeCompare(String(b.id))),
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    const edges = graph
      .getEdges()
      .map((e) => {
        const s = e.getSource() || {}
        const t = e.getTarget() || {}
        return { source: { cell: s.cell, port: s.port || null }, target: { cell: t.cell, port: t.port || null } }
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    return JSON.stringify({ nodes, edges })
  },
}
window.__ready = true
