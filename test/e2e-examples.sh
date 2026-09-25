#!/usr/bin/env bash
# 验证 examples/ 下的两个例子（真实 Chrome、真实鼠标事件）
#   例 1 · 最小接入：接入 8 行后，加引脚 / 拉线 / 删除全链路
#   例 2 · 电力场景：自定义元件形状 + 自己的端子组 + 选中态穿透 + History 撤销 + 拖拽建端子 + 导出导入
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.nvm/versions/node/v24.14.0/bin:${PATH}"

PORT="${PORT:-8755}"
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

check() {
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf 'PASS  %-52s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL  %-52s expected=%s actual=%s\n' "$1" "$2" "$3"
  fi
}

drag() { # x1 y1 x2 y2
  playwright-cli mousemove "$1" "$2" >/dev/null
  playwright-cli mousedown >/dev/null
  playwright-cli mousemove "$(( ($1 + $3) / 2 ))" "$(( ($2 + $4) / 2 ))" >/dev/null
  playwright-cli mousemove "$3" "$4" >/dev/null
  playwright-cli mouseup >/dev/null
  sleep 0.3
}

click_at() {
  playwright-cli mousemove "$1" "$2" >/dev/null
  playwright-cli mousedown >/dev/null
  playwright-cli mouseup >/dev/null
  sleep 0.25
}

xy() { # nodeId ratio -> "x y"（轮廓点，client 坐标）
  ev "(() => { const p = window.__ex.outlinePoint('$1', $2); const c = p.client || p; return Math.round(c.x) + ' ' + Math.round(c.y); })()"
}

ctr() { # nodeId -> 元件中心 client 坐标
  ev "(() => { const c = window.__ex.bodyCenter('$1'); return Math.round(c.x) + ' ' + Math.round(c.y); })()"
}

pinctr() { # nodeId portId -> 端子中心
  ev "(() => { const c = window.__ex.pinCenter('$1', '$2'); return c ? Math.round(c.x) + ' ' + Math.round(c.y) : 'none'; })()"
}

echo "=== examples e2e (port $PORT) ==="
node scripts/serve.mjs "$PORT" >/tmp/x6pe-ex-serve.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; playwright-cli close >/dev/null 2>&1 || true' EXIT
sleep 1
BASE="http://127.0.0.1:${PORT}/examples"

# ══════════════════════════ 例 1 · 最小接入 ══════════════════════════
echo "--- 例 1 · 01-basic ---"
playwright-cli open --browser=chrome "$BASE/01-basic/index.html" >/dev/null
sleep 1.5
check "E1 页面就绪" "true" "$(ev 'String(!!window.__ready)')"
check "E1 初始 3 元件 / 0 连线" "3/0" "$(ev 'window.__ex.graph.getNodes().length + "/" + window.__ex.graph.getEdges().length')"
check "E1 初始无引脚" "0" "$(ev 'String(window.__ex.pinsOf("a").length)')"

playwright-cli click "#btn-add-pin" >/dev/null
check "E1 进入添加模式" "true" "$(ev 'String(window.__ex.plugin.isAdding())')"

read -r AX AY <<EOF
$(xy a 0.5)
EOF
playwright-cli mousemove "$AX" "$AY" >/dev/null
sleep 0.2
check "E1 轮廓落点预览出现" "block" "$(ev 'document.querySelector(".x6-pe-preview").style.display')"

click_at "$AX" "$AY"
check "E1 点击生成引脚 pin-1" '["pin-1"]' "$(ev 'JSON.stringify(window.__ex.pinsOf("a"))')"
check "E1 引脚组自动补为 pin" "pin" "$(ev 'String(window.__ex.graph.getCellById("a").getPorts()[0].group)')"
check "E1 引脚贴在轮廓上（≤2px）" "true" "$(ev '
(() => {
  const p = window.__ex.pinArgs("a", "pin-1");
  return String(window.__ex.outlineDistance("a", p.x, p.y) <= 2);
})()')"

playwright-cli press Escape >/dev/null
sleep 0.2
check "E1 Esc 退出添加模式" "false" "$(ev 'String(window.__ex.plugin.isAdding())')"

read -r PAX PAY <<EOF
$(pinctr a pin-1)
EOF
read -r BX BY <<EOF
$(ctr b)
EOF
drag "$PAX" "$PAY" "$BX" "$BY"
check "E1 从引脚拉线成功" "1" "$(ev 'String(window.__ex.graph.getEdges().length)')"
check "E1 连线起点绑定到引脚" "pin-1" "$(ev 'String((window.__ex.graph.getEdges()[0].getSource() || {}).port)')"

click_at "$AX" "$AY"
check "E1 非添加模式点击不加引脚" "1" "$(ev 'String(window.__ex.pinsOf("a").length)')"
check "E1 无页面报错" "0" "$(ev 'String((window.__errors || []).length)')"

# ══════════════════════════ 例 2 · 电力场景 ══════════════════════════
echo "--- 例 2 · 02-power-editor ---"
playwright-cli open --browser=chrome "$BASE/02-power-editor/index.html" >/dev/null
sleep 1.6
check "E2 页面就绪" "true" "$(ev 'String(!!window.__ready)')"
check "E2 3 元件 / 调色板 4 模板" "3/4" "$(ev 'window.__ex.nodeCount() + "/" + window.__ex.palette.getNodes().length')"
check "E2 自定义元件形状已注册使用" "power-ct" "$(ev 'String(window.__ex.graph.getCellById("n-ct").shape)')"
check "E2 元件自带 terminal 端子组" "terminal" "$(ev 'String(Object.keys(window.__ex.graph.getCellById("n-ct").prop("ports/groups") || {})[0])')"

# 先选中元件（让 X6 的选择框出现在轮廓上）
read -r CX CY <<EOF
$(ctr n-ct)
EOF
click_at "$CX" "$CY"
check "E2 元件已被选中（选择框已出现）" "1" "$(ev 'String(window.__ex.graph.getPlugin("selection").getSelectedCells().length)')"
check "E2 选择框存在但不再遮挡轮廓（pointerEvents: none）" "true" "$(ev '
(() => {
  const p = window.__ex.outlinePoint("n-ct", 0.5);
  const el = document.elementFromPoint(p.client.x, p.client.y);
  const boxExists = !!document.querySelector(".x6-widget-selection-box");
  const covered = !!(el && String(el.className).includes("selection-box"));
  return String(boxExists && !covered);
})()')"
# 穿透能力单测：手动把选择框改回可交互，插件的落点判定仍应找得到元件
check "E2 落点判定可穿透可交互覆盖层" "true" "$(ev '
(() => {
  const p = window.__ex.outlinePoint("n-ct", 0.5);
  const boxes = [...document.querySelectorAll(".x6-widget-selection-box")];
  boxes.forEach((el) => (el.style.pointerEvents = "auto"));
  const covered = (() => { const el = document.elementFromPoint(p.client.x, p.client.y); return !!(el && String(el.className).includes("selection-box")); })();
  const found = !!window.__ex.plugin.findNodeAtClient(p.client.x, p.client.y);
  boxes.forEach((el) => (el.style.pointerEvents = ""));
  return String(covered && found);
})()')"

playwright-cli click "#btn-add-pin" >/dev/null
read -r OX OY <<EOF
$(xy n-ct 0.5)
EOF
click_at "$OX" "$OY"
check "E2 选中态下点轮廓仍能加端子（穿透选择框）" '["T-1"]' "$(ev 'JSON.stringify(window.__ex.pinsOf("n-ct").map((p) => p.id))')"
check "E2 端子组用项目自己的 terminal" "terminal" "$(ev 'String(window.__ex.pinsOf("n-ct")[0].group)')"
check "E2 端子贴在轮廓上（≤2px）" "true" "$(ev '
(() => {
  const p = window.__ex.pinsOf("n-ct")[0].args;
  return String(window.__ex.outlineDistance("n-ct", p.x, p.y) <= 2);
})()')"

# 与 History 共存：加一个端子 = 一步撤销（插件把"补组定义 + 加端子"合进一个 batch）
playwright-cli press Escape >/dev/null
playwright-cli click "#btn-undo" >/dev/null
sleep 0.3
check "E2 撤销一次即移除该端子（一步撤销）" "0" "$(ev 'String(window.__ex.pinsOf("n-ct").length)')"
playwright-cli click "#btn-redo" >/dev/null
sleep 0.3
check "E2 重做恢复该端子" '["T-1"]' "$(ev 'JSON.stringify(window.__ex.pinsOf("n-ct").map((p) => p.id))')"

read -r TPX TPY <<EOF
$(pinctr n-ct T-1)
EOF
read -r RBX RBY <<EOF
$(ctr n-breaker)
EOF
drag "$TPX" "$TPY" "$RBX" "$RBY"
check "E2 从端子拉线成功（选择框不再挡）" "1" "$(ev 'String(window.__ex.edgeCount())')"
check "E2 连线起点绑定到端子" "T-1" "$(ev 'String((window.__ex.sourcePortOfEdge(0) || {}).source.port)')"

# 拖调色板端子到主变
read -r PLX PLY <<EOF
$(ev '(() => { const c = window.__ex.paletteItemCenter("tpl-terminal"); return Math.round(c.x) + " " + Math.round(c.y); })()')
EOF
read -r TRX TRY <<EOF
$(xy n-transformer 0.25)
EOF
drag "$PLX" "$PLY" "$TRX" "$TRY"
check "E2 拖端子模板到主变 → 生成端子" "1" "$(ev 'String(window.__ex.pinsOf("n-transformer").length)')"
check "E2 端子模板未落地成元件" "3" "$(ev 'String(window.__ex.nodeCount())')"
check "E2 拖拽生成的端子也贴轮廓（≤3px）" "true" "$(ev '
(() => {
  const p = window.__ex.pinsOf("n-transformer")[0].args;
  return String(window.__ex.outlineDistance("n-transformer", p.x, p.y) <= 3);
})()')"

# 导出 / 导入往返
STATE_BEFORE="$(ev 'window.__ex.pinState()')"
ev 'window.__ex.exportJSON()' >/dev/null
check "E2 导出 JSON 含端子数据" "true" "$(ev '
(() => {
  const s = JSON.parse(window.__ex.exportJSON());
  const n = s.graph.cells.find((c) => c.id === "n-transformer");
  return String(!!(n && n.ports && n.ports.items.length === 1));
})()')"
ev 'window.__ex.graph.clearCells()' >/dev/null
check "E2 清空整图" "0" "$(ev 'String(window.__ex.nodeCount())')"
check "E2 导入成功" "true" "$(ev 'String(window.__ex.importJSON() === true)')"
check "E2 往返后状态完全一致" "$STATE_BEFORE" "$(ev 'window.__ex.pinState()')"
check "E2 无页面报错" "0" "$(ev 'String((window.__errors || []).length)')"

echo
echo "=== summary: ${PASS} passed, ${FAIL} failed ==="
exit $(( FAIL > 0 ? 1 : 0 ))
