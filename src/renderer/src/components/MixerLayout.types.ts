export type GraphicsPreviewBackground = 'black' | 'white'
export type WorkspaceView = 'mixer' | 'audio' | 'graphics' | 'options' | 'shortcuts'

export interface IpcErrorShape {
  message: string
}

export interface PanelSize {
  width: number
  height: number
}

export interface MultiviewResizeState {
  pointerId: number
  startY: number
  baseHeight: number
}

export interface SidebarResizeState {
  pointerId: number
  startX: number
  baseWidth: number
}

export interface SidebarSectionResizeState {
  pointerId: number
  target: 'graphics' | 'localVideo'
  startY: number
  baseGraphicsHeight: number
  baseLocalVideoHeight: number
}

export interface ViewTabIndicator {
  left: number
  width: number
  visible: boolean
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorShape }
