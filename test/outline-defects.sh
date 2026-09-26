#!/usr/bin/env bash
# 轮廓缺陷门禁：把"今天发现的问题"钉成断言，防止改回去。
#
#   bash test/outline-defects.sh        （npm run test:outline）
#
# 判据都落在**节点本地坐标**上，全部由真实 Chrome + 真实 X6 跑出来。
# 每条断言旁边注明"为什么是这个数"，数字不是抄跑出来的，是能算出来的。
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.nvm/versions/node/v24.14.0/bin:${PATH}"

PORT="${PORT:-8743}"
PASS=0
FAIL=0

ev() {
  # 真实浏览器偶尔会忙到让 eval 超时，此时 playwright-cli 会打印 usage 文本。
  # 这是会话抖动、不是断言结果 —— 认出它并重试，避免门禁假红。
  local attempt out
  for attempt in 1 2 3; do
    out="$(playwright-cli --raw eval "$1" 2>/dev/null | tail -1 | python3 -c '
import sys, json
s = sys.stdin.read().strip()
try:
    v = json.loads(s)
except Exception:
    v = s
print(v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
')"
    case "$out" in
      ""|*"playwright-cli"*"params"*) sleep 0.4 ;;
      *) printf '%s' "$out"; return 0 ;;
    esac
  done
  printf '%s' "$out"
}

check() { # name expected actual
  if [ "$2" = "$3" ]; then
    PASS=$((PASS + 1)); printf 'PASS  %-56s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL  %-56s expected=%s actual=%s\n' "$1" "$2" "$3"
  fi
}

check_near() { # name expected actual tolerance
  local diff
  diff="$(python3 -c "print(abs($2 - $3) <= $4)")"
  if [ "$diff" = "True" ]; then
    PASS=$((PASS + 1)); printf 'PASS  %-56s %s\n' "$1" "$3"
  else
    FAIL=$((FAIL + 1)); printf 'FAIL  %-56s expected≈%s actual=%s (tol %s)\n' "$1" "$2" "$3" "$4"
  fi
}

# 元素列表：几何元素个数 + 标签
elements_of() { # nodeId
  ev "(() => { const r = window.__cases.hit('$1', 0, 0); return r.elements + ':' + (r.tags || []).join(','); })()"
}

# 落点离查询点的距离（节点本地坐标，保留 2 位）
hit_distance() { # nodeId lx ly
  ev "(() => { const r = window.__cases.hit('$1', $2, $3); return r.hit === null ? 'none' : r.hit.distance.toFixed(2); })()"
}

# 落点坐标
hit_point() { # nodeId lx ly
  ev "(() => { const r = window.__cases.hit('$1', $2, $3); return r.hit === null ? 'none' : r.hit.lx.toFixed(2) + ',' + r.hit.ly.toFixed(2); })()"
}

echo "=== 轮廓缺陷门禁（真实 Chrome + 真实 X6，端口 ${PORT}）==="

node scripts/serve.mjs "$PORT" >/tmp/x6pe-defects-serve.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; playwright-cli close >/dev/null 2>&1 || true' EXIT
sleep 1

if ! curl -sf "http://127.0.0.1:${PORT}/test/defect-cases/index.html" >/dev/null; then
  echo "服务没起来"; cat /tmp/x6pe-defects-serve.log; exit 1
fi

playwright-cli open --browser=chrome "http://127.0.0.1:${PORT}/test/defect-cases/index.html" >/dev/null
sleep 1.5

if [ "$(ev 'String(!!window.__cases)')" != "true" ]; then
  echo "案例页没初始化 —— console 尾部："
  playwright-cli console 2>&1 | tail -20
  exit 1
fi

# ---------- ① <line> 必须在轮廓白名单里 ----------
# 缺陷形态：GEOMETRY_SELECTOR 不含 line → 收集到 0 个元素 → 整个节点放不了引脚
check "① <line> 被当作轮廓收集（元素数:标签）" "1:line" "$(elements_of c-line)"
check_near "① <line> 线上一点 (100,30) 落点距离" "0" "$(hit_distance c-line 100 30)" "0.01"
check_near "① <line> 线上一点 (30,30) 落点距离" "0" "$(hit_distance c-line 30 30)" "0.01"
check "① <line> 落点就是线上那一点" "100.00,30.00" "$(hit_point c-line 100 30)"

# ---------- ② 开放折线：数组首尾不能取模相连 ----------
# 缺陷形态：封口线（末点 180,120 → 首点 20,20）真实存在，贴着首点问会落在它上面
# 正确值：贴首点 (21,21) 时，到真实上边 y=20 的距离 = 1.00
check_near "② 贴首点 (21,21) 落在真实上边上（不是封口线）" "1.00" "$(hit_distance c-polyline 21 21)" "0.15"
check_near "② 贴末点 (179,119) 距离" "1.00" "$(hit_distance c-polyline 179 119)" "0.15"
check_near "② 封口线中点 (100,70) 距离（到真实上边 50）" "50.00" "$(hit_distance c-polyline 100 70)" "0.15"
check_near "② 真实上边 (100,20) 仍然 0（没误伤）" "0" "$(hit_distance c-polyline 100 20)" "0.01"
check_near "② 真实右边 (180,70) 仍然 0（没误伤）" "0" "$(hit_distance c-polyline 180 70)" "0.01"

# ---------- ③ 多子路径：跨子路径的连线不能存在 ----------
# 缺陷形态：外环末点(20,20) → 孔洞首点(60,50) 那条对角线（以及数组回绕）真实存在
# 正确值：贴缺口起点 (21,21) → 真实左边 x=20，距离 1.00
#         贴孔洞首点 (58,48) → 孔洞角 (60,50)，距离 √(2²+2²)=2.83
check_near "③ 贴缺口起点 (21,21) 落在真实边上" "1.00" "$(hit_distance c-holed 21 21)" "0.15"
check_near "③ 贴孔洞首点 (58,48) 落在孔洞角上" "2.83" "$(hit_distance c-holed 58 48)" "0.15"
check_near "③ 缺口中点 (40,35) 距离（到真实上边 15）" "15.00" "$(hit_distance c-holed 40 35)" "0.15"
check_near "③ 真实外框上边 (100,20) 仍然 0（没误伤）" "0" "$(hit_distance c-holed 100 20)" "0.01"
check_near "③ 真实孔洞内壁 (60,70) 仍然 0（没误伤）" "0" "$(hit_distance c-holed 60 70)" "0.01"

# ---------- ④ visibility:hidden 的形状（已知行为，尚未处理）----------
# 这条**不是**"修好了"，是记账：看不见的形状仍然参与落点（有尺寸就算候选）。
# 为什么不改：透明矩形当"命中区"是常见做法，一刀切会把这类用法弄坏 ——
# 该不该处理属于设计取舍，留给维护者拍板。
check "④ 已知行为：visibility:hidden 仍然参与（2 个 rect）" "2:rect,rect" "$(elements_of c-hidden)"
check_near "④ 已知行为：隐藏形状的边仍然距离 0" "0" "$(hit_distance c-hidden 100 40)" "0.01"

# ---------- ⑤ 长周长矩形的拐角（本次修好：均匀采样削角）----------
# 周长 1580 → 采样步长 1580/240 ≈ 6.58，拐角不落在采样点上就会被折线抄近路削掉。
# 修复前：(590,0) 与 (0,200) 偏 **2.13**（已经超过本仓 e2e 自己用的 2px 容差），
#         另外两个拐角碰巧落在采样点上、偏 0。
# 修复后：四个拐角都落在真实拐角上。
check_near "⑤ 拐角 (590,0) 落在真实拐角上" "0" "$(hit_distance c-corner 590 0)" "0.05"
check_near "⑤ 拐角 (0,200) 落在真实拐角上" "0" "$(hit_distance c-corner 0 200)" "0.05"
check_near "⑤ 拐角 (590,200) 也是 0（本来就在采样点上）" "0" "$(hit_distance c-corner 590 200)" "0.01"
check_near "⑤ 修拐角没误伤直边：上边中点仍然 0" "0" "$(hit_distance c-corner 295 0)" "0.01"

# ---------- 控制台 ----------
check "无页面报错" "0" "$(ev 'String((window.__errors || []).length)')"

echo
echo "=== summary: ${PASS} passed, ${FAIL} failed ==="
exit $(( FAIL > 0 ? 1 : 0 ))
