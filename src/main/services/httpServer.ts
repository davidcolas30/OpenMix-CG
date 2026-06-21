/**
 * httpServer.ts — Servidor HTTPS que sirve la página del cliente móvil.
 *
 * ¿Por qué un servidor HTTPS embebido?
 * 1. El móvil necesita abrir una página web para capturar su cámara
 * 2. getUserMedia() requiere contexto seguro (HTTPS)
 * 3. El servidor corre dentro del proceso Main de Electron
 * 4. Sirve archivos estáticos desde la carpeta src/mobile/
 *
 * El mismo servidor HTTPS se comparte con el WebSocket de señalización.
 * Así, ambos usan el mismo puerto y certificado TLS.
 *
 * Ruta de la página móvil: https://<IP>:<PORT>/cam?token=<TOKEN>
 */

import https from 'https'
import fs from 'fs'
import path from 'path'
import { IncomingMessage, ServerResponse } from 'http'
import type { TlsCert } from './certService'

let server: https.Server | null = null
let serverPort = 0

/** Tipos MIME para archivos estáticos */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
}

/**
 * Inicia el servidor HTTPS.
 *
 * Devuelve una Promise que se resuelve cuando el servidor está
 * realmente escuchando. Esto es importante porque listen() es
 * asíncrono — si no esperamos, getServerPort() devolvería 0.
 *
 * @param cert Certificado TLS autofirmado
 * @param port Puerto deseado (0 para automático)
 * @returns El servidor HTTPS (para compartir con WebSocket) y el puerto asignado
 */
export function startHttpServer(
  cert: TlsCert,
  port: number = 9000
): Promise<{ server: https.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const httpsServer = https.createServer(
      { key: cert.key, cert: cert.cert },
      handleRequest
    )

    // Capturar errores de listen (ej: puerto ocupado)
    httpsServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[HttpServer] Puerto ${port} ocupado, probando otro...`)
        // Reintentar con puerto 0 (el SO asigna uno libre)
        httpsServer.listen(0, '0.0.0.0')
      } else {
        reject(err)
      }
    })

    httpsServer.listen(port, '0.0.0.0', () => {
      const addr = httpsServer.address()
      serverPort = typeof addr === 'object' && addr ? addr.port : port
      server = httpsServer
      console.log(`[HttpServer] Servidor HTTPS escuchando en puerto ${serverPort}`)
      resolve({ server: httpsServer, port: serverPort })
    })
  })
}

/**
 * Detiene el servidor HTTPS.
 */
export function stopHttpServer(): void {
  if (server) {
    server.close()
    server = null
    console.log('[HttpServer] Servidor HTTPS detenido')
  }
}

/**
 * Devuelve el puerto en el que escucha el servidor.
 */
export function getServerPort(): number {
  return serverPort
}

/**
 * Manejador de peticiones HTTP.
 *
 * Rutas:
 * - /cam → sirve index.html del cliente móvil
 * - /cam/* → sirve archivos estáticos de la carpeta mobile/
 * - /health → comprobación de salud del servidor
 * - Todo lo demás → 404
 */
function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', `https://localhost`)

  // Cabeceras de seguridad básicas
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('OK')
    return
  }

  // Rutas /cam y /cam/*: servir archivos del cliente móvil
  if (url.pathname === '/cam' || url.pathname === '/cam/') {
    serveFile('index.html', res)
    return
  }

  if (url.pathname.startsWith('/cam/')) {
    // Extraer nombre del archivo (quitar /cam/ del principio)
    const fileName = url.pathname.slice(5) // "/cam/camera.js" → "camera.js"
    serveFile(fileName, res)
    return
  }

  // 404 para cualquier otra ruta
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
}

/**
 * Sirve un archivo estático de la carpeta mobile/.
 *
 * Busca el archivo en dos ubicaciones:
 * 1. En desarrollo: src/mobile/ (código fuente)
 * 2. En producción: resources/mobile/ (copiado por electron-builder)
 *
 * Valida el path para evitar directory traversal (security).
 */
function serveFile(fileName: string, res: ServerResponse): void {
  // Sanitizar el nombre: no permitir traversal (../ o rutas absolutas)
  const normalized = path.normalize(fileName).replace(/^(\.\.(\/|\\|$))+/, '')
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' })
    res.end('Forbidden')
    return
  }

  // Buscar en src/mobile/ (desarrollo) o resources/mobile/ (producción)
  const devPath = path.join(__dirname, '../../src/mobile', normalized)
  const prodPath = path.join(process.resourcesPath || '', 'mobile', normalized)

  const filePath = fs.existsSync(devPath) ? devPath : prodPath

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end(`File not found: ${normalized}`)
    return
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] || 'application/octet-stream'

  try {
    const content = fs.readFileSync(filePath)
    // no-store: en desarrollo iteramos mucho sobre el cliente móvil.
    // Safari y otros navegadores móviles tienden a cachear HTML/JS,
    // lo que hace que una prueba ejecute código antiguo sin que se vea.
    // Desactivar caché evita falsos negativos al depurar WebRTC.
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    })
    res.end(content)
  } catch (err) {
    console.error(`[HttpServer] Error leyendo ${filePath}:`, err)
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('Internal server error')
  }
}
