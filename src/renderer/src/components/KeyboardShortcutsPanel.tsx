import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  KEYBOARD_SHORTCUT_ACTIONS,
  formatKeyboardShortcutAccelerator,
  type KeyboardShortcutAccelerator,
  type KeyboardShortcutActionId,
  type KeyboardShortcutBinding,
  type KeyboardShortcutGroup,
  type KeyboardShortcutSettings,
  type UpdateKeyboardShortcutBindingRequest
} from '../../../shared/ipc/shortcut-contracts'
import TransientStatusToast from './TransientStatusToast'

interface KeyboardShortcutsPanelProps {
  settings: KeyboardShortcutSettings | null
  statusMessage: string | null
  onCaptureStateChange: (active: boolean) => void
  onUpdateBinding: (request: UpdateKeyboardShortcutBindingRequest) => Promise<void>
  onResetDefaults: () => Promise<void>
}

const GROUP_LABELS: Record<KeyboardShortcutGroup, string> = {
  mixer: 'Mixer',
  preview: 'Preview',
  graphics: 'Grafismo',
  'local-video': 'Video local'
}

const GROUP_ORDER: KeyboardShortcutGroup[] = ['mixer', 'preview', 'graphics', 'local-video']
const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight'
])

export default function KeyboardShortcutsPanel({
  settings,
  statusMessage,
  onCaptureStateChange,
  onUpdateBinding,
  onResetDefaults
}: KeyboardShortcutsPanelProps): React.JSX.Element {
  const [captureActionId, setCaptureActionId] = useState<KeyboardShortcutActionId | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const bindingsByActionId = useMemo(() => {
    const bindings = new Map<KeyboardShortcutActionId, KeyboardShortcutBinding>()
    for (const binding of settings?.bindings ?? []) {
      bindings.set(binding.actionId, binding)
    }
    return bindings
  }, [settings])
  const activeShortcutCount =
    settings?.bindings.filter((binding) => binding.enabled && binding.accelerator !== null)
      .length ?? 0

  const submitBinding = useCallback(
    async (request: UpdateKeyboardShortcutBindingRequest): Promise<void> => {
      setIsBusy(true)
      try {
        await onUpdateBinding(request)
        setCaptureActionId(null)
      } catch {
        // El padre muestra el error. Dejamos la captura abierta para probar otra tecla.
      } finally {
        setIsBusy(false)
      }
    },
    [onUpdateBinding]
  )

  useEffect(() => {
    onCaptureStateChange(captureActionId !== null)
  }, [captureActionId, onCaptureStateChange])

  useEffect(() => {
    if (!captureActionId) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()

      if (event.code === 'Escape') {
        setCaptureActionId(null)
        return
      }

      if (event.code === 'Backspace' || event.code === 'Delete') {
        void submitBinding({
          actionId: captureActionId,
          accelerator: null,
          enabled: false
        })
        return
      }

      if (MODIFIER_CODES.has(event.code)) {
        return
      }

      void submitBinding({
        actionId: captureActionId,
        accelerator: acceleratorFromKeyboardEvent(event),
        enabled: true
      })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [captureActionId, submitBinding])

  const handleClearBinding = async (actionId: KeyboardShortcutActionId): Promise<void> => {
    await submitBinding({
      actionId,
      accelerator: null,
      enabled: false
    })
  }

  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <div>
          <span style={eyebrowStyle}>Control operativo</span>
          <h2 style={titleStyle}>Atajos de teclado</h2>
          <p style={leadStyle}>
            Configura acciones frecuentes sin añadir más controles al mixer principal.
          </p>
        </div>
        <button
          className="openmix-control-button"
          type="button"
          onClick={() => void onResetDefaults()}
          disabled={isBusy}
          style={resetButtonStyle(isBusy)}
        >
          Restablecer
        </button>
      </header>

      <TransientStatusToast message={statusMessage} />

      <div style={summaryGridStyle}>
        <div style={summaryItemStyle}>
          <span style={summaryLabelStyle}>Activos</span>
          <strong style={summaryValueStyle}>{activeShortcutCount}</strong>
        </div>
        <div style={summaryItemStyle}>
          <span style={summaryLabelStyle}>Acciones</span>
          <strong style={summaryValueStyle}>{KEYBOARD_SHORTCUT_ACTIONS.length}</strong>
        </div>
        <div style={summaryHintStyle}>
          Los cambios se aplican al momento y quedan guardados para la siguiente sesión.
        </div>
      </div>

      <div style={tableStyle}>
        {GROUP_ORDER.map((group) => {
          const groupActions = KEYBOARD_SHORTCUT_ACTIONS.filter((action) => action.group === group)
          const groupActiveCount = groupActions.filter((action) => {
            const binding = bindingsByActionId.get(action.id)
            return binding?.enabled && binding.accelerator !== null
          }).length

          return (
            <section key={group} style={groupStyle}>
              <div style={groupHeaderStyle}>
                <h3 style={groupTitleStyle}>{GROUP_LABELS[group]}</h3>
                <span style={groupMetaStyle}>
                  {groupActiveCount}/{groupActions.length}
                </span>
              </div>
              <div style={rowsStyle}>
                {groupActions.map((action) => {
                  const binding = bindingsByActionId.get(action.id)
                  const isCapturingThisAction = captureActionId === action.id
                  return (
                    <div
                      className="openmix-interactive-row"
                      key={action.id}
                      style={rowStyle(isCapturingThisAction)}
                    >
                      <div style={actionCellStyle}>
                        <strong style={actionLabelStyle}>{action.label}</strong>
                        <span style={actionDescriptionStyle}>{action.description}</span>
                      </div>
                      <kbd style={shortcutKeyStyle(isCapturingThisAction)}>
                        {isCapturingThisAction
                          ? 'Pulsa una tecla...'
                          : formatKeyboardShortcutAccelerator(binding?.accelerator ?? null)}
                      </kbd>
                      <div style={actionsCellStyle}>
                        <button
                          className="openmix-control-button"
                          type="button"
                          onClick={() => setCaptureActionId(action.id)}
                          disabled={!settings || isBusy}
                          style={secondaryButtonStyle(!settings || isBusy)}
                        >
                          {binding?.accelerator ? 'Cambiar' : 'Asignar'}
                        </button>
                        <button
                          className="openmix-control-button"
                          type="button"
                          onClick={() => void handleClearBinding(action.id)}
                          disabled={!settings || isBusy || !binding?.accelerator}
                          style={dangerButtonStyle(!settings || isBusy || !binding?.accelerator)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <footer style={footerStyle}>
        <span>Escape cancela la captura.</span>
        <span>Delete o Backspace dejan la acción sin tecla.</span>
        <span>Los atajos no se ejecutan mientras escribes en campos de texto.</span>
      </footer>
    </div>
  )
}

function acceleratorFromKeyboardEvent(event: KeyboardEvent): KeyboardShortcutAccelerator {
  return {
    code: event.code,
    key: event.key,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey
  }
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: '0 0 auto',
  flexShrink: 0,
  gap: '14px',
  width: '100%',
  paddingBottom: '22px'
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  paddingBottom: '12px',
  borderBottom: '1px solid rgba(124, 145, 173, 0.18)'
}

const eyebrowStyle: React.CSSProperties = {
  color: '#7dd3fc',
  fontSize: '11px',
  letterSpacing: 0,
  textTransform: 'uppercase',
  fontWeight: 800
}

const titleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#f8fafc',
  fontSize: '20px',
  lineHeight: 1.15
}

const leadStyle: React.CSSProperties = {
  margin: '8px 0 0',
  color: '#9aa8bb',
  fontSize: '13px',
  lineHeight: 1.45,
  maxWidth: '620px'
}

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(100px, 132px)) minmax(240px, 1fr)',
  gap: '10px',
  alignItems: 'stretch'
}

const summaryItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(7, 12, 19, 0.56)',
  border: '1px solid rgba(124, 145, 173, 0.16)'
}

const summaryLabelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '10px',
  textTransform: 'uppercase',
  fontWeight: 800,
  letterSpacing: 0
}

const summaryValueStyle: React.CSSProperties = {
  color: '#e6f7ff',
  fontSize: '16px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

const summaryHintStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(15, 23, 42, 0.44)',
  border: '1px solid rgba(124, 145, 173, 0.12)',
  color: '#9aa8bb',
  fontSize: '12px',
  lineHeight: 1.35
}

const tableStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 520px), 1fr))',
  gap: '14px',
  alignItems: 'start',
  overflow: 'visible'
}

const groupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'start',
  height: 'fit-content',
  minWidth: 0,
  backgroundColor: 'rgba(7, 12, 19, 0.58)',
  border: '1px solid rgba(124, 145, 173, 0.18)',
  borderRadius: '8px',
  overflow: 'hidden'
}

const groupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  padding: '11px 13px',
  backgroundColor: 'rgba(15, 23, 42, 0.76)',
  borderBottom: '1px solid rgba(124, 145, 173, 0.16)'
}

const groupTitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#e6eef8',
  fontSize: '13px',
  fontWeight: 800
}

const groupMetaStyle: React.CSSProperties = {
  color: '#9ed8e6',
  fontSize: '11px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

const rowsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column'
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(118px, 174px) max-content',
    gap: '10px',
    alignItems: 'center',
    minHeight: '62px',
    padding: '10px 13px',
    backgroundColor: active ? 'rgba(20, 83, 45, 0.28)' : 'transparent',
    borderBottom: '1px solid rgba(124, 145, 173, 0.11)'
  }
}

const actionCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  minWidth: 0
}

const actionLabelStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontSize: '13px'
}

const actionDescriptionStyle: React.CSSProperties = {
  color: '#8997aa',
  fontSize: '11px',
  lineHeight: 1.35
}

function shortcutKeyStyle(active: boolean): React.CSSProperties {
  return {
    justifySelf: 'stretch',
    minHeight: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 10px',
    color: active ? '#dcfce7' : '#dbe7f6',
    backgroundColor: active ? 'rgba(22, 101, 52, 0.48)' : 'rgba(10, 16, 26, 0.82)',
    border: active ? '1px solid rgba(74, 222, 128, 0.42)' : '1px solid rgba(124, 145, 173, 0.24)',
    borderRadius: '6px',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontWeight: 800,
    whiteSpace: 'nowrap',
    boxShadow: 'inset 0 -2px 0 rgba(255, 255, 255, 0.04)'
  }
}

const actionsCellStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px'
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : '#263244',
    color: '#d8e2f0',
    borderRadius: '6px',
    padding: '8px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 700,
    fontSize: '12px',
    opacity: disabled ? 0.58 : 1
  }
}

function dangerButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(224, 85, 85, 0.28)',
    backgroundColor: disabled ? '#2a2224' : '#3d2023',
    color: '#ffd4d4',
    borderRadius: '6px',
    padding: '8px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 700,
    fontSize: '12px',
    opacity: disabled ? 0.5 : 1
  }
}

function resetButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    border: '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : '#1f2a3a',
    color: '#e6edf7',
    borderRadius: '6px',
    padding: '9px 12px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '12px',
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.58 : 1
  }
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '10px 16px',
  color: '#8390a2',
  fontSize: '11px',
  padding: '10px 12px',
  borderRadius: '8px',
  backgroundColor: 'rgba(7, 12, 19, 0.34)',
  border: '1px solid rgba(124, 145, 173, 0.1)'
}
