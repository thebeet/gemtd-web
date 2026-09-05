import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupWSConnection } from 'y-websocket/bin/utils'
import { WebSocketServer } from 'ws'
import { handleGameConnection } from './game.ts'

const port = Number(process.env.PORT ?? 1234)
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(rootDir, 'dist')
const serveStatic = process.env.SERVE_STATIC !== '0' && fs.existsSync(distDir)

const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function contentTypeFor(filePath: string) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
}

function sendFile(res: http.ServerResponse, filePath: string, status = 200) {
  const stream = fs.createReadStream(filePath)
  res.writeHead(status, {
    'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    'Content-Type': contentTypeFor(filePath),
  })
  stream.pipe(res)
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500)
    res.end('Internal Server Error')
  })
}

function resolveStaticPath(urlPath: string) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] || '/')
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  const candidate = path.resolve(distDir, relative)
  if (!candidate.startsWith(distDir + path.sep) && candidate !== distDir) return null
  return candidate
}

function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!serveStatic) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('GemTD WebSocket server is running. Build the web app into dist/ to serve the UI from this port.')
    return
  }

  const urlPath = req.url || '/'
  if (urlPath.startsWith('/game-sync')) {
    res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Upgrade Required')
    return
  }

  const filePath = resolveStaticPath(urlPath)
  if (!filePath) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, filePath)
      return
    }
    const indexPath = path.join(distDir, 'index.html')
    fs.stat(indexPath, (indexError, indexStats) => {
      if (!indexError && indexStats.isFile()) {
        sendFile(res, indexPath)
        return
      }
      res.writeHead(404)
      res.end('Not Found')
    })
  })
}

const server = http.createServer(handleHttpRequest)
const wss = new WebSocketServer({ server })

wss.on('connection', (connection, request) => {
  if (request.url?.startsWith('/game-sync')) {
    handleGameConnection(connection, request)
    return
  }
  setupWSConnection(connection, request, { gc: true })
})

server.listen(port, () => {
  const mode = serveStatic ? 'web + websocket' : 'websocket only'
  console.log(`GemTD server (${mode}) listening on http://localhost:${port}`)
})
