import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerGraphicsHandlers } from './ipc/registerGraphicsHandlers'
import { registerMixerHandlers } from './ipc/registerMixerHandlers'
import { registerOutputHandlers } from './ipc/registerOutputHandlers'
import { registerShortcutHandlers } from './ipc/registerShortcutHandlers'
import { registerSourceHandlers, notifyPeerState } from './ipc/registerSourceHandlers'
import { generateSelfSignedCert } from './services/certService'
import { startElectronCpuMonitor, stopElectronCpuMonitor } from './services/cpuMonitorService'
import { disposeGraphicsService } from './services/graphicsService'
import { startHttpServer, stopHttpServer } from './services/httpServer'
import { stopMixer } from './services/mixerService'
import { stopRecordingIfActive } from './services/outputService'
import { startSignaling, stopSignaling } from './services/signalingService'
import {
  detachAllPeersBeforeMixerStop,
  handlePeerOffer,
  handlePeerIceCandidate,
  handlePeerDisconnected
} from './services/webrtcBridge'

const PRODUCT_NAME = 'OpenMix-CG'

// Fijamos el nombre antes de crear ventanas para que menús, Dock y metadatos
// de la app usen la marca del producto también durante el arranque en desarrollo.
app.setName(PRODUCT_NAME)

function shouldUseExternalMonitorSurfaces(): boolean {
  const rawMode = process.env.OPENMIX_BIG_MONITORS_SURFACE?.trim().toLowerCase()
  return rawMode === 'external' || rawMode === 'webview'
}

function shouldUseSoftwareOffscreenRendering(): boolean {
  const rawValue = process.env.OPENMIX_GRAPHICS_OFFSCREEN_RENDERER?.trim().toLowerCase()
  return rawValue === 'software' || rawValue === 'cpu'
}

function getPreloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

// Prueba de rendimiento: Electron permite que las BrowserWindow offscreen
// usen un modo de salida software al desactivar la aceleración GPU antes de
// app.ready. Lo dejamos detrás de una variable porque afecta a todo Chromium,
// no solo al motor de grafismo.
if (shouldUseSoftwareOffscreenRendering()) {
  app.disableHardwareAcceleration()
  console.info(
    '[Main] Chromium offscreen en modo software (OPENMIX_GRAPHICS_OFFSCREEN_RENDERER=software)'
  )
}

// El monitor PVW experimental conecta Chromium con GStreamer dentro de la
// misma aplicación. Chromium oculta candidatos host como nombres mDNS
// (*.local) por privacidad, pero libnice/GStreamer no siempre puede resolver
// esos nombres en una conexión local app-interna. Desactivarlo aquí evita que
// ICE quede atascado en "connecting" para este enlace de monitorización.
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')

let isQuitting = false
let servicesDisposed = false
let servicesDisposePromise: Promise<void> | null = null

async function disposeAppServices(): Promise<void> {
  if (servicesDisposePromise) {
    return servicesDisposePromise
  }

  servicesDisposePromise = (async () => {
    stopElectronCpuMonitor()

    try {
      await stopRecordingIfActive()
      detachAllPeersBeforeMixerStop()
      await stopMixer()
    } catch (error) {
      console.error('[Main] No se pudo detener el mixer durante el cierre:', error)
    }

    disposeGraphicsService()
    stopSignaling()
    stopHttpServer()
    servicesDisposed = true
  })()

  return servicesDisposePromise
}

function openMainWindow(): void {
  void createWindow().catch((error) => {
    console.error('[Main] No se pudo crear la ventana principal:', error)
    app.quit()
  })
}

async function createWindow(): Promise<void> {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    title: 'OpenMix-CG',
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      // Solo se habilita en el prototipo de monitores externos. Cada <webview>
      // vive en un guest renderer propio y recibe la señal WebRTC local sin
      // pasar frames por IPC ni cargar el Renderer principal de React.
      webviewTag: shouldUseExternalMonitorSurfaces()
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    if (!isQuitting) {
      app.quit()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (shouldUseExternalMonitorSurfaces()) {
    mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
      if (!params.src.startsWith('data:text/html')) {
        event.preventDefault()
        return
      }

      // El atributo preload del <webview> puede perderse o ser filtrado por
      // Chromium según el origen. Lo fijamos desde Main para que el guest
      // tenga la misma API segura window.openMix que el Renderer principal.
      webPreferences.preload = getPreloadPath()
      webPreferences.contextIsolation = true
      webPreferences.nodeIntegration = false
      webPreferences.sandbox = false
    })

    mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
      console.log(`[MonitorWebView] adjuntado id=${webContents.id}`)
      webContents.on('console-message', (_consoleEvent, level, message) => {
        console.log(`[MonitorWebView:${webContents.id}] console(${level}) ${message}`)
      })
      webContents.on('did-fail-load', (_loadEvent, errorCode, errorDescription) => {
        console.log(
          `[MonitorWebView:${webContents.id}] did-fail-load ${errorCode}: ${errorDescription}`
        )
      })
    })
  }

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Registrar handlers IPC del mixer
  // Conecta los comandos del Renderer (start/stop/cut/set-source) con el MixerService
  registerMixerHandlers(mainWindow)

  // ── Fase 3: Iniciar infraestructura WebRTC ──────────────
  // 1. Generar certificado TLS autofirmado (necesario para getUserMedia en el móvil)
  const cert = await generateSelfSignedCert()

  // 2. Iniciar servidor HTTPS (sirve la página del cliente móvil)
  // await: esperamos a que listen() complete para que getServerPort() funcione
  const { server: httpsServer } = await startHttpServer(cert, 9000)

  // 3. Iniciar servidor de señalización WebSocket sobre el mismo HTTPS
  startSignaling(cert, httpsServer, {
    onPeerJoined: (peerId) => {
      console.log(`[Main] Peer conectado: ${peerId}`)
      notifyPeerState(mainWindow, peerId, 'connected')
    },
    onOffer: (peerId, sdp) => {
      // Reenviar la SDP offer al webrtcbin de GStreamer via el bridge
      console.log(`[Main] SDP offer recibida de ${peerId} → creando webrtcbin`)
      handlePeerOffer(peerId, sdp)
      notifyPeerState(mainWindow, peerId, 'streaming')
    },
    onIceCandidate: (peerId, candidate) => {
      // Reenviar el ICE candidate al webrtcbin
      handlePeerIceCandidate(peerId, candidate)
    },
    onPeerDisconnected: (peerId) => {
      console.log(`[Main] Peer desconectado: ${peerId}`)
      handlePeerDisconnected(peerId)
      notifyPeerState(mainWindow, peerId, 'disconnected')
    }
  })

  // 4. Registrar handlers IPC de fuentes
  registerSourceHandlers(mainWindow)

  // 5. Registrar handlers IPC de grafismo (Fase 4)
  registerGraphicsHandlers()

  // 6. Registrar handlers IPC de output (Fase 5)
  registerOutputHandlers()

  // 7. Registrar handlers IPC de atajos configurables
  registerShortcutHandlers()
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('es.unizar.openmixcg')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  startElectronCpuMonitor()
  openMainWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (!isQuitting && !servicesDisposed && BrowserWindow.getAllWindows().length === 0) {
      openMainWindow()
    }
  })
})

app.on('before-quit', (event) => {
  isQuitting = true
  if (!servicesDisposed) {
    event.preventDefault()
    void disposeAppServices().finally(() => {
      app.quit()
    })
  }
})

app.on('window-all-closed', () => {
  // OpenMix-CG mantiene servidores, GStreamer y ventanas nativas ocultas.
  // En macOS no nos interesa el comportamiento estándar de quedarse vivo en
  // el Dock: al cerrar la ventana principal se cierra todo el sistema.
  void disposeAppServices().finally(() => {
    app.quit()
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
