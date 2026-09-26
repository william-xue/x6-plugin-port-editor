/* global X6, X6PluginPortEditor */
// 例 3 · 难形状：五种"最容易贴不上"的轮廓放在一起。
//
// 这一页是给**第一次接触这个插件的人**看的：它到底能处理什么形状。
// 右侧表格列出插件**实际读到了几条轮廓**（用插件导出的 collectOutlineElements 现读），
// 「轮廓可视化」把同一个结果画到画布上 —— 看得见它怎么看你的元件。
//
// 五种形状，每一种都对应一个真实踩过的坑（细节写在本目录的 index.html 里）：
//   ① <line> 直边                 白名单漏一个标签 = 整个元件读不到轮廓
//   ② 一条 <path> 两个子路径       交界处会被当成一条连续的线，连出幻影线
//   ③ 矩形 + 两个圆（变压器）      多图形取最近
//   ④ 两个同心圆（圆环）           内外各自贴合
//   ⑤ 开放 <polyline>             首尾不能取模相连，否则凭空多一条封口线

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

const CAPTION = (text) => ({
  tagName: 'text',
  selector: 'caption',
  attrs: { x: '50%', y: -8, textAnchor: 'middle', fontSize: 12, fill: '#8a94a6', text },
})

const NODES = [
  {
    id: 'line-busbar',
    x: 30,
    y: 60,
    width: 200,
    height: 120,
    title: '① 直边（母线）',
    why: '轮廓就是一条 <line>',
    markup: [
      CAPTION('① 直边 <line>'),
      {
        tagName: 'line',
        selector: 'body',
        attrs: { x1: 20, y1: 60, x2: 180, y2: 60, stroke: '#1f1f1f', strokeWidth: 6 },
      },
    ],
  },
  {
    id: 'holed-plate',
    x: 300,
    y: 60,
    width: 200,
    height: 140,
    title: '② 带孔洞（两个子路径）',
    why: '一条 path 里有外框 + 孔洞',
    markup: [
      CAPTION('② 带孔洞 <path>'),
      {
        tagName: 'path',
        selector: 'body',
        attrs: {
          d: 'M20,20 H180 V120 H20 Z M60,50 H140 V90 H60 Z',
          fill: '#dbe7ff',
          stroke: '#1f1f1f',
          strokeWidth: 2,
          fillRule: 'evenodd',
        },
      },
    ],
  },
  {
    id: 'transformer',
    x: 570,
    y: 60,
    width: 200,
    height: 140,
    title: '③ 多图形（变压器）',
    why: '矩形 + 两个圆，取最近',
    markup: [
      CAPTION('③ 矩形 + 两个圆'),
      {
        tagName: 'rect',
        selector: 'body',
        attrs: { x: 20, y: 30, width: 160, height: 90, rx: 6, ry: 6, fill: '#f2ecff', stroke: '#1f1f1f', strokeWidth: 2 },
      },
      {
        tagName: 'circle',
        selector: 'coilA',
        attrs: { cx: 70, cy: 75, r: 24, fill: 'none', stroke: '#7c5cd6', strokeWidth: 3 },
      },
      {
        tagName: 'circle',
        selector: 'coilB',
        attrs: { cx: 130, cy: 75, r: 24, fill: 'none', stroke: '#7c5cd6', strokeWidth: 3 },
      },
    ],
  },
  {
    id: 'ring',
    x: 30,
    y: 280,
    width: 200,
    height: 140,
    title: '④ 同心圆环',
    why: '两个同心圆各自贴合',
    markup: [
      CAPTION('④ 同心圆环'),
      {
        tagName: 'circle',
        selector: 'outerRing',
        attrs: { cx: 100, cy: 70, r: 56, fill: '#eef7ee', stroke: '#1f1f1f', strokeWidth: 3 },
      },
      {
        tagName: 'circle',
        selector: 'innerRing',
        attrs: { cx: 100, cy: 70, r: 28, fill: 'none', stroke: '#2f9e44', strokeWidth: 3 },
      },
    ],
  },
  {
    id: 'open-bracket',
    x: 300,
    y: 280,
    width: 200,
    height: 140,
    title: '⑤ 开放折线',
    why: '首尾本来不连',
    markup: [
      CAPTION('⑤ 开放 <polyline>'),
      {
        tagName: 'polyline',
        selector: 'body',
        attrs: { points: '20,110 60,30 140,30 180,110', fill: 'none', stroke: '#1f1f1f', strokeWidth: 4 },
      },
    ],
  },
]

NODES.forEach(({ markup, title, why, ...node }) => {
  graph.addNode({
    ...node,
    markup,
    attrs: { caption: { text: title } },
    data: { title, why },
  })
})

const plugin = new PortEditor({
  onModeChange: (adding) => {
    document.getElementById('btn-add-pin').classList.toggle('active', adding)
    document.getElementById('btn-add-pin').textContent = adding ? '退出添加（Esc）' : '添加引脚'
  },
})
graph.use(plugin)

// ───────────────────────── 工具栏 ─────────────────────────

document.getElementById('btn-add-pin').addEventListener('click', () => {
  plugin.isAdding() ? plugin.stopAdding() : plugin.startAdding()
})

document.getElementById('btn-clear').addEventListener('click', () => {
  graph.getNodes().forEach((node) => node.removePorts(node.getPorts().map((port) => port.id)))
  refreshReadout()
})

let highlighting = false
document.getElementById('btn-highlight').addEventListener('click', (event) => {
  highlighting = !highlighting
  event.currentTarget.classList.toggle('active', highlighting)
  paintHighlight()
})

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') plugin.stopAdding()
})

// ───────────────────── 读轮廓：表格 + 可视化 ─────────────────────

function viewOf(nodeId) {
  const node = graph.getCellById(nodeId)
  return node ? node.findView(graph) : null
}

/** 插件实际读到的几何元素（用的是插件导出的同一个函数，不是页面上另算一遍） */
function readNode(nodeId) {
  const view = viewOf(nodeId)
  if (!view) return { count: 0, tags: [], length: 0 }
  const elements = X6PluginPortEditor.collectOutlineElements(view.container, undefined)
  let length = 0
  for (const element of elements) {
    try {
      length += element.getTotalLength()
    } catch (error) {
      /* 没有几何 API 的元素不计长度 */
    }
  }
  return {
    count: elements.length,
    tags: elements.map((element) => element.tagName),
    length: Math.round(length),
  }
}

function refreshReadout() {
  const body = document.querySelector('#readout tbody')
  body.innerHTML = ''
  for (const node of NODES) {
    const info = readNode(node.id)
    const row = document.createElement('tr')
    const cells = [
      node.title,
      `<span class="${info.count > 0 ? 'ok' : 'warn'}">${info.count}</span>`,
      info.tags.join(', ') || '（读不到）',
      info.length || '—',
    ]
    cells.forEach((text) => {
      const td = document.createElement('td')
      td.innerHTML = String(text)
      row.appendChild(td)
    })
    body.appendChild(row)
  }
  document.getElementById('status').textContent =
    `${graph.getNodes().length} 个元件 · 引脚 ${graph.getNodes().reduce((sum, node) => sum + node.getPorts().length, 0)} 个`
}

const HIGHLIGHT_GROUP_ID = 'pe-demo-highlight'

/**
 * 把"插件读到的轮廓"画到画布上。
 *
 * 画在根 <svg> 上、而不是元件容器里 —— 因为插件是在元件容器里找几何元素的，
 * 画进去会被它当成新的候选轮廓。放在外面的做法是：克隆每个元素，
 * 用它的 getCTM() 当 transform，于是叠加层与原件逐像素重合、又完全不干扰插件。
 */
function paintHighlight() {
  const svg = graph.container.querySelector('svg')
  let group = document.getElementById(HIGHLIGHT_GROUP_ID)
  if (group) {
    group.remove()
    group = null
  }
  if (!highlighting) return
  if (!svg) return
  group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  group.setAttribute('id', HIGHLIGHT_GROUP_ID)
  group.setAttribute('pointer-events', 'none')
  for (const node of NODES) {
    const view = viewOf(node.id)
    if (!view) continue
    for (const element of X6PluginPortEditor.collectOutlineElements(view.container, undefined)) {
      const clone = element.cloneNode(false)
      const matrix = element.getCTM()
      if (matrix) {
        clone.setAttribute('transform', `matrix(${matrix.a},${matrix.b},${matrix.c},${matrix.d},${matrix.e},${matrix.f})`)
      }
      clone.setAttribute('fill', 'none')
      clone.setAttribute('stroke', '#1677FF')
      clone.setAttribute('stroke-width', '2')
      clone.setAttribute('stroke-dasharray', '5 3')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      group.appendChild(clone)
    }
  }
  svg.appendChild(group)
}

// 视图变换（平移/缩放）后叠加层要跟着重画
graph.on('scale', paintHighlight)
graph.on('translate', paintHighlight)

const refresh = () => {
  refreshReadout()
  paintHighlight()
}

// 加/删引脚后刷新表格
graph.on('node:change:ports', refresh)

// ───────────────────── 给自动化验证用的钩子 ─────────────────────
// 先挂钩子再刷新 UI —— 否则 UI 一旦抛错，验证钩子也会跟着消失（踩过）。

function toClient(element, point) {
  const ctm = element.getScreenCTM()
  return { x: ctm.a * point.x + ctm.c * point.y + ctm.e, y: ctm.b * point.x + ctm.d * point.y + ctm.f }
}

window.__ex = {
  graph,
  plugin,
  nodeIds: NODES.map((node) => node.id),

  /** 插件读到的轮廓：条数 / 标签 / 总长 */
  outlineInfo(nodeId) {
    return readNode(nodeId)
  },

  /** 第 index 条轮廓上 ratio 处的点：本地坐标 + client 坐标 */
  outlinePoint(nodeId, ratio = 0.5, index = 0) {
    const view = viewOf(nodeId)
    if (!view) return null
    const elements = X6PluginPortEditor.collectOutlineElements(view.container, undefined)
    const element = elements[index]
    if (!element) return null
    const local = element.getPointAtLength(element.getTotalLength() * ratio)
    return { local: { x: local.x, y: local.y }, client: toClient(element, local) }
  },

  /** 元件中心（client 坐标） */
  bodyCenter(nodeId) {
    const view = viewOf(nodeId)
    if (!view) return null
    const rect = view.container.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  },

  pinCenter(nodeId, portId) {
    const view = viewOf(nodeId)
    if (!view) return null
    const element = view.container.querySelector(`[port="${portId}"]`)
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  },

  pinCount(nodeId) {
    const node = graph.getCellById(nodeId)
    return node ? node.getPorts().length : 0
  },

  pinArgs(nodeId, portId) {
    const node = graph.getCellById(nodeId)
    if (!node) return null
    const port = node.getPorts().find((item) => item.id === portId)
    return port ? port.args : null
  },

  errors: () => window.__errors,
}

// UI 最后再刷：这样即使渲染出问题，上面那套验证钩子也已经挂好了
refreshReadout()
