import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import { __testing, createConnectionToken, stopSignaling } from './signalingService'

function createFakeWebSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket
}

describe('signalingService hardening', () => {
  beforeEach(() => {
    stopSignaling()
  })

  it('acepta una conexion WebSocket same-origin sobre HTTPS en red local', () => {
    const result = __testing.validateConnectionRequest(
      'https://192.168.1.20:9000',
      '192.168.1.20:9000',
      '::ffff:192.168.1.33'
    )

    expect(result).toBeNull()
  })

  it('rechaza una conexion WebSocket si la IP remota no es local', () => {
    const result = __testing.validateConnectionRequest(
      'https://192.168.1.20:9000',
      '192.168.1.20:9000',
      '8.8.8.8'
    )

    expect(result).toMatchObject({ code: 'NON_LOCAL_NETWORK', closeCode: 4003 })
  })

  it('rechaza una conexion WebSocket con Origin distinto al Host servido por la app', () => {
    const result = __testing.validateConnectionRequest(
      'https://evil.example',
      '192.168.1.20:9000',
      '192.168.1.44'
    )

    expect(result).toMatchObject({ code: 'FORBIDDEN_ORIGIN', closeCode: 4004 })
  })

  it('rechaza el join cuando el token ya ha expirado', () => {
    const { token } = createConnectionToken()
    const ws = createFakeWebSocket()

    const result = __testing.handleJoin(
      ws,
      { type: 'join', token },
      Date.now() + __testing.TOKEN_TTL_MS + 1
    )

    expect(result).toBeNull()
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'error',
        code: 'INVALID_TOKEN',
        message: 'Token no válido o expirado',
      })
    )
    expect(ws.close).toHaveBeenCalledWith(4001, 'Token invalido')
  })

  it('acepta el join cuando el token sigue vigente', () => {
    const { peerId, token } = createConnectionToken()
    const ws = createFakeWebSocket()

    const result = __testing.handleJoin(ws, { type: 'join', token })

    expect(result).toBe(peerId)
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: 'welcome',
        peerId,
        config: {
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
          iceTransportPolicy: 'all',
        },
      })
    )
  })
})