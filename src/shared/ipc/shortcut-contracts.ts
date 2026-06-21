/**
 * Tipos IPC para atajos de teclado configurables.
 *
 * Los atajos son plano de control: describen intenciones del operador y se
 * traducen en llamadas a APIs existentes del mixer, grafismo o fuentes.
 */

export type KeyboardShortcutGroup = 'mixer' | 'preview' | 'graphics' | 'local-video'

export type KeyboardShortcutActionId =
  | 'mixer.cut'
  | 'mixer.auto'
  | 'preview.source.0'
  | 'preview.source.1'
  | 'preview.source.2'
  | 'preview.source.3'
  | 'graphics.show-selected'
  | 'graphics.hide-selected'
  | 'local-video.toggle-preview'
  | 'local-video.restart-preview'

export interface KeyboardShortcutActionDefinition {
  id: KeyboardShortcutActionId
  group: KeyboardShortcutGroup
  label: string
  description: string
}

export interface KeyboardShortcutAccelerator {
  code: string
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export interface KeyboardShortcutBinding {
  actionId: KeyboardShortcutActionId
  accelerator: KeyboardShortcutAccelerator | null
  enabled: boolean
}

export interface KeyboardShortcutSettings {
  schemaVersion: 1
  updatedAt: string
  bindings: KeyboardShortcutBinding[]
}

export interface UpdateKeyboardShortcutBindingRequest {
  actionId: KeyboardShortcutActionId
  accelerator: KeyboardShortcutAccelerator | null
  enabled?: boolean
}

export const KEYBOARD_SHORTCUT_ACTIONS: readonly KeyboardShortcutActionDefinition[] = [
  {
    id: 'mixer.cut',
    group: 'mixer',
    label: 'CUT',
    description: 'Intercambia Preview y Program.'
  },
  {
    id: 'mixer.auto',
    group: 'mixer',
    label: 'AUTO',
    description: 'Lanza la transición seleccionada hacia Program.'
  },
  {
    id: 'preview.source.0',
    group: 'preview',
    label: 'Fuente 1 a Preview',
    description: 'Preselecciona la fuente 1 en Preview.'
  },
  {
    id: 'preview.source.1',
    group: 'preview',
    label: 'Fuente 2 a Preview',
    description: 'Preselecciona la fuente 2 en Preview.'
  },
  {
    id: 'preview.source.2',
    group: 'preview',
    label: 'Fuente 3 a Preview',
    description: 'Preselecciona la fuente 3 en Preview.'
  },
  {
    id: 'preview.source.3',
    group: 'preview',
    label: 'Fuente 4 a Preview',
    description: 'Preselecciona la fuente 4 en Preview.'
  },
  {
    id: 'graphics.show-selected',
    group: 'graphics',
    label: 'Mostrar grafismo seleccionado',
    description: 'Activa el grafismo actualmente seleccionado.'
  },
  {
    id: 'graphics.hide-selected',
    group: 'graphics',
    label: 'Ocultar grafismo seleccionado',
    description: 'Oculta el grafismo actualmente seleccionado.'
  },
  {
    id: 'local-video.toggle-preview',
    group: 'local-video',
    label: 'Play/Pause video en Preview',
    description: 'Alterna reproducción del video local cargado en Preview.'
  },
  {
    id: 'local-video.restart-preview',
    group: 'local-video',
    label: 'Reiniciar video en Preview',
    description: 'Vuelve al inicio del video local cargado en Preview.'
  }
] as const

export const DEFAULT_KEYBOARD_SHORTCUT_BINDINGS: readonly KeyboardShortcutBinding[] = [
  {
    actionId: 'mixer.cut',
    accelerator: createKeyboardShortcutAccelerator('Space', ' ', {}),
    enabled: true
  },
  {
    actionId: 'mixer.auto',
    accelerator: createKeyboardShortcutAccelerator('Enter', 'Enter', {}),
    enabled: true
  },
  {
    actionId: 'preview.source.0',
    accelerator: createKeyboardShortcutAccelerator('Digit1', '1', {}),
    enabled: true
  },
  {
    actionId: 'preview.source.1',
    accelerator: createKeyboardShortcutAccelerator('Digit2', '2', {}),
    enabled: true
  },
  {
    actionId: 'preview.source.2',
    accelerator: createKeyboardShortcutAccelerator('Digit3', '3', {}),
    enabled: true
  },
  {
    actionId: 'preview.source.3',
    accelerator: createKeyboardShortcutAccelerator('Digit4', '4', {}),
    enabled: true
  },
  {
    actionId: 'graphics.show-selected',
    accelerator: createKeyboardShortcutAccelerator('KeyG', 'g', {}),
    enabled: true
  },
  {
    actionId: 'graphics.hide-selected',
    accelerator: createKeyboardShortcutAccelerator('KeyG', 'G', { shiftKey: true }),
    enabled: true
  },
  {
    actionId: 'local-video.toggle-preview',
    accelerator: createKeyboardShortcutAccelerator('KeyP', 'p', {}),
    enabled: true
  },
  {
    actionId: 'local-video.restart-preview',
    accelerator: createKeyboardShortcutAccelerator('KeyR', 'r', {}),
    enabled: true
  }
] as const

export function createDefaultKeyboardShortcutSettings(): KeyboardShortcutSettings {
  return {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    bindings: DEFAULT_KEYBOARD_SHORTCUT_BINDINGS.map((binding) => ({
      ...binding,
      accelerator: binding.accelerator ? { ...binding.accelerator } : null
    }))
  }
}

export function isKeyboardShortcutActionId(value: unknown): value is KeyboardShortcutActionId {
  return (
    typeof value === 'string' &&
    KEYBOARD_SHORTCUT_ACTIONS.some((definition) => definition.id === value)
  )
}

export function serializeKeyboardShortcutAccelerator(
  accelerator: KeyboardShortcutAccelerator
): string {
  const modifiers = [
    accelerator.ctrlKey ? 'ctrl' : '',
    accelerator.metaKey ? 'meta' : '',
    accelerator.altKey ? 'alt' : '',
    accelerator.shiftKey ? 'shift' : ''
  ].filter(Boolean)

  return [...modifiers, accelerator.code].join('+')
}

export function formatKeyboardShortcutAccelerator(
  accelerator: KeyboardShortcutAccelerator | null
): string {
  if (!accelerator) {
    return 'Sin asignar'
  }

  const modifiers = [
    accelerator.ctrlKey ? 'Ctrl' : '',
    accelerator.metaKey ? 'Cmd' : '',
    accelerator.altKey ? 'Alt' : '',
    accelerator.shiftKey ? 'Shift' : ''
  ].filter(Boolean)

  return [...modifiers, formatKeyboardShortcutKey(accelerator)].join(' + ')
}

function createKeyboardShortcutAccelerator(
  code: string,
  key: string,
  modifiers: Partial<
    Pick<KeyboardShortcutAccelerator, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
  >
): KeyboardShortcutAccelerator {
  return {
    code,
    key,
    altKey: modifiers.altKey ?? false,
    ctrlKey: modifiers.ctrlKey ?? false,
    metaKey: modifiers.metaKey ?? false,
    shiftKey: modifiers.shiftKey ?? false
  }
}

function formatKeyboardShortcutKey(accelerator: KeyboardShortcutAccelerator): string {
  if (accelerator.code === 'Space') return 'Espacio'
  if (accelerator.code === 'Enter') return 'Enter'
  if (accelerator.code === 'Escape') return 'Esc'
  if (accelerator.code.startsWith('Digit')) return accelerator.code.replace('Digit', '')
  if (accelerator.code.startsWith('Key')) return accelerator.code.replace('Key', '').toUpperCase()
  if (accelerator.key.length === 1) return accelerator.key.toUpperCase()

  return accelerator.key || accelerator.code
}
