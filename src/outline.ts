import type { Point } from './types'

// `line` 必须在里面：元件轮廓用 <line> 画直边很常见（母线、横担、分隔线），
// 少一个标签就等于**整个节点放不了引脚** —— 实测 collectOutlineElements 会直接返回 0 个元素。
const GEOMETRY_SELECTOR = 'rect,circle,ellipse,path,polygon,polyline,line'
const EXCLUDE_SELECTOR = '.x6-port, .x6-port-label, .x6-tools, .x6-cell-tools, foreignObject'

/** 一条连续折线：`[起下标, 止下标]`（含两端）。段只允许在同一个 run 内相连。 */
type Run = [number, number]

interface Sampler {
  length: number
  samples: Point[]
  /**
   * 采样点被"断口"切成的几段。
   *
   * 为什么要切：一条 `<path>` 可以有好几个子路径（带孔洞的形状就是），
   * 而 `getPointAtLength` 把它们**当成一条曲线** —— 走到子路径交界处直接跳过去。
   * 于是采样点里会出现一段"上一圈末点 → 下一圈首点"的直线，屏幕上根本不存在。
   * 数组首尾同理：它们并不是相邻的两个点，所以**不能再用取模把它们连起来**
   *（开放折线会凭空多出一条封口线）。
   *
   * 实测（真实 X6，节点本地坐标）：贴着断口端点 (21,21) 问最近轮廓点，
   * 落点落在这条不存在的线上，离查询点只有 0.32 —— 而真实边在 1.00 外。
   */
  runs: Run[]
}

const samplerCache = new WeakMap<SVGGeometryElement, Sampler>()

export interface OutlineHit {
  /** Node-local coordinates — exactly the space `ports.items[].args` is resolved in. */
  local: Point
  /** Client (viewport) pixels — used to place overlay markers. */
  client: Point
  /** Distance from the pointer to the outline, in client pixels. */
  distance: number
  element: SVGGeometryElement
}

/**
 * Collect the geometric elements that make up a node's visible outline.
 *
 * When `selector` is given the first match wins; otherwise every geometric shape in the
 * markup is considered, which is what makes custom (non-rectangular) symbols work: the
 * nearest shape to the pointer provides the pin location.
 */
export function collectOutlineElements(
  container: Element,
  selector?: string,
): SVGGeometryElement[] {
  const found: SVGGeometryElement[] = []

  const usable = (el: Element) => {
    if (el.closest(EXCLUDE_SELECTOR)) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 || rect.height > 0
  }

  if (selector) {
    container.querySelectorAll(selector).forEach((el) => {
      if (usable(el)) found.push(el as SVGGeometryElement)
    })
    if (found.length > 0) return found
  }

  container.querySelectorAll(GEOMETRY_SELECTOR).forEach((el) => {
    if (usable(el)) found.push(el as SVGGeometryElement)
  })

  return found
}

/** 相邻两个采样点离得比"正常间隔"远这么多倍，就认为中间有断口（子路径交界）。 */
const GAP_FACTOR = 1.8

function getSampler(el: SVGGeometryElement, sampleCount: number): Sampler {
  let length = 0
  try {
    length = el.getTotalLength()
  } catch {
    length = 0
  }

  const cached = samplerCache.get(el)
  if (cached && cached.length === length && (length === 0 || cached.samples.length > 0)) {
    return cached
  }

  let samples: Point[] = []
  let runs: Run[] = [[0, 0]]

  if (length > 0) {
    const count = Math.max(24, Math.min(sampleCount, Math.ceil(length / 2)))
    for (let i = 0; i <= count; i += 1) {
      const p = el.getPointAtLength((length * i) / count)
      samples.push({ x: p.x, y: p.y })
    }
    runs = splitRuns(samples, length / count)
  } else {
    // Fallback for engines/shapes without getTotalLength: walk the bounding box perimeter.
    const bbox = el.getBBox()
    const corners: Point[] = [
      { x: bbox.x, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y },
      { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
      { x: bbox.x, y: bbox.y + bbox.height },
    ]
    samples = corners.concat([corners[0]])
    runs = [[0, samples.length - 1]]
  }

  const sampler: Sampler = { length, samples, runs }
  samplerCache.set(el, sampler)
  return sampler
}

/**
 * 按"断口"把采样点切成几段。
 *
 * 正常相邻采样点的距离 ≈ 采样间隔（弦长恒 ≤ 弧长），所以比间隔大出一截的
 * 一定是子路径交界处的跳跃。**不做这一步就会连出屏幕不存在的线**
 *（实测贴着断口端点 0.32 处就能被吸上去）。
 */
function splitRuns(samples: Point[], step: number): Run[] {
  if (samples.length < 2) return [[0, Math.max(0, samples.length - 1)]]
  const threshold = (Number.isFinite(step) && step > 0 ? step : 1) * GAP_FACTOR
  const runs: Run[] = []
  let start = 0
  for (let i = 1; i < samples.length; i += 1) {
    const dx = samples[i].x - samples[i - 1].x
    const dy = samples[i].y - samples[i - 1].y
    if (Math.hypot(dx, dy) > threshold) {
      runs.push([start, i - 1])
      start = i
    }
  }
  runs.push([start, samples.length - 1])
  return runs
}

function transform(m: DOMMatrix, x: number, y: number): Point {
  const p = new DOMPoint(x, y).matrixTransform(m)
  return { x: p.x, y: p.y }
}

function closestOnSegment(a: Point, b: Point, p: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return { x: a.x, y: a.y }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

function nearestOnPolyline(
  samples: Point[],
  runs: Run[],
  p: Point,
): { point: Point; distance: number } {
  let bestIdx = 0
  let bestDistSq = Infinity

  for (let i = 0; i < samples.length; i += 1) {
    const dx = samples[i].x - p.x
    const dy = samples[i].y - p.y
    const d = dx * dx + dy * dy
    if (d < bestDistSq) {
      bestDistSq = d
      bestIdx = i
    }
  }

  let best = samples[bestIdx]
  let bestDistance = Math.sqrt(bestDistSq)

  // 只在**同一个 run 内部**取相邻点。不再用取模绕回数组首尾 ——
  // 首尾并不是相邻的两个点，连起来就是一条屏幕上不存在的线。
  const run = runs.find(([start, end]) => bestIdx >= start && bestIdx <= end)
  const neighbours: Point[] = []
  if (run) {
    const [start, end] = run
    if (bestIdx > start) neighbours.push(samples[bestIdx - 1])
    if (bestIdx < end) neighbours.push(samples[bestIdx + 1])
  }

  neighbours.forEach((other) => {
    const candidate = closestOnSegment(samples[bestIdx], other, p)
    const distance = Math.hypot(candidate.x - p.x, candidate.y - p.y)
    if (distance < bestDistance) {
      best = candidate
      bestDistance = distance
    }
  })

  return { point: best, distance: bestDistance }
}

/**
 * Project a client-space pointer position onto the node outline.
 *
 * Pan, zoom and node rotation are all handled by the SVG CTM chain, so the result is valid
 * whatever transform the graph or the node currently has.
 */
export function findNearestOutlinePoint(
  nodeContainer: SVGGraphicsElement,
  elements: SVGGeometryElement[],
  clientX: number,
  clientY: number,
  sampleCount = 240,
): OutlineHit | null {
  if (elements.length === 0) return null

  const svgRoot = nodeContainer.ownerSVGElement
  if (!svgRoot) return null
  const rootScreenCTM = svgRoot.getScreenCTM()
  if (!rootScreenCTM) return null

  // pointer in SVG root user space
  const pointerSvg = transform(rootScreenCTM.inverse(), clientX, clientY)

  let best: { distance: number; svg: Point; element: SVGGeometryElement } | null = null

  elements.forEach((el) => {
    const elCTM = (el as SVGGraphicsElement).getCTM()
    if (!elCTM) return
    const sampler = getSampler(el, sampleCount)
    if (sampler.samples.length === 0) return

    // compare in the element's own user space, then map the winner back
    const pointerEl = transform(elCTM.inverse(), pointerSvg.x, pointerSvg.y)
    const local = nearestOnPolyline(sampler.samples, sampler.runs, pointerEl)
    const svgPoint = transform(elCTM, local.point.x, local.point.y)
    const distance = Math.hypot(svgPoint.x - pointerSvg.x, svgPoint.y - pointerSvg.y)

    if (!best || distance < best.distance) {
      best = { distance, svg: svgPoint, element: el }
    }
  })

  if (!best) return null

  const winner = best as { distance: number; svg: Point; element: SVGGeometryElement }
  const nodeCTM = nodeContainer.getCTM()

  return {
    local: nodeCTM ? transform(nodeCTM.inverse(), winner.svg.x, winner.svg.y) : winner.svg,
    client: transform(rootScreenCTM, winner.svg.x, winner.svg.y),
    distance: winner.distance,
    element: winner.element,
  }
}
