/* global X6, X6PluginPortEditor */
// 例 0 · 同一个图，不接插件 vs 接上插件。
//
// 这一页要回答的问题只有一个：**"我自己也能给端子写坐标，为什么要用你这个插件？"**
// 所以左边不接插件（走 X6 原生的路：手写坐标），右边接上插件（点轮廓）。
// 两边用**同一批元件定义**，并且都用数字回答"端子到底有没有落在轮廓上"——
// 数字用插件导出的 collectOutlineElements / findNearestOutlinePoint 量，
// 左边那个图只是**没有 graph.use(portEditor)**，测量能力照样可用。

const { Graph } = X6
const { PortEditor, collectOutlineElements, findNearestOutlinePoint } = X6PluginPortEditor

window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

// ── 同一批元件：两边逐字相同（CT 圆 / 主变六边形 / 断路器圆角矩形）──
const CIRCLE = { cx: 48, cy: 48, r: 46 }
const HEXAGON = '40,0 120,0 160,60 120,120 40,120 0,60'

const label = (text, y) => ({
  tagName: 'text',
  selector: 'label',
  attrs: { x: '50%', y, textAnchor: 'middle', fontSize: 11, fill: '#555555', text },
})

function shapes() {
  return [
    {
      id: 'n-ct',
      x: 30,
      y: 70,
      width: 96,
      height: 96,
      markup: [
        { tagName: 'circle', selector: 'body', attrs: { ...CIRCLE, fill: '#eef2ff', stroke: '#5f95ff', strokeWidth: 2 } },
        label('CT', 52),
      ],
    },
    {
      id: 'n-transformer',
      x: 170,
      y: 58,
      width: 160,
      height: 120,
      markup: [
        { tagName: 'polygon', selector: 'body', attrs: { points: HEXAGON, fill: '#f2ecff', stroke: '#7c5cd6', strokeWidth: 2 } },
        label('主变', 66),
      ],
    },
    {
      id: 'n-breaker',
      x: 370,
      y: 70,
      width: 130,
      height: 96,
      markup: [
        { tagName: 'rect', selector: 'body', attrs: { x: 0, y: 0, width: 130, height: 96, rx: 6, ry: 6, fill: '#eef7ee', stroke: '#2f9e44', strokeWidth: 2 } },
        label('断路器', 54),
      ],
    },
  ]
}

/** 左边用得到的"手工端子组"：不接插件时，你至少得自己声明一个组 */
const MANUAL_GROUP = {
  position: 'absolute',
  markup: [{ tagName: 'rect', selector: 'body' }],
  attrs: {
    body: { x: -5, y: -5, width: 10, height: 10, fill: '#f59e0b', magnet: true, stroke: 'none', rx: 2, ry: 2 },
  },
  zIndex: 2,
}

function buildGraph(containerId, { withPlugin }) {
  const graph = new Graph({
    container: document.getElementById(containerId),
    grid: true,
    panning: true,
    interacting: { nodeMovable: true },
    connecting: { allowBlank: false, allowLoop: false, allowMulti: true },
  })

  for (const shape of shapes()) {
    graph.addNode({
      ...shape,
      // 左边：端子得自己声明组、自己给坐标 → 先备好一个空组
      // 右边：什么都不用声明，插件会自动补一份默认端子组
      ports: withPlugin ? undefined : { groups: { manual: MANUAL_GROUP }, items: [] },
    })
  }

  const plugin = withPlugin ? new PortEditor({ group: 'manual', idPrefix: 'T' }) : null
  if (plugin) graph.use(plugin)
  return { graph, plugin }
}

const LEFT = buildGraph('graph-left', { withPlugin: false })
const RIGHT = buildGraph('graph-right', { withPlugin: true })

// ── 量一个端子离真实轮廓有多远（px）。两边用同一个量法，所以数字可比。──
function distanceToOutline(graph, nodeId, portId) {
  const node = graph.getCellById(nodeId)
  if (!node) return null
  const view = node.findView(graph)
  if (!view) return null
  const port = node.getPorts().find((item) => item.id === portId)
  if (!port || !port.args || typeof port.args.x !== 'number') return null

  const container = view.container
  const elements = collectOutlineElements(container, undefined)
  if (elements.length === 0) return null

  // args 是节点本地坐标 → 用节点容器的 CTM 换到 client，再问最近轮廓点
  const ctm = container.getScreenCTM()
  const client = {
    x: ctm.a * port.args.x + ctm.c * port.args.y + ctm.e,
    y: ctm.b * port.args.x + ctm.d * port.args.y + ctm.f,
  }
  const hit = findNearestOutlinePoint(container, elements, client.x, client.y, 240)
  return hit ? hit.distance : null
}

function portsOf(graph) {
  return graph.getNodes().flatMap((node) => node.getPorts().map((port) => ({ nodeId: node.id, port })))
}

function renderStats() {
  const left = portsOf(LEFT.graph)
  const right = portsOf(RIGHT.graph)
  const leftLast = left.length ? left[left.length - 1] : null
  const rightLast = right.length ? right[right.length - 1] : null
  const leftDistance = leftLast ? distanceToOutline(LEFT.graph, leftLast.nodeId, leftLast.port.id) : null
  const rightDistance = rightLast ? distanceToOutline(RIGHT.graph, rightLast.nodeId, rightLast.port.id) : null

  const fmt = (distance) => (distance === null ? '—' : `${distance.toFixed(1)} px`)

  document.getElementById('stat-left').innerHTML = [
    `端子 ${left.length} 个`,
    `上一个端子（${leftLast ? leftLast.port.id : '—'}）离真实轮廓：`,
    leftDistance === null ? '—' : `<span class="${leftDistance <= 1 ? 'on' : 'off'}">${fmt(leftDistance)}</span>`,
    '<span style="color:#8a94a6">（点轮廓不会有任何反应：X6 核心不提供轮廓命中）</span>',
  ].join('<br />')

  document.getElementById('stat-right').innerHTML = [
    `引脚 ${right.length} 个`,
    `上一个引脚（${rightLast ? rightLast.port.id : '—'}）离真实轮廓：`,
    rightDistance === null ? '—' : `<span class="${rightDistance <= 1 ? 'on' : 'off'}">${fmt(rightDistance)}</span>`,
    '<span style="color:#8a94a6">（点轮廓即生成，位置就是预览那个点）</span>',
  ].join('<br />')
}

// ── 左：手写坐标两条路 ──

/** "估一个"：放在元件框的右上角 —— 对圆来说这个点根本不在轮廓上 */
document.getElementById('left-guess').addEventListener('click', () => {
  const index = portsOf(LEFT.graph).length + 1
  LEFT.graph.getCellById('n-ct').addPort({
    id: `T-${index}`,
    group: 'manual',
    args: { x: 96, y: 0 },
  })
  renderStats()
})

/** "算准了"：把圆心半径算出来，放在圆的 45° 方向 —— 能做到，但要自己算 */
document.getElementById('left-exact').addEventListener('click', () => {
  const index = portsOf(LEFT.graph).length + 1
  const angle = Math.PI / 4
  LEFT.graph.getCellById('n-ct').addPort({
    id: `T-${index}`,
    group: 'manual',
    args: {
      x: CIRCLE.cx + CIRCLE.r * Math.cos(angle),
      y: CIRCLE.cy - CIRCLE.r * Math.sin(angle),
    },
  })
  renderStats()
})

document.getElementById('left-clear').addEventListener('click', () => {
  LEFT.graph.getNodes().forEach((node) => node.removePorts(node.getPorts().map((port) => port.id)))
  renderStats()
})

// ── 右：插件 ──

document.getElementById('right-add').addEventListener('click', () => {
  const button = document.getElementById('right-add')
  if (RIGHT.plugin.isAdding()) {
    RIGHT.plugin.stopAdding()
  } else {
    RIGHT.plugin.startAdding()
  }
  button.classList.toggle('active', RIGHT.plugin.isAdding())
  button.textContent = RIGHT.plugin.isAdding() ? '退出添加（Esc）' : '添加引脚'
})

document.getElementById('right-clear').addEventListener('click', () => {
  RIGHT.graph.getNodes().forEach((node) => node.removePorts(node.getPorts().map((port) => port.id)))
  renderStats()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && RIGHT.plugin) {
    RIGHT.plugin.stopAdding()
    const button = document.getElementById('right-add')
    button.classList.remove('active')
    button.textContent = '添加引脚'
  }
})

LEFT.graph.on('node:change:ports', renderStats)
RIGHT.graph.on('node:change:ports', renderStats)
renderStats()

// ── 给自动化验证用的钩子 ──
function side(name) {
  return name === 'left' ? LEFT : RIGHT
}

function toClient(graph, nodeId, element, point) {
  const ctm = element.getScreenCTM()
  return { x: ctm.a * point.x + ctm.c * point.y + ctm.e, y: ctm.b * point.x + ctm.d * point.y + ctm.f }
}

window.__ex = {
  graphs: { left: LEFT.graph, right: RIGHT.graph },
  plugins: { left: LEFT.plugin, right: RIGHT.plugin },

  portCount(sideName, nodeId) {
    const node = side(sideName).graph.getCellById(nodeId)
    return node ? node.getPorts().length : 0
  },

  totalPortCount(sideName) {
    return side(sideName).graph.getNodes().reduce((sum, node) => sum + node.getPorts().length, 0)
  },

  /** 第 index 条轮廓上 ratio 处的点（client 坐标），用来制造真实鼠标点击 */
  outlinePoint(sideName, nodeId, ratio = 0.5, index = 0) {
    const graph = side(sideName).graph
    const node = graph.getCellById(nodeId)
    if (!node) return null
    const view = node.findView(graph)
    if (!view) return null
    const elements = collectOutlineElements(view.container, undefined)
    const element = elements[index]
    if (!element) return null
    const local = element.getPointAtLength(element.getTotalLength() * ratio)
    return { local: { x: local.x, y: local.y }, client: toClient(graph, nodeId, element, local) }
  },

  /** 端子坐标（节点本地） */
  portArgs(sideName, nodeId, portId) {
    const node = side(sideName).graph.getCellById(nodeId)
    if (!node) return null
    const port = node.getPorts().find((item) => item.id === portId)
    return port ? port.args : null
  },

  distanceToOutline(sideName, nodeId, portId) {
    return distanceToOutline(side(sideName).graph, nodeId, portId)
  },

  errors: () => window.__errors,
}