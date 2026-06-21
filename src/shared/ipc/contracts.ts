/**
 * Contratos IPC compartidos entre Main y Renderer.
 *
 * Definimos aquí los tipos de request/response que viajan por IPC.
 * Ambos procesos importan estos tipos, así que si uno cambia,
 * TypeScript avisa en compilación.
 *
 * IpcResult<T> es un patrón "Result" que fuerza al consumidor
 * a comprobar si la operación tuvo éxito antes de usar los datos.
 */

// ── Resultado genérico ──────────────────────────────────────

/** Códigos de error estandarizados para respuestas IPC. */
export type IpcErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'INTERNAL_ERROR'

/** Forma de un error IPC serializable. */
export interface IpcErrorShape {
  code: IpcErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * Tipo unión discriminada: toda respuesta IPC es Ok o Error.
 * El campo "ok" actúa como discriminador — TypeScript puede
 * estrechar el tipo automáticamente en un if/switch.
 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorShape }

// ── Helpers para crear resultados ───────────────────────────

/** Crea un resultado exitoso. */
export function ipcOk<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

/** Crea un resultado de error. */
export function ipcError<T>(code: IpcErrorCode, message: string): IpcResult<T> {
  return { ok: false, error: { code, message } }
}
