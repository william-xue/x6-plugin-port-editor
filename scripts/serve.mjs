// Zero-dependency static server for the demo: `node scripts/serve.mjs [port]`
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'

const port = Number(process.argv[2] || 8732)
const root = resolve(import.meta.dirname, '..')

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost')
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
    let file = join(root, rel)
    if (rel === '/' || rel.endsWith('/')) file = join(file, 'demo/index.html')
    if (file.includes('/node_modules/') === false && !extname(file)) file = join(file, 'index.html')

    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' })
    res.end(body)
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(`404 ${req.url}`)
  }
}).listen(port, () => {
  console.log(`x6-plugin-port-editor demo → http://127.0.0.1:${port}/demo/index.html`)
})
