/**
 * QRCodePanel — Panel para conectar cámaras móviles via QR.
 *
 * Genera un código QR que el operador de cámara escanea con su móvil.
 * El QR contiene una URL HTTPS que abre la página del cliente móvil
 * con un token único de autenticación.
 *
 * Flujo:
 * 1. El realizador pulsa "Añadir Cámara"
 * 2. Se genera un token en el Main process
 * 3. Se muestra el QR con la URL
 * 4. El operador escanea con su móvil
 * 5. El móvil abre la página y empieza a transmitir
 * 6. El peer aparece en la lista con su estado
 */

import { useState, useEffect, useCallback } from 'react'
import QRCode from 'qrcode'

/** Información de un peer conectado */
interface PeerInfo {
  peerId: string
  state: string
}

/** Resultado de crear un token */
interface TokenResult {
  ok: boolean
  data?: { peerId: string; token: string; url: string }
}

export default function QRCodePanel(): React.JSX.Element {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrPeerId, setQrPeerId] = useState<string | null>(null)
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [isQrVisible, setIsQrVisible] = useState(false)

  const hasQrAvailable = Boolean(qrUrl && qrDataUrl)

  /**
   * Generar un nuevo token y mostrar el QR.
   *
   * Llama al Main process para crear un token de conexión,
   * recibe la URL y genera el QR con la librería qrcode en el Renderer.
   * qrcode.toDataURL convierte la URL en una imagen PNG base64
   * que se muestra directamente en un <img>.
   */
  const handleAddCamera = useCallback(async () => {
    setLoading(true)
    try {
      const result = (await window.openMix.sources.createToken()) as TokenResult
      if (result.ok && result.data) {
        setQrUrl(result.data.url)
        setQrPeerId(result.data.peerId)
        // Generar QR como data URL PNG usando la librería qrcode
        const dataUrl = await QRCode.toDataURL(result.data.url, {
          width: 200,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        })
        setQrDataUrl(dataUrl)
        setIsQrVisible(true)
      }
    } catch (err) {
      console.error('Error creando token:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Carga inicial de peers.
   *
   * Antes esta vista hacia polling cada 2 segundos aunque ya existiera la
   * suscripcion `sources:onPeerState`. En una aplicacion de video en directo,
   * cualquier temporizador periodico que cruce IPC durante la realizacion se
   * convierte en ruido dificil de distinguir de un microtiron real, asi que
   * dejamos el polling fuera del camino normal y usamos eventos para cambios
   * posteriores.
   */
  useEffect(() => {
    const fetchPeers = async (): Promise<void> => {
      try {
        const result = (await window.openMix.sources.list()) as {
          ok: boolean
          data?: PeerInfo[]
        }
        if (result.ok && result.data) {
          setPeers(result.data)
        }
      } catch {
        // Ignorar errores de polling
      }
    }

    void fetchPeers()
  }, [])

  /** Suscribirse a eventos de estado de peers */
  useEffect(() => {
    const unsubscribe = window.openMix.sources.onPeerState((event) => {
      setPeers((prev) => {
        const existing = prev.find((p) => p.peerId === event.peerId)
        if (existing) {
          return prev.map((p) => (p.peerId === event.peerId ? { ...p, state: event.state } : p))
        }
        return [...prev, { peerId: event.peerId, state: event.state }]
      })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!qrPeerId) {
      return
    }

    const qrPeer = peers.find((peer) => peer.peerId === qrPeerId)
    if (!qrPeer || qrPeer.state === 'waiting') {
      return
    }

    // Un token QR es de un solo uso. En cuanto el móvil se autentica con ese
    // peer, retiramos el QR de la interfaz para evitar que "Mostrar QR" enseñe
    // un código viejo cuando el operador quiere añadir otra cámara.
    const timeoutId = window.setTimeout(() => {
      setQrUrl(null)
      setQrDataUrl(null)
      setQrPeerId(null)
      setIsQrVisible(false)
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [peers, qrPeerId])

  /** Eliminar un peer */
  const handleRemovePeer = useCallback(async (peerId: string) => {
    try {
      await window.openMix.sources.removePeer(peerId)
      setPeers((prev) => prev.filter((p) => p.peerId !== peerId))
    } catch (err) {
      console.error('Error eliminando peer:', err)
    }
  }, [])

  return (
    <div style={panelStyle}>
      <div style={actionsRowStyle}>
        <button
          className="openmix-control-button"
          type="button"
          onClick={handleAddCamera}
          disabled={loading}
          style={primaryButtonStyle(loading)}
        >
          {loading ? 'Generando...' : '＋ Añadir cámara'}
        </button>
        {hasQrAvailable && (
          <button
            className="openmix-control-button"
            type="button"
            onClick={() => setIsQrVisible((currentValue) => !currentValue)}
            style={ghostButtonStyle}
          >
            {isQrVisible ? 'Ocultar QR' : 'Mostrar QR'}
          </button>
        )}
      </div>

      {hasQrAvailable && isQrVisible && (
        <section style={qrCardShellStyle}>
          <div style={qrCardHeaderStyle}>
            <span style={qrCardEyebrowStyle}>Conexión rápida</span>
            <span style={qrCardMetaStyle}>Token activo</span>
          </div>

          <div style={qrCardStyle}>
            <div style={qrFrameStyle}>
              <img
                src={qrDataUrl!}
                alt="Código QR para conectar cámara móvil"
                style={qrImageStyle}
              />
            </div>
            <p style={qrHintStyle}>Escanea con la cámara del móvil</p>
          </div>
        </section>
      )}

      {hasQrAvailable && !isQrVisible && (
        <div style={qrCollapsedBannerStyle}>
          <span style={qrCollapsedTitleStyle}>QR pendiente oculto</span>
          <span style={qrCollapsedMetaStyle}>
            Muestra este QR o genera uno nuevo con Añadir cámara.
          </span>
        </div>
      )}

      {!hasQrAvailable && peers.length === 0 && (
        <div style={idleStateStyle}>
          <span style={idleTitleStyle}>Sin cámaras conectadas</span>
          <span style={idleMetaStyle}>Genera un QR para añadir la primera señal móvil.</span>
        </div>
      )}

      {peers.length > 0 && (
        <section style={peerSectionStyle}>
          <div style={peerHeaderStyle}>
            <span style={peerHeaderTitleStyle}>Cámaras ({peers.length})</span>
            <span style={peerHeaderMetaStyle}>Estado en vivo</span>
          </div>

          <div style={peerListStyle}>
            {peers.map((peer) => (
              <div key={peer.peerId} className="openmix-interactive-row" style={peerRowStyle}>
                <span style={peerInfoStyle}>
                  <span
                    style={{
                      ...peerDotStyle,
                      backgroundColor: stateColor(peer.state)
                    }}
                  />
                  <span style={peerIdStyle}>{peer.peerId}</span>
                </span>
                <button
                  className="openmix-control-button"
                  type="button"
                  onClick={() => handleRemovePeer(peer.peerId)}
                  style={removeButtonStyle}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const panelStyle: React.CSSProperties = {
  padding: 0,
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  overflowX: 'hidden',
  overflowY: 'auto'
}

const actionsRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: '8px',
  alignItems: 'center',
  flexShrink: 0,
  paddingBottom: '2px'
}

function primaryButtonStyle(isDisabled: boolean): React.CSSProperties {
  return {
    padding: '9px 12px',
    backgroundColor: isDisabled ? '#243844' : '#1f7c92',
    color: '#fff',
    border: '1px solid rgba(165, 243, 252, 0.18)',
    borderRadius: '7px',
    cursor: isDisabled ? 'default' : 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  }
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '7px',
  border: '1px solid rgba(124, 145, 173, 0.22)',
  backgroundColor: 'rgba(15, 23, 42, 0.42)',
  color: '#cbd5e1',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 600,
  whiteSpace: 'nowrap'
}

const qrCardShellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  flexShrink: 0,
  minHeight: 0
}

const qrCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px'
}

const qrCardEyebrowStyle: React.CSSProperties = {
  color: '#9fb7cf',
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em'
}

const qrCardMetaStyle: React.CSSProperties = {
  color: '#6ee7f0',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em'
}

const qrCardStyle: React.CSSProperties = {
  padding: '10px',
  backgroundColor: '#ffffff',
  borderRadius: '7px',
  textAlign: 'center',
  boxSizing: 'border-box',
  overflow: 'hidden',
  width: '100%',
  maxWidth: '216px',
  margin: '0 auto'
}

const qrFrameStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '184px',
  aspectRatio: '1 / 1',
  padding: '6px',
  margin: '0 auto',
  borderRadius: '7px',
  backgroundColor: '#ffffff',
  boxSizing: 'border-box'
}

const qrImageStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  borderRadius: '6px'
}

const qrHintStyle: React.CSSProperties = {
  fontSize: '11px',
  lineHeight: 1.35,
  color: '#334155',
  margin: '8px 0 0',
  wordBreak: 'normal'
}

const qrCollapsedBannerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '10px 12px',
  borderRadius: '7px',
  backgroundColor: 'rgba(7, 11, 18, 0.38)',
  border: '1px solid rgba(124, 145, 173, 0.12)',
  flexShrink: 0
}

const qrCollapsedTitleStyle: React.CSSProperties = {
  color: '#dbeafe',
  fontSize: '12px',
  fontWeight: 700
}

const qrCollapsedMetaStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  lineHeight: 1.35
}

const peerSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minHeight: 0,
  flex: '1 1 auto'
}

const peerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0
}

const peerHeaderTitleStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '1px',
  fontWeight: 700
}

const peerHeaderMetaStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '10px'
}

const peerListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  minHeight: 0,
  overflowY: 'auto',
  paddingRight: '2px'
}

const peerRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '7px 8px',
  backgroundColor: 'rgba(7, 11, 18, 0.38)',
  border: '1px solid rgba(124, 145, 173, 0.12)',
  borderRadius: '7px',
  fontSize: '12px'
}

const peerInfoStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minWidth: 0,
  flex: 1
}

const peerDotStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0
}

const peerIdStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}

const removeButtonStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.42)',
  border: '1px solid rgba(124, 145, 173, 0.18)',
  borderRadius: '5px',
  color: '#888',
  cursor: 'pointer',
  fontSize: '14px',
  padding: '1px 5px',
  flexShrink: 0
}

const idleStateStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: '12px',
  borderRadius: '7px',
  border: '1px dashed rgba(100, 116, 139, 0.32)',
  color: '#94a3b8',
  fontSize: '12px',
  lineHeight: 1.4
}

const idleTitleStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontWeight: 700
}

const idleMetaStyle: React.CSSProperties = {
  color: '#94a3b8'
}

/** Color del indicador de estado de un peer */
function stateColor(state: string): string {
  switch (state) {
    case 'waiting':
      return '#f59e0b' // amarillo
    case 'connected':
      return '#3b82f6' // azul
    case 'streaming':
      return '#22c55e' // verde
    case 'disconnected':
      return '#ef4444' // rojo
    default:
      return '#666'
  }
}
