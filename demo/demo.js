/* global X6, X6PluginPortEditor */
const { Graph, Dnd } = X6
const { PortEditor } = X6PluginPortEditor

// collected so the e2e script can assert a clean console
window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

// ---------------------------------------------------------------------------
// 连线样式预设：全部是 X6 edge 自身的配置，与引脚插件无关
// ---------------------------------------------------------------------------
const EDGE_PRESETS = {
  arrow: {
    router: { name: 'orth' },
    connector: { name: 'rounded' },
    attrs: { line: { stroke: '#333333', strokeWidth: 2, strokeDasharray: null, targetMarker: 'classic', sourceMarker: null } },
  },
  plain: {
    router: { name: 'orth' },
    connector: { name: 'rounded' },
    attrs: { line: { stroke: '#333333', strokeWidth: 2, strokeDasharray: null, targetMarker: null, sourceMarker: null } },
  },
  dashed: {
    router: { name: 'orth' },
    connector: { name: 'rounded' },
    attrs: { line: { stroke: '#5F95FF', strokeWidth: 2, strokeDasharray: '6 3', targetMarker: null, sourceMarker: null } },
  },
  flow: {
    router: { name: 'orth' },
    connector: { name: 'rounded' },
    attrs: {
      line: {
        stroke: '#5F95FF',
        strokeWidth: 2,
        strokeDasharray: '6 3',
        targetMarker: { name: 'block', size: 6 },
        sourceMarker: null,
        style: { animation: 'x6pe-flow 30s infinite linear' },
      },
    },
  },
  jump: {
    router: { name: 'manhattan' },
    connector: { name: 'jumpover', args: { size: 6 } },
    attrs: { line: { stroke: '#333333', strokeWidth: 2, strokeDasharray: null, targetMarker: null, sourceMarker: null } },
  },
}

let edgePreset = 'arrow'

const graph = new Graph({
  container: document.getElementById('graph'),
  grid: true,
  panning: true,
  connecting: {
    allowBlank: false,
    allowLoop: false,
    allowMulti: true,
  },
})

// X6 默认 edge 定义里 line.targetMarker = 'classic'（就是那个箭头）——
// 想改样式只需在这里返回自己的 Edge 实例
// ⚠️ createEdge 必须返回 Edge 实例：用 graph.createEdge(metadata)。
//    返回普通对象会在拖拽建边时抛 "r.getSource is not a function"，因为 X6 拿到返回值
//    后立刻调用 getSource()/setSource()/setTarget()/addTo()。
graph.options.connecting.createEdge = function () {
  const preset = EDGE_PRESETS[edgePreset]
  return this.createEdge({
    shape: 'edge',
    router: preset.router,
    connector: preset.connector,
    attrs: preset.attrs,
  })
}

const label = (text, y) => ({
  tagName: 'text',
  selector: 'label',
  attrs: { x: '50%', y, textAnchor: 'middle', fontSize: 12, fill: '#1f1f1f', text },
})

// 1) 圆形元件（母线 / 互感器一类，非矩形轮廓）
const circle = graph.addNode({
  id: 'n-circle',
  x: 260,
  y: 60,
  width: 110,
  height: 110,
  markup: [
    { tagName: 'circle', selector: 'body', attrs: { cx: 55, cy: 55, r: 54 } },
    label('CT', 60),
  ],
  attrs: {
    body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 },
    label: { text: 'CT' },
  },
})

// 2) 矩形元件（本体也是 magnet，和真实电力编辑器一致）
const rect = graph.addNode({
  id: 'n-rect',
  x: 470,
  y: 70,
  width: 160,
  height: 80,
  markup: [
    { tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 160, height: 80, rx: 6, ry: 6 } },
    label('SF6 断路器', 45),
  ],
  attrs: {
    body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2, magnet: true },
  },
})

// 3) 六边形元件（异形轮廓）
const hex = graph.addNode({
  id: 'n-hex',
  x: 470,
  y: 250,
  width: 160,
  height: 120,
  markup: [
    { tagName: 'polygon', selector: 'body', attrs: { points: '40,0 120,0 160,60 120,120 40,120 0,60' } },
    label('主变', 65),
  ],
  attrs: {
    body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 },
  },
})

const plugin = new PortEditor({
  // 用回调同步 UI —— 这样按 Esc 退出时按钮状态也会跟着变
  onModeChange: () => syncModeButton(),
})
graph.use(plugin)

const nodes = { circle, rect, hex }

// ---------------------------------------------------------------------------
// 调色板：拖拽建元件 / 拖拽建引脚
// ---------------------------------------------------------------------------
const palette = new Graph({
  container: document.getElementById('palette'),
  width: 116,
  height: 250,
  // interacting:false 关掉的是"元件拖动"，X6 的 panning.enabled 默认是 true，
  // 不显式关掉的话，在调色板上按住会被当成"平移画布"，整个调色板自己就飘走了。
  interacting: false,
  panning: false,
  grid: false,
})

palette.addNode({
  id: 'tpl-rect',
  x: 30,
  y: 10,
  width: 56,
  height: 32,
  markup: [{ tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 56, height: 32, rx: 4, ry: 4 } }],
  attrs: { body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 } },
})
palette.addNode({
  id: 'tpl-circle',
  x: 40,
  y: 60,
  width: 36,
  height: 36,
  markup: [{ tagName: 'circle', selector: 'body', attrs: { cx: 18, cy: 18, r: 16 } }],
  attrs: { body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 } },
})
palette.addNode({
  id: 'tpl-poly',
  x: 34,
  y: 112,
  width: 48,
  height: 34,
  markup: [{ tagName: 'polygon', selector: 'body', attrs: { points: '12,0 36,0 48,17 36,34 12,34 0,17' } }],
  attrs: { body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2 } },
})
// 「引脚」模板：实心圆点，拖到元件上就变成一个引脚（自身不落地）
palette.addNode({
  id: 'tpl-pin',
  x: 46,
  y: 168,
  width: 16,
  height: 16,
  markup: [{ tagName: 'circle', selector: 'body', attrs: { cx: 8, cy: 8, r: 7 } }],
  attrs: { body: { fill: '#5F95FF', stroke: '#2b5fd9', strokeWidth: 1 } },
  data: { pinTemplate: true },
})

const dnd = new Dnd({
  target: graph,
  scaled: false,
  // 命中「引脚」模板时生成引脚并阻止模板节点落地；其他模板照常落地成元件
  validateNode: plugin.createDndDropValidator(),
})
graph.use(dnd)

palette.on('node:mousedown', ({ node, e }) => {
  dnd.start(node, e)
})

// ---------------------------------------------------------------------------
// demo UI
// ---------------------------------------------------------------------------
const btnAdd = document.getElementById('btn-add-pin')
const btnClear = document.getElementById('btn-clear')
const selectStyle = document.getElementById('edge-style')
const statusEl = document.getElementById('status')

function refreshStatus() {
  const pins = Object.entries(nodes)
    .map(([key, node]) => `${key}=${plugin.getPins(node).length}`)
    .join(' ')
  statusEl.textContent = `pins[${pins}] nodes=${graph.getNodes().length} edges=${graph.getEdges().length} adding=${plugin.isAdding()}`
}

function syncModeButton() {
  const adding = plugin.isAdding()
  btnAdd.classList.toggle('active', adding)
  btnAdd.textContent = adding ? '退出添加（Esc）' : '添加引脚'
  refreshStatus()
}

btnAdd.addEventListener('click', () => {
  if (plugin.isAdding()) {
    plugin.stopAdding()
  } else {
    plugin.startAdding()
  }
})

btnClear.addEventListener('click', () => {
  graph.getNodes().forEach((node) => plugin.clearPins(node))
  refreshStatus()
})

function applyEdgePreset(key) {
  edgePreset = key
  const preset = EDGE_PRESETS[key]
  graph.getEdges().forEach((edge) => {
    edge.setRouter(preset.router)
    edge.setConnector(preset.connector)
    edge.setAttrs(preset.attrs)
  })
}

selectStyle.addEventListener('change', () => {
  applyEdgePreset(selectStyle.value)
  refreshStatus()
})

// ---------------------------------------------------------------------------
// 导出 / 导入：X6 自带 graph.toJSON() / graph.fromJSON()
//   - 引脚是节点数据的一部分（ports.groups / ports.items，含每个引脚的 args）
//   - 视图缩放/平移不在 toJSON 里，单独存成 viewport，导入时回填
// ---------------------------------------------------------------------------
const btnExport = document.getElementById('btn-export')
const btnImport = document.getElementById('btn-import')
const jsonEl = document.getElementById('json')

function exportState() {
  const viewport = graph.translate()
  const state = {
    graph: graph.toJSON(),
    viewport: { zoom: graph.zoom(), tx: viewport.tx, ty: viewport.ty },
  }
  window.__lastExport = state
  return state
}

function importState(state) {
  if (!state || !state.graph) return false
  plugin.stopAdding()
  graph.fromJSON(state.graph)
  if (state.viewport) {
    if (typeof state.viewport.zoom === 'number') graph.zoom(state.viewport.zoom)
    graph.translate(state.viewport.tx || 0, state.viewport.ty || 0)
  }
  refreshStatus()
  return true
}

btnExport.addEventListener('click', () => {
  jsonEl.value = JSON.stringify(exportState(), null, 2)
  refreshStatus()
})

btnImport.addEventListener('click', () => {
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

// ---------------------------------------------------------------------------
// test/debug helpers —— 全部用原始 DOM 几何实现，刻意不依赖插件内部实现
// ---------------------------------------------------------------------------
function outlineEl(nodeId) {
  const node = graph.getCellById(nodeId)
  const view = node.findView(graph)
  return { node, view, el: view.container.querySelector('circle,rect,polygon,path,ellipse,polyline') }
}

window.__demo = {
  graph,
  palette,
  plugin,
  nodes,
  /** 轮廓上按弧长比例取点：返回 client 与节点本地坐标 */
  outlinePoint(nodeId, ratio) {
    const { view, el } = outlineEl(nodeId)
    const total = el.getTotalLength()
    const p = el.getPointAtLength(total * ratio)
    const svgPoint = new DOMPoint(p.x, p.y).matrixTransform(el.getCTM())
    const screen = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(el.ownerSVGElement.getScreenCTM())
    const local = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(view.container.getCTM().inverse())
    return { client: { x: screen.x, y: screen.y }, local: { x: local.x, y: local.y } }
  },
  /** 某点（节点本地坐标）到该元件轮廓的最短距离 —— 独立重算，用于验证"引脚真的贴在轮廓上" */
  outlineDistance(nodeId, x, y) {
    const { el } = outlineEl(nodeId)
    const total = el.getTotalLength()
    let best = Infinity
    for (let i = 0; i <= 400; i += 1) {
      const p = el.getPointAtLength((total * i) / 400)
      best = Math.min(best, Math.hypot(p.x - x, p.y - y))
    }
    return best
  },
  pinClientCenter(nodeId, portId) {
    const node = graph.getCellById(nodeId)
    const view = node.findView(graph)
    const el = view.container.querySelector(`[port="${portId}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  bodyClientCenter(nodeId) {
    const { el } = outlineEl(nodeId)
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  /** 元件本体上的一个点（默认偏左上，避开居中的标签文字） */
  bodyClientPoint(nodeId, dx = 16, dy = 14) {
    const { el } = outlineEl(nodeId)
    const r = el.getBoundingClientRect()
    return { x: r.left + dx, y: r.top + dy }
  },
  paletteItemCenter(nodeId) {
    const node = palette.getCellById(nodeId)
    const view = node.findView(palette)
    const r = view.container.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  nodeCount() {
    return graph.getNodes().length
  },
  pinArgs(nodeId, portId) {
    return graph.getCellById(nodeId).getPortProp(portId, 'args')
  },
  pinsOf(nodeId) {
    return plugin.getPins(graph.getCellById(nodeId)).map((p) => p.id)
  },
  edgeLineAttrs(index) {
    const edge = graph.getEdges()[index]
    return edge ? edge.getAttrs().line : null
  },
  /** 可序列化状态快照（往返比对用）：节点 + 每个引脚的 id/group/args + 每条边的端点绑定 */
  pinState() {
    const nodes = graph
      .getNodes()
      .map((n) => ({
        id: n.id,
        pos: n.getPosition(),
        pins: plugin
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
        return {
          source: { cell: s.cell, port: s.port || null },
          target: { cell: t.cell, port: t.port || null },
        }
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

    return JSON.stringify({ nodes, edges })
  },
  exportJSON() {
    jsonEl.value = JSON.stringify(exportState(), null, 2)
    return jsonEl.value
  },
  importJSON(text) {
    return importState(JSON.parse(text == null ? jsonEl.value || '{}' : text))
  },
  clearAll() {
    graph.clearCells()
    refreshStatus()
  },
  sourcePortOfEdge(index) {
    const edge = graph.getEdges()[index]
    return edge ? { source: edge.getSource(), target: edge.getTarget() } : null
  },
}
