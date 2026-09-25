/* global X6, X6PluginPortEditor */
/**
 * 例 1 · 最小接入
 * 目的：演示"我已经有一个跑着的 X6 图，怎么把 PortEditor 接上去"。
 * 页面左侧是"你原有的代码"，右侧是"新增的接入代码"，代码与页面一一对应。
 */
const { Graph } = X6
const { PortEditor } = X6PluginPortEditor

window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

// ───────────────────────────── ① 你原有的代码（不动） ─────────────────────────────
const graph = new Graph({
  container: document.getElementById('graph'),
  grid: true,
  panning: true,
  connecting: { allowBlank: false, allowLoop: false, allowMulti: true, router: 'orth' },
})

const deviceAttrs = (text) => ({
  body: { fill: '#FFFFFF', stroke: '#5F95FF', strokeWidth: 2, rx: 6, ry: 6 },
  label: { text, fontSize: 13, fill: '#1f1f1f' },
})

// 你自己的节点定义（含你自己的端口组）照旧
const nodeA = graph.addNode({
  id: 'a',
  x: 80,
  y: 90,
  width: 130,
  height: 60,
  attrs: deviceAttrs('设备 A'),
  // 这里刻意不声明端口组：由插件按默认定义补一份（见 ③）
  ports: { items: [] },
})

const nodeB = graph.addNode({
  id: 'b',
  x: 380,
  y: 90,
  width: 130,
  height: 60,
  attrs: deviceAttrs('设备 B'),
  ports: { items: [] },
})

const nodeC = graph.addNode({
  id: 'c',
  x: 230,
  y: 250,
  width: 130,
  height: 60,
  attrs: deviceAttrs('设备 C'),
  ports: { items: [] },
})

// ───────────────────────────── ② 新增的接入代码（就这几行） ─────────────────────────────
const portEditor = new PortEditor({
  onModeChange: (adding) => {
    // 模式进入/离开都会回调（用 Esc 退出也会触发），用它同步工具栏
    btn.classList.toggle('active', adding)
    btn.textContent = adding ? '退出添加（Esc）' : '添加引脚'
    refreshStatus()
  },
})
graph.use(portEditor)

const btn = document.getElementById('btn-add-pin')
btn.addEventListener('click', () => {
  if (portEditor.isAdding()) {
    portEditor.stopAdding()
  } else {
    portEditor.startAdding()
  }
})

// ───────────────────────────── 后面只是页面状态显示，不属于接入代码 ─────────────────────────────
const statusEl = document.getElementById('status')

function refreshStatus() {
  const pins = graph
    .getNodes()
    .map((n) => `${n.id}=${portEditor.getPins(n).length}`)
    .join(' ')
  statusEl.textContent = `pins[${pins}] edges=${graph.getEdges().length} adding=${portEditor.isAdding()}`
}

graph.on('edge:connected', refreshStatus)
graph.on('edge:removed', refreshStatus)
graph.on('node:change:ports', refreshStatus)
refreshStatus()

// 供 e2e 用
window.__ex = {
  graph,
  plugin: portEditor,
  nodes: { a: nodeA, b: nodeB, c: nodeC },
  pinsOf: (id) => portEditor.getPins(graph.getCellById(id)).map((p) => p.id),
  /** 元件轮廓上按弧长比例取点（独立于插件实现，用原始 DOM 几何） */
  outlinePoint(id, ratio) {
    const node = graph.getCellById(id)
    const view = node.findView(graph)
    const el = view.container.querySelector('circle,rect,polygon,path,ellipse,polyline')
    const total = el.getTotalLength()
    const p = el.getPointAtLength(total * ratio)
    const svgPoint = new DOMPoint(p.x, p.y).matrixTransform(el.getCTM())
    const screen = new DOMPoint(svgPoint.x, svgPoint.y).matrixTransform(
      el.ownerSVGElement.getScreenCTM(),
    )
    return { x: screen.x, y: screen.y }
  },
  pinCenter(id, portId) {
    const node = graph.getCellById(id)
    const el = node.findView(graph).container.querySelector(`[port="${portId}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  bodyCenter(id) {
    const el = graph
      .getCellById(id)
      .findView(graph)
      .container.querySelector('circle,rect,polygon,path,ellipse,polyline')
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  },
  pinArgs(id, portId) {
    return graph.getCellById(id).getPortProp(portId, 'args')
  },
  /** 该点（节点本地坐标）到元件轮廓的最短距离：验证引脚真的贴在轮廓上 */
  outlineDistance(id, x, y) {
    const el = graph
      .getCellById(id)
      .findView(graph)
      .container.querySelector('circle,rect,polygon,path,ellipse,polyline')
    const total = el.getTotalLength()
    let best = Infinity
    for (let i = 0; i <= 400; i += 1) {
      const p = el.getPointAtLength((total * i) / 400)
      best = Math.min(best, Math.hypot(p.x - x, p.y - y))
    }
    return best
  },
}
window.__ready = true
