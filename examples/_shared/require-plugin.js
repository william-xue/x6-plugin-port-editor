// 依赖没装上时的提示 —— 例子是**独立项目**，依赖要从 GitHub 装一次。
// 放在插件脚本之后、app.js 之前：拿不到就挡住页面并直接告诉使用者该敲什么命令。
;(function () {
  var missing = []
  if (typeof window.X6 !== 'object' || !window.X6.Graph) missing.push('@antv/x6')
  if (typeof window.X6PluginPortEditor !== 'object') missing.push('x6-plugin-port-editor')
  if (missing.length === 0) return

  var box = document.createElement('div')
  box.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:99999',
    'background:#fafbfc',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'padding:24px',
    'font:14px/1.9 -apple-system,"PingFang SC",Arial,sans-serif',
    'color:#1f1f1f',
  ].join(';')

  box.innerHTML = [
    '<div style="max-width:640px">',
    '<h2 style="margin:0 0 10px;font-size:17px">页面没拿到 ' + missing.join(' 和 ') + '</h2>',
    '<p style="color:#666;margin:0 0 12px">',
    '例子是<b>独立项目</b>：它的依赖不是仓库自带的构建产物，而是<b>从 GitHub 装进来的包</b>。',
    '先装一次：</p>',
    '<pre style="background:#fff;border:1px solid #e6e8eb;border-radius:6px;padding:12px 14px;white-space:pre-wrap;font:12.5px/1.7 ui-monospace,Menlo,monospace">cd examples\nnpm install          # 从 github:william-xue/x6-plugin-port-editor 装插件</pre>',
    '<p style="color:#666;margin:12px 0 0">然后回仓库根目录起静态服务：<code>npm run demo</code>，再刷新本页。</p>',
    '<p style="color:#8a94a6;margin:14px 0 0;font-size:12.5px">',
    '（如果只想看仓库自带构建的效果：<code>npm run build</code> 生成 <code>dist/</code>，demo/ 目录用的就是它。）',
    '</p>',
    '</div>',
  ].join('')

  document.body.appendChild(box)
})()