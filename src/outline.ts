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

/** 两段之间的夹角超过这个度数，才认为中间夹着的是拐角而不是曲线。 */
const CORNER_MIN_ANGLE_DEG = 20

/**
 * 拐角取精确点。
 *
 * 采样是均匀的：每隔 step 问一次"沿曲线走到这儿在哪"。拐角**不会正好落在采样点上**，
 * 于是折线从拐角内侧抄近路 —— 削掉的深度最大约 步长/2。实测（真实 X6，节点本地坐标）：
 *
 *   一个 590×200 的矩形，周长 1580、步长 1580/240 ≈ 6.58，四个拐角里
 *   有两个正好落在采样点上（偏 0.00），另外两个没有（偏 **2.13**）——
 *   已经超过本仓 e2e 自己用的 2px 容差。周长越长步长越大，削得越狠
 *   （周长 4000 的元件按 步长/2 推算会削掉约 8）。
 *
 * 判据盯"桥接段"，不盯顶点：正常边 → **与前后两段都不平行的一段** → 正常边。
 * 中间那段就是抄近路的桥接段，把它的两个端点换成两侧边延长线的交点。
 *   · 光滑曲线每段只和前后差几度 → 不会被误判
 *   · 采样点正好落在拐角上（本来就没削角）→ "后一段与再后一段平行" → 也不动它
 * 首点与末点原样保留，不破坏任何"首尾重合"的判断。
 */
function snapCorners(points: Point[], step: number): Point[] {
  if (points.length < 4) return points.slice()
  const parallelEnough = Math.cos((CORNER_MIN_ANGLE_DEG * Math.PI) / 180)
  // 交点离采样点多远还算"同一个拐角"。真实拐角就在桥接段旁边（距离 ≤ 步长），
  // 所以 1.5 倍步长足够宽松，又不会被病态求交骗到。
  const maxOffset = step * 1.5

  // 每一段的单位方向：segment[k] = points[k] → points[k+1]
  const segments: Array<Point | null> = []
  for (let k = 0; k < points.length - 1; k += 1) {
    const dx = points[k + 1].x - points[k].x
    const dy = points[k + 1].y - points[k].y
    const length = Math.hypot(dx, dy)
    segments.push(length < 1e-9 ? null : { x: dx / length, y: dy / length })
  }

  const replacements = new Map<number, Point>()
  for (let k = 1; k < segments.length - 1; k += 1) {
    // 相邻两段都已经是桥接段了：这个形状比步长还细碎，交给原始采样更稳
    if (replacements.has(k - 1) || replacements.has(k + 1)) continue
    const previous = segments[k - 1]
    const bridge = segments[k]
    const next = segments[k + 1]
    if (!previous || !bridge || !next) continue

    // 桥接段必须和**前后两段都不平行**；正常边只会和一侧不平行
    if (previous.x * bridge.x + previous.y * bridge.y > parallelEnough) continue
    if (bridge.x * next.x + bridge.y * next.y > parallelEnough) continue

    const cross = previous.x * next.y - previous.y * next.x
    if (Math.abs(cross) < 1e-6) continue // 前后两条边本来就平行 ⟹ 这里不是拐角

    const wx = points[k + 1].x - points[k].x
    const wy = points[k + 1].y - points[k].y
    const t = (wx * next.y - wy * next.x) / cross
    const corner = { x: points[k].x + t * previous.x, y: points[k].y + t * previous.y }
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) continue
    if (Math.hypot(corner.x - points[k].x, corner.y - points[k].y) > maxOffset) continue

    replacements.set(k, corner)
  }

  if (replacements.size === 0) return points.slice()

  // 桥接段的两端都丢掉，换成一个精确拐角插在原来的位置上。
  // 逐个下标判断（不能用"跳过两个"的写法）：桥接段正好落在末尾时末点也必须照常输出。
  const dropped = new Set<number>()
  replacements.forEach((_corner, k) => {
    dropped.add(k)
    dropped.add(k + 1)
  })

  const out: Point[] = []
  for (let i = 0; i < points.length; i += 1) {
    const corner = replacements.get(i)
    if (corner) out.push(corner)
    if (dropped.has(i)) continue
    out.push(points[i])
  }
  return out
}

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
    const step = length / count
    // 先把拐角换成精确交点，再按断口切段 —— 顺序不能反：
    // 换拐角只在同一段边上动点，不会造出新的"断口"。
    samples = snapCorners(samples, step)
    runs = splitRuns(samples, step)
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
