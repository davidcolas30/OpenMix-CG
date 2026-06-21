import type { CSSProperties } from 'react'

export const panelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: '0 0 auto',
  flexShrink: 0,
  gap: '14px',
  width: '100%',
  paddingBottom: '20px'
}

export const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '14px',
  paddingBottom: '12px',
  borderBottom: '1px solid rgba(124, 145, 173, 0.18)'
}

export const eyebrowStyle: CSSProperties = {
  color: '#7dd3fc',
  fontSize: '11px',
  letterSpacing: 0,
  textTransform: 'uppercase',
  fontWeight: 800
}

export const titleStyle: CSSProperties = {
  margin: '4px 0 0',
  color: '#f8fafc',
  fontSize: '20px',
  lineHeight: 1.15
}

export const badgeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '10px'
}

export function modeBadgeStyle(active: boolean): CSSProperties {
  return {
    padding: '4px 8px',
    borderRadius: '999px',
    border: active ? '1px solid rgba(74, 222, 128, 0.42)' : '1px solid rgba(124, 145, 173, 0.25)',
    backgroundColor: active ? 'rgba(20, 83, 45, 0.28)' : 'rgba(15, 23, 42, 0.74)',
    color: active ? '#dcfce7' : '#cbd5e1',
    fontSize: '10px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0
  }
}

export const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
}

export const workspaceGridStyle: CSSProperties = {
  display: 'grid',
  gap: '14px',
  alignItems: 'start'
}

export const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '13px',
  minWidth: 0,
  minHeight: 0,
  backgroundColor: 'rgba(7, 12, 19, 0.58)',
  border: '1px solid rgba(124, 145, 173, 0.18)',
  borderRadius: '8px',
  padding: '13px'
}

export const referenceCardStyle: CSSProperties = {
  ...cardStyle
}

export const waveformCardStyle: CSSProperties = {
  ...cardStyle,
  minHeight: '282px'
}

export const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px'
}

export const cardTitleStyle: CSSProperties = {
  margin: 0,
  color: '#e6eef8',
  fontSize: '13px',
  fontWeight: 800
}

export const cardSubtleTextStyle: CSSProperties = {
  display: 'block',
  marginTop: '4px',
  color: '#8291a7',
  fontSize: '11px',
  lineHeight: 1.3
}

export const cardMetaStyle: CSSProperties = {
  color: '#8291a7',
  fontSize: '11px',
  textAlign: 'right'
}

export const referenceMonitorShellStyle: CSSProperties = {
  width: '100%',
  minHeight: '194px',
  height: 'clamp(194px, 22vh, 238px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  borderRadius: '8px',
  backgroundColor: '#020407',
  border: '1px solid rgba(73, 165, 184, 0.28)'
}

export const referencePlaceholderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  minHeight: '194px',
  padding: '18px',
  color: '#8291a7',
  fontSize: '12px',
  textAlign: 'center',
  lineHeight: 1.5
}

export function referenceToggleStyle(active: boolean, disabled: boolean): CSSProperties {
  return {
    border: active ? '1px solid rgba(250, 204, 21, 0.52)' : '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : active ? '#684b10' : '#263244',
    color: active ? '#fef9c3' : '#d8e2f0',
    borderRadius: '6px',
    padding: '8px 10px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '11px',
    opacity: disabled ? 0.54 : 1
  }
}

export const referenceSourceGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
  gap: '6px'
}

export function referenceSourceButtonStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
    border: active ? '1px solid rgba(56, 189, 248, 0.62)' : '1px solid rgba(124, 145, 173, 0.2)',
    backgroundColor: active ? 'rgba(14, 116, 144, 0.34)' : 'rgba(15, 23, 42, 0.64)',
    color: active ? '#e0f7ff' : '#cbd5e1',
    borderRadius: '6px',
    padding: '7px 9px',
    cursor: 'pointer',
    fontSize: '11px',
    overflow: 'hidden'
  }
}

export const visualBufferHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '10px',
  borderTop: '1px solid rgba(124, 145, 173, 0.16)',
  paddingTop: '10px'
}

export const visualBufferActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px'
}

export const visualBufferStripStyle: CSSProperties = {
  display: 'flex',
  gap: '8px',
  overflowX: 'auto',
  padding: '2px 2px 6px',
  minHeight: '74px'
}

export const visualBufferEmptyStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '220px',
  minHeight: '64px',
  padding: '12px',
  borderRadius: '8px',
  border: '1px dashed rgba(124, 145, 173, 0.24)',
  color: '#8291a7',
  fontSize: '11px',
  lineHeight: 1.4,
  textAlign: 'center'
}

export function visualFrameButtonStyle(active: boolean): CSSProperties {
  return {
    position: 'relative',
    flex: '0 0 100px',
    width: '100px',
    height: '64px',
    padding: 0,
    border: active ? '2px solid rgba(250, 204, 21, 0.86)' : '1px solid rgba(124, 145, 173, 0.24)',
    borderRadius: '7px',
    overflow: 'hidden',
    backgroundColor: '#020407',
    cursor: 'pointer'
  }
}

export const visualFrameImageStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  display: 'block'
}

export const visualFrameTimeStyle: CSSProperties = {
  position: 'absolute',
  right: '4px',
  bottom: '4px',
  padding: '2px 5px',
  borderRadius: '4px',
  backgroundColor: 'rgba(0, 0, 0, 0.68)',
  color: '#f8fafc',
  fontSize: '10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

export const waveformHeaderControlsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: '8px',
  minWidth: 0
}

export const compactSelectStyle: CSSProperties = {
  minWidth: '72px',
  backgroundColor: '#101722',
  color: '#d8e2f0',
  border: '1px solid rgba(124, 145, 173, 0.26)',
  borderRadius: '6px',
  padding: '5px 8px',
  fontSize: '11px',
  fontWeight: 800
}

export const fieldStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  minWidth: 0
}

export const fieldLabelStyle: CSSProperties = {
  color: '#aab8ca',
  fontSize: '11px',
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: 0
}

export const selectStyle: CSSProperties = {
  minWidth: 0,
  backgroundColor: '#101722',
  color: '#e6edf7',
  border: '1px solid rgba(124, 145, 173, 0.26)',
  borderRadius: '6px',
  padding: '9px 10px',
  fontSize: '12px'
}

export const meterBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px'
}

export const meterHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  color: '#9aa8bb',
  fontSize: '11px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

export const meterTrackStyle: CSSProperties = {
  position: 'relative',
  height: '16px',
  borderRadius: '999px',
  overflow: 'hidden',
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(124, 145, 173, 0.18)'
}

export function meterFillStyle(widthPercent: number, color: string): CSSProperties {
  return {
    width: `${widthPercent}%`,
    height: '100%',
    background: `linear-gradient(90deg, ${color}, #22c55e)`,
    transition: 'width 90ms linear'
  }
}

export function meterPeakStyle(leftPercent: number): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: `${leftPercent}%`,
    width: '2px',
    backgroundColor: '#facc15',
    transform: 'translateX(-1px)'
  }
}

export const delayControlStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 76px auto',
  alignItems: 'center',
  gap: '8px'
}

export const rangeStyle: CSSProperties = {
  width: '100%',
  minWidth: 0
}

export const delayInputStyle: CSSProperties = {
  width: '76px',
  minWidth: 0,
  backgroundColor: '#101722',
  color: '#e6edf7',
  border: '1px solid rgba(124, 145, 173, 0.26)',
  borderRadius: '6px',
  padding: '7px 8px',
  fontSize: '12px'
}

export const delayUnitStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: '12px'
}

export const thresholdValueStyle: CSSProperties = {
  ...delayUnitStyle,
  width: '52px',
  textAlign: 'right',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

export const canvasStyle: CSSProperties = {
  width: '100%',
  height: '220px',
  display: 'block',
  borderRadius: '8px',
  border: '1px solid rgba(124, 145, 173, 0.18)',
  backgroundColor: '#05070a'
}

export const calibrationActionGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px'
}

export const calibrationReadoutStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: '8px'
}

export const readoutLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  color: '#8390a2',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: 0
}

export const readoutValueStyle: CSSProperties = {
  color: '#e6edf7',
  fontSize: '13px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace'
}

export function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: '1px solid rgba(80, 190, 130, 0.38)',
    backgroundColor: disabled ? '#23342b' : '#146c43',
    color: '#e8fff2',
    borderRadius: '6px',
    padding: '9px 12px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '12px',
    opacity: disabled ? 0.58 : 1
  }
}

export function secondaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : '#263244',
    color: '#d8e2f0',
    borderRadius: '6px',
    padding: '9px 12px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '12px',
    opacity: disabled ? 0.58 : 1
  }
}

export function dangerButtonStyle(disabled: boolean): CSSProperties {
  return {
    border: '1px solid rgba(224, 85, 85, 0.28)',
    backgroundColor: disabled ? '#332020' : '#4a2020',
    color: '#ffd4d4',
    borderRadius: '6px',
    padding: '9px 12px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '12px',
    opacity: disabled ? 0.58 : 1
  }
}

export function captureButtonStyle(disabled: boolean, active: boolean): CSSProperties {
  return {
    border: active ? '1px solid rgba(250, 204, 21, 0.55)' : '1px solid rgba(124, 145, 173, 0.28)',
    backgroundColor: disabled ? '#202632' : active ? '#684b10' : '#263244',
    color: active ? '#fef9c3' : '#d8e2f0',
    borderRadius: '6px',
    padding: '9px 12px',
    cursor: disabled ? 'default' : 'pointer',
    fontWeight: 800,
    fontSize: '12px',
    opacity: disabled ? 0.58 : 1
  }
}
