#!/usr/bin/env bash
# End-to-end verification of x6-plugin-port-editor against the real demo page in real Chrome.
# Drives real mouse/keyboard events (no synthetic dispatchEvent) and asserts the whole loop:
#   进入添加模式 → 贴轮廓落点 → 点击生成引脚 → 添加模式下从引脚拉线 / 本体起线被屏蔽
#   → 退出模式（按钮/Esc）→ 从引脚与本体拉线均正常 → 悬停引脚删除（连带删线）
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.nvm/versions/node/v24.14.0/bin:${PATH}"

PORT="${PORT:-8732}"
PASS=0
FAIL=0

ev() {
  playwright-cli --raw eval "$1" 2>/dev/null | tail -1 | python3 -c '
import sys, json
s = sys.stdin.read().strip()
try:
    v = json.loads(s)
except Exception:
    v = s
print(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
'
}

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf 'PASS  %-52s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL  %-52s expected=%s actual=%s\n' "$1" "$2" "$3"
  fi
}

point() { # nodeId ratio -> "x y" (整数 client 坐标)
  ev "(() => { const p = window.__demo.outlinePoint('$1', $2); return Math.round(p.client.x) + ' ' + Math.round(p.client.y); })()"
}

local_point() { # nodeId ratio -> "x y"（节点本地坐标，保留 2 位）
  ev "(() => { const p = window.__demo.outlinePoint('$1', $2); return p.local.x.toFixed(2) + ' ' + p.local.y.toFixed(2); })()"
}

center() { # nodeId -> "x y"
  ev "(() => { const c = window.__demo.bodyClientCenter('$1'); return Math.round(c.x) + ' ' + Math.round(c.y); })()"
}

body_point() { # nodeId [dx] [dy] -> 本体上的点（避开居中标签）
  ev "(() => { const c = window.__demo.bodyClientPoint('$1', ${2:-16}, ${3:-14}); return Math.round(c.x) + ' ' + Math.round(c.y); })()"
}

pin_center() { # nodeId portId -> "x y"
  ev "(() => { const c = window.__demo.pinClientCenter('$1', '$2'); return Math.round(c.x) + ' ' + Math.round(c.y); })()"
}

drag() { # x1 y1 x2 y2
  playwright-cli mousemove "$1" "$2" >/dev/null
  playwright-cli mousedown >/dev/null
  playwright-cli mousemove "$(( ($1 + $3) / 2 ))" "$(( ($2 + $4) / 2 ))" >/dev/null
  playwright-cli mousemove "$3" "$4" >/dev/null
  playwright-cli mouseup >/dev/null
  sleep 0.3
}

click_at() { # x y
  playwright-cli mousemove "$1" "$2" >/dev/null
  playwright-cli mousedown >/dev/null
  playwright-cli mouseup >/dev/null
  sleep 0.2
}

pins() { # nodeId
  ev "String(window.__demo.plugin.getPins(window.__demo.nodes.$1).length)"
}

edges() { ev 'String(window.__demo.graph.getEdges().length)'; }
edge_src_port() { ev "String((window.__demo.sourcePortOfEdge($1) || {}).source?.port)"; }
edge_tgt_cell() { ev "String((window.__demo.sourcePortOfEdge($1) || {}).target?.cell)"; }

echo "=== x6-plugin-port-editor e2e (port $PORT) ==="

node scripts/serve.mjs "$PORT" >/tmp/x6pe-serve.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; playwright-cli close >/dev/null 2>&1 || true' EXIT
sleep 1

if ! curl -sf "http://127.0.0.1:${PORT}/demo/index.html" >/dev/null; then
  echo "server not ready"; cat /tmp/x6pe-serve.log; exit 1
fi

playwright-cli open --browser=chrome "http://127.0.0.1:${PORT}/demo/index.html" >/dev/null
sleep 1.5

if [ "$(ev 'String(!!window.__demo)')" != "true" ]; then
  echo "demo did not initialise — console dump:"
  playwright-cli console 2>&1 | tail -20
  exit 1
fi

# ---------- S0 初始化 ----------
check "S0 demo loaded" "true" "$(ev 'String(!!window.__demo && !!window.__demo.plugin)')"
check "S0 X6 UMD loaded" "true" "$(ev 'String(typeof X6.Graph === "function")')"
check "S0 initial pins/edges" "0/0" "$(ev 'window.__demo.plugin.getPins(window.__demo.nodes.circle).length + "/" + window.__demo.graph.getEdges().length')"
check "S0 add mode off by default" "false" "$(ev 'String(window.__demo.plugin.isAdding())')"
check "S0 rect body is a magnet (like real power editors)" "true" "$(ev 'String(window.__demo.graph.getCellById("n-rect").getAttrs().body.magnet === true)')"
INTERACTING_BEFORE="$(ev 'JSON.stringify(window.__demo.graph.options.interacting || null)')"
RECT_POS_BEFORE="$(ev 'JSON.stringify(window.__demo.nodes.rect.getPosition())')"

# ---------- S1 进入添加引脚模式 ----------
playwright-cli click "#btn-add-pin" >/dev/null
check "S1 toolbar enters add mode" "true" "$(ev 'String(window.__demo.plugin.isAdding())')"
check "S1 button reflects the mode" "退出添加（Esc）" "$(ev 'document.getElementById("btn-add-pin").textContent')"
check "S1 container flagged for crosshair" "true" "$(ev 'String(window.__demo.graph.container.classList.contains("x6-pe-adding"))')"
check "S1 nodes are not movable while adding" "false" "$(ev 'String(window.__demo.nodes.rect.findView(window.__demo.graph).can("nodeMovable"))')"
check "S1 canvas panning disabled while adding" "false" "$(ev 'String(window.__demo.graph.isPannable())')"

# ---------- S2 圆形元件轮廓落点预览 ----------
read -r CX CY <<EOF
$(point n-circle 0)
EOF
read -r CLX CLY <<EOF
$(local_point n-circle 0)
EOF
playwright-cli mousemove "$CX" "$CY" >/dev/null
sleep 0.2
check "S2 preview dot visible on hover" "block" "$(ev 'document.querySelector(".x6-pe-preview").style.display')"
check "S2 preview dot sits on the outline (px off)" "0" "$(ev '
(() => {
  const p = window.__demo.outlinePoint("n-circle", 0);
  const r = document.querySelector(".x6-pe-preview").getBoundingClientRect();
  return String(Math.round(Math.hypot(r.left + r.width / 2 - p.client.x, r.top + r.height / 2 - p.client.y)));
})()')"

# ---------- S3 点击生成引脚 ----------
click_at "$CX" "$CY"
check "S3 pin count on circle" "1" "$(pins circle)"
check "S3 pin id generated" "pin-1" "$(ev 'String(window.__demo.plugin.getPins(window.__demo.nodes.circle)[0].id)')"
check "S3 pin group" "pin" "$(ev 'String(window.__demo.plugin.getPins(window.__demo.nodes.circle)[0].group)')"
check "S3 pin args match clicked outline point (tol 2px)" "true" "$(ev '
(() => {
  const d = window.__demo;
  const t = d.outlinePoint("n-circle", 0).local;
  const a = d.pinArgs("n-circle", "pin-1");
  return String(Math.abs(a.x - t.x) <= 2 && Math.abs(a.y - t.y) <= 2);
})()')"
check "S3 pin rendered in DOM" "1" "$(ev 'String(document.querySelectorAll(".x6-port-pin").length)')"

# ---------- S4 异形轮廓（六边形）再生成一个引脚 ----------
read -r HX HY <<EOF
$(point n-hex 0.25)
EOF
click_at "$HX" "$HY"
check "S4 hexagon pin created" "1" "$(pins hex)"
check "S4 hexagon pin args on polygon edge (tol 2px)" "true" "$(ev '
(() => {
  const d = window.__demo;
  const t = d.outlinePoint("n-hex", 0.25).local;
  const a = d.plugin.getPins(d.nodes.hex)[0].args;
  return String(Math.abs(a.x - t.x) <= 2 && Math.abs(a.y - t.y) <= 2);
})()')"

# ---------- S5 悬停引脚出现删除徽章 ----------
read -r PX PY <<EOF
$(pin_center n-circle pin-1)
EOF
playwright-cli mousemove "$PX" "$PY" >/dev/null
sleep 0.2
check "S5 delete badge shown on pin hover" "block" "$(ev 'document.querySelector(".x6-pe-delete").style.display')"
PIN_BEFORE_PAN_TEST="$(pin_center n-circle pin-1)"

# ---------- S6 添加模式下：引脚可拉线、本体起线被屏蔽 ----------
read -r HEX HEXY <<EOF
$(center n-hex)
EOF
drag "$PX" "$PY" "$HEX" "$HEXY"
check "S6 in add mode: wire from an existing pin works" "1" "$(edges)"
check "S6 wire source port" "pin-1" "$(edge_src_port 0)"

read -r RX RY <<EOF
$(body_point n-rect)
EOF
drag "$RX" "$RY" "$HEX" "$HEXY"
check "S6 in add mode: wire from element body blocked" "1" "$(edges)"
check "S6 blocked drag added no pin" "0" "$(pins rect)"
check "S6 blocked drag did not move the node" "$RECT_POS_BEFORE" "$(ev 'JSON.stringify(window.__demo.nodes.rect.getPosition())')"
check "S6 blocked drag did not pan the canvas" "$PIN_BEFORE_PAN_TEST" "$(pin_center n-circle pin-1)"

# ---------- S7 退出添加模式（Esc）与守卫还原 ----------
playwright-cli press Escape >/dev/null
sleep 0.2
check "S7 Esc exits add mode" "false" "$(ev 'String(window.__demo.plugin.isAdding())')"
check "S7 button label restored" "添加引脚" "$(ev 'document.getElementById("btn-add-pin").textContent')"
check "S7 crosshair class removed" "false" "$(ev 'String(window.__demo.graph.container.classList.contains("x6-pe-adding"))')"
check "S7 validateMagnet override restored" "undefined" "$(ev 'String(typeof window.__demo.graph.options.connecting.validateMagnet)')"
check "S7 interacting option restored" "$INTERACTING_BEFORE" "$(ev 'JSON.stringify(window.__demo.graph.options.interacting || null)')"
check "S7 nodes movable again" "true" "$(ev 'String(window.__demo.nodes.rect.findView(window.__demo.graph).can("nodeMovable"))')"
check "S7 panning enabled again" "true" "$(ev 'String(window.__demo.graph.isPannable())')"

# ---------- S8 退出后：本体拉线恢复原生行为 ----------
drag "$RX" "$RY" "$HEX" "$HEXY"
check "S8 idle: wire from element body works again" "2" "$(edges)"

# ---------- S9 非添加模式下点击节点不产生引脚 ----------
click_at "$HX" "$HY"
check "S9 idle click adds no pin" "1" "$(pins hex)"

# ---------- S10 按钮二次点击可退出模式 ----------
playwright-cli click "#btn-add-pin" >/dev/null
check "S10 button re-enters add mode" "true" "$(ev 'String(window.__demo.plugin.isAdding())')"
playwright-cli click "#btn-add-pin" >/dev/null
check "S10 button exits add mode" "false" "$(ev 'String(window.__demo.plugin.isAdding())')"

# ---------- S11 删除引脚（悬停 → 点 ×）连带删线 ----------
playwright-cli click "#btn-add-pin" >/dev/null
read -r PX2 PY2 <<EOF
$(pin_center n-circle pin-1)
EOF
playwright-cli mousemove "$PX2" "$PY2" >/dev/null
sleep 0.2
playwright-cli click ".x6-pe-delete" >/dev/null
sleep 0.3
check "S11 pin removed" "0" "$(pins circle)"
check "S11 wires attached to that pin removed" "1" "$(edges)"
playwright-cli press Escape >/dev/null
sleep 0.2
check "S11 back to idle after deletion" "false" "$(ev 'String(window.__demo.plugin.isAdding())')"

# ---------- S12 拖拽建引脚（调色板 → 元件轮廓） ----------
check "S12 palette has 4 templates" "4" "$(ev 'String(window.__demo.palette.getNodes().length)')"
NODES_BEFORE_DROP="$(ev 'String(window.__demo.nodeCount())')"
PINS_BEFORE_DROP="$(pins circle)"
read -r TPLX TPLY <<EOF
$(ev "(() => { const c = window.__demo.paletteItemCenter('tpl-pin'); return Math.round(c.x) + ' ' + Math.round(c.y); })()")
EOF
read -r DROPX DROPY <<EOF
$(point n-circle 0.5)
EOF
drag "$TPLX" "$TPLY" "$DROPX" "$DROPY"
check "S12 drop of the pin template created a pin" "$(( PINS_BEFORE_DROP + 1 ))" "$(pins circle)"
check "S12 pin template did not land as a node" "$NODES_BEFORE_DROP" "$(ev 'String(window.__demo.nodeCount())')"
check "S12 dropped pin sits on the outline (<=3px)" "true" "$(ev '
(() => {
  const d = window.__demo;
  const ids = d.pinsOf("n-circle");
  const last = d.pinArgs("n-circle", ids[ids.length - 1]);
  return String(d.outlineDistance("n-circle", last.x, last.y) <= 3);
})()')"

# ---------- S13 拖拽建元件（普通模板照常落地） ----------
read -r RTPLX RTPLY <<EOF
$(ev "(() => { const c = window.__demo.paletteItemCenter('tpl-rect'); return Math.round(c.x) + ' ' + Math.round(c.y); })()")
EOF
read -r EMPTYX EMPTYY <<EOF
$(ev '(() => { const r = window.__demo.graph.container.getBoundingClientRect(); return Math.round(r.left + 120) + " " + Math.round(r.bottom - 60); })()')
EOF
drag "$RTPLX" "$RTPLY" "$EMPTYX" "$EMPTYY"
check "S13 component template landed as a new node" "$(( NODES_BEFORE_DROP + 1 ))" "$(ev 'String(window.__demo.nodeCount())')"

# ---------- S14 连线样式可配置（X6 edge 自身能力） ----------
playwright-cli select "#edge-style" "plain" >/dev/null 2>&1 || playwright-cli select "#edge-style" "无箭头" >/dev/null
sleep 0.2
check "S14 preset 'plain' removed the arrow" "true" "$(ev 'String(window.__demo.edgeLineAttrs(0).targetMarker === null)')"
playwright-cli select "#edge-style" "dashed" >/dev/null
sleep 0.2
check "S14 preset 'dashed' set a dash pattern" "6 3" "$(ev 'String(window.__demo.edgeLineAttrs(0).strokeDasharray)')"
playwright-cli select "#edge-style" "flow" >/dev/null
sleep 0.2
check "S14 preset 'flow' uses a block marker" "block" "$(ev 'String((window.__demo.edgeLineAttrs(0).targetMarker || {}).name)')"
check "S14 preset 'flow' adds a stroke animation" "x6pe-flow 30s infinite linear" "$(ev 'String(window.__demo.edgeLineAttrs(0).style.animation)')"

# ---------- S15 导出 / 导入往返（引脚与连线端点绑定都能复原） ----------
# 先造一条"从引脚出发"的连线，确保往返数据里有引脚绑定
read -r PPX PPY <<EOF
$(pin_center n-circle pin-1)
EOF
read -r HHX HHY <<EOF
$(center n-hex)
EOF
drag "$PPX" "$PPY" "$HHX" "$HHY"
check "S15 pin-bound wire created before export" "2" "$(edges)"
check "S15 that wire starts from the pin" "pin-1" "$(ev '(() => { const es = window.__demo.graph.getEdges(); const e = es.find((x) => (x.getSource() || {}).port); return String(e ? e.getSource().port : null); })()')"

STATE_BEFORE="$(ev 'window.__demo.pinState()')"
check "S15 export produced JSON" "true" "$(ev 'String(window.__demo.exportJSON().length > 500)')"
check "S15 JSON carries pins (groups+items+args)" "true" "$(ev '
(() => {
  const state = JSON.parse(window.__demo.exportJSON());
  const node = state.graph.cells.find((c) => c.id === "n-circle");
  return String(!!(node && node.ports && node.ports.items && node.ports.items.length >= 1));
})()')"
check "S15 JSON carries edge port bindings" "true" "$(ev '
(() => {
  const state = JSON.parse(window.__demo.exportJSON());
  return String(state.graph.cells.some((c) => c.source && c.source.port));
})()')"

ev 'window.__demo.clearAll()' >/dev/null
check "S15 graph cleared before import" "0" "$(ev 'String(window.__demo.nodeCount())')"

check "S15 import succeeded" "true" "$(ev 'String(window.__demo.importJSON() === true)')"
check "S15 state restored exactly (nodes+pins+args+edge ports)" "$STATE_BEFORE" "$(ev 'window.__demo.pinState()')"

# 复原后插件仍可用：悬停复原出来的引脚应出现删除徽章
RESTORED_PIN="$(ev '(() => { const c = window.__demo.pinClientCenter("n-circle", "pin-1"); return c ? Math.round(c.x) + " " + Math.round(c.y) : "none"; })()')"
read -r RPX RPY <<EOF
$RESTORED_PIN
EOF
if [ "$RESTORED_PIN" = "none" ]; then
  check "S15 restored pin exists" "pin-1" "none"
else
  playwright-cli click "#btn-add-pin" >/dev/null
  playwright-cli mousemove "$RPX" "$RPY" >/dev/null
  sleep 0.2
  check "S15 restored pin is interactive (badge shows)" "block" "$(ev 'document.querySelector(".x6-pe-delete").style.display')"
  playwright-cli press Escape >/dev/null
fi

# ---------- S16 控制台无报错 ----------
check "S16 no page errors" "0" "$(ev 'String((window.__errors || []).length)')"

echo
echo "=== summary: ${PASS} passed, ${FAIL} failed ==="
exit $(( FAIL > 0 ? 1 : 0 ))
