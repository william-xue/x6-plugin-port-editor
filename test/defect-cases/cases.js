/* global X6, X6PluginPortEditor */
// 轮廓缺陷案例页：把"今天在课程仓里发现的可能缺陷"逐个搬到真实 X6 上量。
//
// 设计原则：**每个案例只放一个要考的几何形状**，然后用插件的落点函数
// 拿节点本地坐标的精确数字。数字才能判红判绿，肉眼看不算证据。
//
// 案例：
//   c-line      <line> 当轮廓       —— 白名单里没有 line
//   c-polyline  开放折线            —— 首尾被取模连起来，会不会多一段封口线
//   c-holed     两个子路径的 path   —— 子路径交界处会不会多一段幻影线
//   c-hidden    一个 visibility:hidden 的形状 —— 看不见但有尺寸，会不会参与
//   c-corner    长周长的矩形         —— 均匀采样会不会把拐角削掉一块
//
// 每个案例都暴露 __cases.hit(id, lx, ly)：把节点本地坐标换成 client 坐标后
// 调 findNearestOutlinePoint，返回落点（本地坐标）与距离。

const { Graph } = X6

window.__errors = []
window.addEventListener('error', (e) => window.__errors.push(String(e.message)))

const graph = new Graph({
  container: document.getElementById('graph'),
  grid: true,
  panning: true,
})

const size = (w, h) => ({ width: w, height: h })

graph.addNode({
  id: 'c-line',
  x: 40,
  y: 40,
  ...size(200, 60),
  markup: [
    {
      tagName: 'line',
      selector: 'body',
      attrs: { x1: 10, y1: 30, x2: 190, y2: 30, stroke: '#333333', strokeWidth: 6 },
    },
  ],
})

graph.addNode({
  id: 'c-polyline',
  x: 300,
  y: 40,
  ...size(200, 140),
  markup: [
    {
      tagName: 'polyline',
      selector: 'body',
      attrs: { points: '20,20 180,20 180,120', fill: 'none', stroke: '#333333', strokeWidth: 4 },
    },
  ],
})

graph.addNode({
  id: 'c-holed',
  x: 560,
  y: 40,
  ...size(200, 140),
  markup: [
    {
      tagName: 'path',
      selector: 'body',
      attrs: {
        d: 'M20,20 H180 V120 H20 Z M60,50 H140 V90 H60 Z',
        fill: '#dbe7ff',
        stroke: '#333333',
        strokeWidth: 2,
        fillRule: 'evenodd',
      },
    },
  ],
})

graph.addNode({
  id: 'c-hidden',
  x: 40,
  y: 260,
  ...size(200, 140),
  markup: [
    {
      tagName: 'rect',
      selector: 'visible',
      attrs: { x: 20, y: 20, width: 160, height: 100, fill: '#eef2ff', stroke: '#333333', strokeWidth: 2 },
    },
    {
      tagName: 'rect',
      selector: 'hiddenBox',
      attrs: {
        x: 40, y: 40, width: 120, height: 60,
        fill: 'none', stroke: '#cc0000', strokeWidth: 2,
        visibility: 'hidden',
      },
    },
  ],
})

// 周长 1580 → 采样步长 1580/240 ≈ 6.58，拐角落在非整数个采样点上 → 会被削
graph.addNode({
  id: 'c-corner',
  x: 300,
  y: 260,
  ...size(590, 200),
  markup: [
    {
      tagName: 'rect',
      selector: 'body',
      attrs: { x: 0, y: 0, width: 590, height: 200, fill: '#eef2ff', stroke: '#333333', strokeWidth: 2 },
    },
  ],
})

const plugin = new X6PluginPortEditor.PortEditor({ graph })

/** 节点本地坐标 → client（视口）坐标：直接用节点容器的 getScreenCTM */
function toClient(nodeId, x, y) {
  const view = graph.getCellById(nodeId).findView(graph)
  const ctm = view.container.getScreenCTM()
  return { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f }
}

/**
 * 在节点本地坐标 (lx, ly) 处问插件："最近轮廓点在哪？"
 * 返回 { elements, tags, hit: {lx, ly, distance, tag} | null }，全部是本地坐标系。
 */
function hit(nodeId, lx, ly) {
  const node = graph.getCellById(nodeId)
  const view = node.findView(graph)
  const container = view.container
  const elements = X6PluginPortEditor.collectOutlineElements(container, undefined)
  const client = toClient(nodeId, lx, ly)
  const found = X6PluginPortEditor.findNearestOutlinePoint(container, elements, client.x, client.y, 240)
  if (!found) return { elements: elements.length, tags: elements.map((e) => e.tagName), hit: null }
  // found.local 已经是节点本地坐标，直接用它，和查询点 (lx, ly) 同一套坐标
  return {
    elements: elements.length,
    tags: elements.map((e) => e.tagName),
    hit: { lx: found.local.x, ly: found.local.y, distance: found.distance, tag: found.element.tagName },
  }
}

window.__cases = { graph, plugin, hit, toClient, nodeCount: () => graph.getNodes().length }
