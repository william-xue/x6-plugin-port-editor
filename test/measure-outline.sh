#!/usr/bin/env bash
# 轮廓缺陷测量：把今天在课程仓里发现的问题搬到真实 X6 上量数字。
# 只测量、不判红绿 —— 先看真实数字，再决定哪些算缺陷、正确值该是多少。
#
#   bash test/measure-outline.sh
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="${HOME}/.nvm/versions/node/v24.14.0/bin:${PATH}"

PORT="${PORT:-8741}"

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

# 在节点本地坐标 (lx, ly) 处问插件"最近轮廓点在哪"
probe() { # nodeId lx ly
  ev "(() => { const r = window.__cases.hit('$1', $2, $3); return JSON.stringify(r); })()"
}

# 打印一行：案例 / 元素数 / 元素标签 / 落点本地坐标 / 离查询点的距离
row() { # label nodeId lx ly
  local out
  out="$(probe "$2" "$3" "$4")"
  printf '%s' "$out" | python3 -c '
import sys, json
label, qx, qy = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
try:
    d = json.loads(sys.stdin.read())
except Exception:
    print("  %-46s 解析失败" % label); raise SystemExit
tags = ",".join(d.get("tags") or []) or "（无）"
h = d.get("hit")
if not h:
    print("  %-46s 元素=%-1s [%s]  落点=**无**" % (label, d.get("elements"), tags))
    raise SystemExit
print("  %-46s 元素=%s [%s]  落点=(%.2f, %.2f)  离查询点 %.2f  <%s>"
      % (label, d.get("elements"), tags, h["lx"], h["ly"], h["distance"], h["tag"]))
' "$1" "$3" "$4"
}

echo "=== 轮廓缺陷测量（真实 Chrome + 真实 X6 3.1.x）==="
echo

node scripts/serve.mjs "$PORT" >/tmp/x6pe-measure-serve.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; playwright-cli close >/dev/null 2>&1 || true' EXIT
sleep 1

if ! curl -sf "http://127.0.0.1:${PORT}/test/defect-cases/index.html" >/dev/null; then
  echo "服务没起来"; cat /tmp/x6pe-measure-serve.log; exit 1
fi

playwright-cli open --browser=chrome "http://127.0.0.1:${PORT}/test/defect-cases/index.html" >/dev/null
sleep 1.5

if [ "$(ev 'String(!!window.__cases)')" != "true" ]; then
  echo "案例页没初始化 —— console 尾部："
  playwright-cli console 2>&1 | tail -20
  exit 1
fi

echo "--- ① <line> 当轮廓：白名单 GEOMETRY_SELECTOR 里有 line 吗 ---"
row "c-line 线上一点 (100,30)"        c-line     100 30
row "c-line 线上一点 (30,30)"         c-line     30  30
echo

echo "--- ② 开放折线：首尾取模连起来，会不会多一段封口线 ---"
row "c-polyline 真实上边 (100,20)"     c-polyline 100 20
row "c-polyline 真实右边 (180,70)"     c-polyline 180 70
row "封口对角线中点 (100,70)"           c-polyline 100 70
row "封口对角线 1/4 处 (60,45)"         c-polyline 60  45
echo "  封口线 = 末点(180,120) → 首点(20,20)；贴着首尾两点问才可能够到"
row "★ 紧贴首点 (21,21)"               c-polyline 21  21
row "★ 紧贴末点 (179,119)"             c-polyline 179 119
row "★ 紧贴末点 (178,118)"             c-polyline 178 118
echo

echo "--- ③ 两个子路径的 path：交界处（外环末点→孔洞首点）会不会多一段 ---"
row "c-holed 外框上边 (100,20)"        c-holed    100 20
row "c-holed 孔洞内壁 (60,70)"         c-holed    60  70
row "缺口对角线中点 (40,35)"            c-holed    40  35
row "缺口对角线 1/4 处 (30,27.5)"       c-holed    30  27.5
echo "  ↑ 缺口 = 外环末点(20,20) → 孔洞首点(60,50) 那条对角线"
echo "  ↓ 贴着缺口的两个端点问（采样点稀疏的地方才够得到缺口）"
row "★ 紧贴缺口起点 (21,21)"            c-holed    21  21
row "★ 紧贴缺口起点 (22,23)"            c-holed    22  23
row "★ 紧贴缺口起点 (23,25)"            c-holed    23  25
row "★ 紧贴孔洞首点 (58,48)"            c-holed    58  48
row "★ 缺口正中但离环 5 以内 (40,30)"     c-holed    40  30
echo

echo "--- ④ visibility:hidden 的形状（有尺寸、看不见）---"
row "c-hidden 可见矩形上边 (100,20)"    c-hidden   100 20
row "★ 隐藏矩形上边 (100,40)"           c-hidden   100 40
row "★ 隐藏矩形左边 (40,70)"            c-hidden   40  70
echo

echo "--- ⑤ 长周长矩形的四个拐角（周长 1580，采样步长 ≈ 6.58）---"
row "c-corner 右上角 (590,0)"          c-corner   590 0
row "c-corner 右下角 (590,200)"        c-corner   590 200
row "c-corner 左下角 (0,200)"          c-corner   0   200
row "c-corner 左上角 (0,0)"            c-corner   0   0
row "c-corner 上边中点 (295,0)"         c-corner   295 0
echo

echo "--- 页面报错 ---"
echo "  $(ev 'String((window.__errors || []).length)') 条：$(ev 'JSON.stringify(window.__errors || [])')"
