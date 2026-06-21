import { describe, it, expect } from 'vitest'
import { ipcOk, ipcError } from './contracts'

describe('IPC contracts', () => {
  it('ipcOk crea un resultado exitoso con los datos proporcionados', () => {
    const result = ipcOk({ sourceId: 'cam-1' })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.sourceId).toBe('cam-1')
    }
  })

  it('ipcError crea un resultado de error con código y mensaje', () => {
    const result = ipcError('NOT_FOUND', 'Fuente no encontrada')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND')
      expect(result.error.message).toBe('Fuente no encontrada')
    }
  })
})
