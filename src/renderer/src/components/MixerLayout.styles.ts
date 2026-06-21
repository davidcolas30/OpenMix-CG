import type { CSSProperties } from 'react'
import type { OutputRecordingState } from '../../../shared/ipc/output-contracts'
import {
  MULTIVIEW_NATIVE_COLUMNS,
  MULTIVIEW_NATIVE_GUTTER,
  MULTIVIEW_NATIVE_OUTPUT_HEIGHT,
  MULTIVIEW_NATIVE_OUTPUT_WIDTH,
  MULTIVIEW_ITEM_GAP,
  MULTIVIEW_RESIZER_HEIGHT,
  SIDEBAR_RESIZER_WIDTH,
  SIDEBAR_SECTION_GAP,
  SIDEBAR_SECTION_RESIZER_HEIGHT
} from './MixerLayout.constants'
import type { PanelSize, ViewTabIndicator } from './MixerLayout.types'

export const appHeaderStyle: CSSProperties = {
  padding: '8px 16px',
  background: 'linear-gradient(180deg, rgba(12, 16, 22, 0.99), rgba(7, 10, 15, 0.99))',
  borderBottom: '1px solid rgba(73, 165, 184, 0.18)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexShrink: 0,
  boxShadow: '0 1px 0 rgba(148, 163, 184, 0.06)'
}

export const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap'
}

export const brandBlockStyle: CSSProperties = {
  display: 'flex',
  minWidth: '320px',
  maxWidth: '360px',
  flexDirection: 'column',
  gap: '2px'
}

export const brandHeadingStyle: CSSProperties = {
  margin: 0,
  lineHeight: 0
}

export const brandLogoStyle: CSSProperties = {
  width: '188px',
  maxWidth: '100%',
  height: 'auto',
  display: 'block',
  objectFit: 'contain',
  userSelect: 'none'
}

export const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap',
  justifyContent: 'flex-end'
}

export const recordingClusterStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap'
}

export function recordingSummaryStyle(status: OutputRecordingState['status']): CSSProperties {
  const statusColor =
    status === 'recording'
      ? 'rgba(220, 38, 38, 0.22)'
      : status === 'stopping'
        ? 'rgba(217, 119, 6, 0.22)'
        : status === 'error'
          ? 'rgba(180, 83, 9, 0.2)'
          : 'rgba(15, 23, 42, 0.5)'

  return {
    minWidth: '184px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    padding: '6px 10px',
    borderRadius: '8px',
    border: `1px solid ${
      status === 'recording'
        ? 'rgba(248, 113, 113, 0.34)'
        : status === 'stopping'
          ? 'rgba(245, 158, 11, 0.34)'
          : 'rgba(124, 145, 173, 0.2)'
    }`,
    backgroundColor: statusColor,
    color: '#e2e8f0',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums'
  }
}

export const recordingStatusRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
}

export function recordingDotStyle(status: OutputRecordingState['status']): CSSProperties {
  return {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    backgroundColor:
      status === 'recording'
        ? '#ef4444'
        : status === 'stopping'
          ? '#f59e0b'
          : status === 'error'
            ? '#fb923c'
            : '#64748b',
    boxShadow:
      status === 'recording'
        ? '0 0 0 3px rgba(239, 68, 68, 0.18)'
        : status === 'stopping'
          ? '0 0 0 3px rgba(245, 158, 11, 0.16)'
          : 'none'
  }
}

export const recordingMetaRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '7px',
  flexWrap: 'wrap',
  color: '#94a3b8',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase'
}

export function recordButtonStyle(
  status: OutputRecordingState['status'],
  isDisabled: boolean
): CSSProperties {
  const backgroundColor =
    status === 'recording' ? '#b91c1c' : status === 'stopping' ? '#b45309' : '#7f1d1d'

  return {
    ...buttonStyle(isDisabled ? '#475569' : backgroundColor),
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.65 : 1,
    fontWeight: 700,
    letterSpacing: '0.06em',
    minWidth: status === 'recording' || status === 'stopping' ? '104px' : '68px'
  }
}

export const viewTabsStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '4px',
  borderRadius: '18px',
  backgroundColor: 'rgba(15, 23, 42, 0.78)',
  border: '1px solid rgba(71, 85, 105, 0.45)',
  overflow: 'hidden'
}

export function viewTabIndicatorStyle(indicator: ViewTabIndicator): CSSProperties {
  return {
    position: 'absolute',
    left: 0,
    top: '4px',
    bottom: '4px',
    width: `${indicator.width}px`,
    borderRadius: '14px',
    backgroundColor: 'rgba(49, 130, 160, 0.92)',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
    opacity: indicator.visible ? 1 : 0,
    pointerEvents: 'none',
    transform: `translateX(${indicator.left}px)`
  }
}

export function viewTabStyle(isActive: boolean): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    padding: '8px 14px',
    border: 'none',
    borderRadius: '14px',
    background: 'transparent',
    color: isActive ? '#f8fafc' : '#94a3b8',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px'
  }
}

export function viewBadgeStyle(isOnAir: boolean): CSSProperties {
  return {
    padding: '2px 6px',
    borderRadius: '999px',
    backgroundColor: isOnAir ? 'rgba(10, 28, 38, 0.34)' : 'rgba(30, 41, 59, 0.62)',
    border: `1px solid ${isOnAir ? 'rgba(165, 243, 252, 0.4)' : 'rgba(148, 163, 184, 0.28)'}`,
    color: isOnAir ? '#cffafe' : '#cbd5e1',
    fontSize: '10px',
    letterSpacing: '0.08em'
  }
}

export function combinedMonitorFrameStyle(
  color: string,
  left: number,
  size: PanelSize
): CSSProperties {
  return {
    position: 'absolute',
    left: `${left}px`,
    top: 0,
    width: `${size.width}px`,
    height: `${size.height}px`,
    boxShadow: `inset 0 0 0 2px ${color}`,
    borderRadius: '4px',
    pointerEvents: 'none'
  }
}

export function combinedMonitorLabelStyle(color: string, left: number): CSSProperties {
  return {
    position: 'absolute',
    left: `${left + 8}px`,
    bottom: '6px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    color,
    fontSize: '10px',
    fontFamily: 'monospace',
    pointerEvents: 'none'
  }
}

export const workspaceStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  minWidth: 0
}

export const mixerDeskStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  display: 'flex',
  minHeight: 0,
  minWidth: 0
}

export const primaryMixerColumnStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0
}

export const graphicsWorkspaceStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  display: 'flex',
  minHeight: 0,
  minWidth: 0,
  overflow: 'auto',
  paddingRight: '4px'
}

export const sectionTitle: CSSProperties = {
  margin: '0 0 6px 0',
  fontSize: '12px',
  fontWeight: 600,
  color: '#888',
  textTransform: 'uppercase',
  letterSpacing: '1px'
}

export const monitorColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: '8px',
  minWidth: 0
}

export const monitorHeaderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  minHeight: '20px'
}

export function liveMonitorTitleStyle(role: 'preview' | 'program'): CSSProperties {
  return {
    ...sectionTitle,
    margin: 0,
    color: role === 'preview' ? '#b7f7cb' : '#fecaca'
  }
}

export const monitorPanelStyle: CSSProperties = {
  flex: 1,
  width: '100%',
  display: 'flex',
  gap: '12px',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 0,
  padding: '12px',
  borderRadius: '18px',
  background: 'linear-gradient(180deg, rgba(17, 24, 39, 0.96), rgba(8, 12, 18, 0.92))',
  border: '1px solid rgba(51, 65, 85, 0.7)'
}

export function cutColumnStyle(isCompact: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: isCompact ? '8px' : '12px',
    flexShrink: 0
  }
}

export function cutButtonStyle(isRunning: boolean, isCompact: boolean): CSSProperties {
  return {
    width: isCompact ? '72px' : '80px',
    height: isCompact ? '44px' : '52px',
    fontSize: isCompact ? '16px' : '18px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    backgroundColor: isRunning ? '#d32f2f' : '#555',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: isRunning ? 'pointer' : 'default',
    transition: 'background-color 0.1s ease',
    letterSpacing: '2px'
  }
}

export function autoTransitionPanelStyle(isCompact: boolean): CSSProperties {
  return {
    width: isCompact ? '100px' : '112px',
    display: 'flex',
    flexDirection: 'column',
    gap: isCompact ? '4px' : '6px',
    padding: isCompact ? '6px' : '8px',
    borderRadius: '10px',
    background: 'rgba(11, 18, 28, 0.9)',
    border: '1px solid rgba(70, 85, 107, 0.72)'
  }
}

export const autoTransitionTitleStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '1.2px',
  color: '#9fb1c8',
  textAlign: 'center'
}

export function autoTransitionSelectStyle(isDisabled: boolean, isCompact: boolean): CSSProperties {
  return {
    width: '100%',
    height: isCompact ? '28px' : '30px',
    borderRadius: '6px',
    border: '1px solid #425168',
    background: '#101722',
    color: isDisabled ? '#718096' : '#f8fafc',
    padding: '0 8px',
    fontSize: '12px',
    cursor: isDisabled ? 'default' : 'pointer'
  }
}

export const autoTransitionMetaStyle: CSSProperties = {
  fontSize: '10px',
  color: '#94a3b8',
  textAlign: 'center'
}

export function autoTransitionButtonStyle(isDisabled: boolean, isCompact: boolean): CSSProperties {
  return {
    width: '100%',
    height: isCompact ? '30px' : '34px',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: '#081019',
    background: isDisabled ? '#5d6778' : '#7dd3fc',
    border: 'none',
    borderRadius: '6px',
    cursor: isDisabled ? 'default' : 'pointer'
  }
}

export function sourceSelectorPanelStyle(isCompact: boolean): CSSProperties {
  return {
    width: isCompact ? '100px' : '112px',
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: isCompact ? '4px' : '5px',
    padding: isCompact ? '6px' : '8px',
    borderRadius: '10px',
    background: 'rgba(11, 18, 28, 0.82)',
    border: '1px solid rgba(70, 85, 107, 0.58)'
  }
}

export const sourceSelectorHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gridColumn: '1 / -1',
  color: '#a7f3d0',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  overflow: 'hidden'
}

export function sourceSelectButtonStyle(
  isProgram: boolean,
  isPreview: boolean,
  isDisabled: boolean,
  isCompact: boolean
): CSSProperties {
  const borderColor = isProgram ? '#ef4444' : isPreview ? '#22c55e' : 'rgba(100, 116, 139, 0.5)'

  return {
    width: '100%',
    height: isCompact ? '28px' : '32px',
    display: 'grid',
    gridTemplateColumns: '1fr',
    gridTemplateRows: '1fr auto',
    alignItems: 'center',
    justifyItems: 'center',
    gap: '1px',
    padding: '3px 4px',
    borderRadius: '7px',
    border: `1px solid ${borderColor}`,
    backgroundColor: isProgram
      ? 'rgba(127, 29, 29, 0.78)'
      : isPreview
        ? 'rgba(21, 128, 61, 0.68)'
        : 'rgba(30, 41, 59, 0.72)',
    color: '#f8fafc',
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.62 : 1
  }
}

export const sourceSelectNumberStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '11px',
  fontWeight: 700,
  color: '#dbeafe'
}

export function sourceSelectRoleStyle(isProgram: boolean, isPreview: boolean): CSSProperties {
  return {
    minHeight: '10px',
    color: isProgram ? '#fecaca' : isPreview ? '#bbf7d0' : '#64748b',
    fontFamily: 'monospace',
    fontSize: '9px',
    fontWeight: 700,
    lineHeight: 1
  }
}

export const multiviewResizerStyle: CSSProperties = {
  width: '100%',
  height: `${MULTIVIEW_RESIZER_HEIGHT}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'ns-resize',
  touchAction: 'none',
  userSelect: 'none'
}

export const multiviewResizerGripStyle: CSSProperties = {
  width: '84px',
  height: '6px',
  borderRadius: '999px',
  background:
    'linear-gradient(90deg, rgba(76, 166, 184, 0.18), rgba(76, 166, 184, 0.72), rgba(76, 166, 184, 0.18))',
  boxShadow: '0 0 0 1px rgba(76, 166, 184, 0.22)'
}

export const multiviewPanelStyle: CSSProperties = {
  flexShrink: 0,
  width: '100%',
  display: 'flex',
  gap: '12px',
  alignItems: 'flex-start',
  padding: '10px 12px 0',
  minHeight: 0,
  overflow: 'hidden',
  borderTop: '1px solid rgba(51, 65, 85, 0.7)',
  borderRadius: '18px',
  background: 'linear-gradient(180deg, rgba(9, 14, 21, 0.92), rgba(7, 10, 15, 0.88))',
  border: '1px solid rgba(51, 65, 85, 0.44)'
}

export const multiviewContentStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
}

export const multiviewHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  marginBottom: '8px'
}

export function multiviewToggleStyle(isActive: boolean): CSSProperties {
  return {
    padding: '6px 10px',
    borderRadius: '999px',
    border: `1px solid ${isActive ? 'rgba(73, 165, 184, 0.45)' : 'rgba(124, 145, 173, 0.22)'}`,
    backgroundColor: isActive ? 'rgba(73, 165, 184, 0.16)' : 'rgba(15, 23, 42, 0.36)',
    color: isActive ? '#a5f3fc' : '#cbd5e1',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase'
  }
}

export const nativeMultiviewRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: `${MULTIVIEW_ITEM_GAP}px`,
  minWidth: 0,
  minHeight: 0,
  flex: 1,
  overflow: 'hidden'
}

export const nativeMultiviewVideoWrapStyle: CSSProperties = {
  position: 'relative',
  flexShrink: 0,
  overflow: 'hidden'
}

export function nativeMultiviewHotspotStyle(
  index: number,
  totalSlots: number,
  isProgram: boolean,
  isPreview: boolean,
  isDisabled: boolean
): CSSProperties {
  const columns = Math.max(1, Math.min(totalSlots, MULTIVIEW_NATIVE_COLUMNS))
  const rows = Math.max(1, Math.ceil(totalSlots / columns))
  const column = index % columns
  const row = Math.floor(index / columns)
  const slotWidthPx =
    (MULTIVIEW_NATIVE_OUTPUT_WIDTH - (columns + 1) * MULTIVIEW_NATIVE_GUTTER) / columns
  const slotHeightPx =
    (MULTIVIEW_NATIVE_OUTPUT_HEIGHT - (rows + 1) * MULTIVIEW_NATIVE_GUTTER) / rows
  const leftPx = MULTIVIEW_NATIVE_GUTTER + column * (slotWidthPx + MULTIVIEW_NATIVE_GUTTER)
  const topPx = MULTIVIEW_NATIVE_GUTTER + row * (slotHeightPx + MULTIVIEW_NATIVE_GUTTER)
  const borderColor = isProgram ? '#ef4444' : isPreview ? '#22c55e' : 'rgba(148, 163, 184, 0.32)'

  return {
    position: 'absolute',
    left: `${(leftPx / MULTIVIEW_NATIVE_OUTPUT_WIDTH) * 100}%`,
    top: `${(topPx / MULTIVIEW_NATIVE_OUTPUT_HEIGHT) * 100}%`,
    width: `${(slotWidthPx / MULTIVIEW_NATIVE_OUTPUT_WIDTH) * 100}%`,
    height: `${(slotHeightPx / MULTIVIEW_NATIVE_OUTPUT_HEIGHT) * 100}%`,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    boxSizing: 'border-box',
    padding: '6px',
    border: `2px solid ${borderColor}`,
    backgroundColor: 'transparent',
    color: '#f8fafc',
    cursor: isDisabled ? 'default' : 'pointer',
    opacity: isDisabled ? 0.64 : 1,
    fontSize: '10px',
    fontFamily: 'monospace',
    textShadow: '0 1px 4px rgba(0,0,0,0.95)',
    overflow: 'hidden'
  }
}

export const graphicsTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flexShrink: 0,
  overflow: 'hidden'
}

export function graphicsTileLabelStyle(isVisible: boolean): CSSProperties {
  return {
    padding: '2px 6px',
    backgroundColor: isVisible ? '#1f7c92' : '#243041',
    color: '#fff',
    fontSize: '10px',
    fontFamily: 'monospace',
    textAlign: 'center',
    borderRadius: '0 0 4px 4px'
  }
}

export function mixerSidebarStyle(width: number): CSSProperties {
  return {
    width: `${width}px`,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: `${SIDEBAR_SECTION_GAP}px`,
    flexShrink: 0,
    minHeight: 0,
    minWidth: 0,
    paddingLeft: '12px',
    overflowX: 'hidden',
    overflowY: 'auto'
  }
}

export const sidebarResizerStyle: CSSProperties = {
  width: `${SIDEBAR_RESIZER_WIDTH}px`,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'ew-resize',
  touchAction: 'none',
  userSelect: 'none',
  flexShrink: 0
}

export const sidebarResizerGripStyle: CSSProperties = {
  width: '6px',
  height: '86px',
  borderRadius: '999px',
  background:
    'linear-gradient(180deg, rgba(76, 166, 184, 0.18), rgba(76, 166, 184, 0.72), rgba(76, 166, 184, 0.18))',
  boxShadow: '0 0 0 1px rgba(76, 166, 184, 0.22)'
}

export const sidebarSectionResizerStyle: CSSProperties = {
  height: `${SIDEBAR_SECTION_RESIZER_HEIGHT}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'ns-resize',
  touchAction: 'none',
  userSelect: 'none',
  flexShrink: 0
}

export const sidebarSectionResizerGripStyle: CSSProperties = {
  width: '92px',
  height: '4px',
  borderRadius: '999px',
  background:
    'linear-gradient(90deg, rgba(76, 166, 184, 0.16), rgba(76, 166, 184, 0.68), rgba(76, 166, 184, 0.16))',
  boxShadow: '0 0 0 1px rgba(76, 166, 184, 0.18)'
}

export const sidebarCardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '11px 10px',
  borderRadius: '10px',
  backgroundColor: 'rgba(12, 18, 28, 0.72)',
  border: '1px solid rgba(124, 145, 173, 0.16)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.025)',
  minHeight: 0,
  overflow: 'hidden'
}

export function sidebarFixedCardStyle(height: number): CSSProperties {
  return {
    ...sidebarCardStyle,
    height: `${height}px`,
    flex: '0 0 auto'
  }
}

export const sidebarHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px',
  flexShrink: 0,
  paddingBottom: '7px',
  borderBottom: '1px solid rgba(124, 145, 173, 0.1)'
}

export const sidebarMetaStyle: CSSProperties = {
  color: '#7c8ca4',
  fontSize: '10px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 700
}

export const sidebarBodyStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden'
}

export const idleStateStyle: CSSProperties = {
  padding: '28px 16px',
  borderRadius: '14px',
  border: '1px dashed rgba(100, 116, 139, 0.42)',
  color: '#94a3b8',
  textAlign: 'center',
  fontSize: '13px'
}

export function buttonStyle(bg: string): CSSProperties {
  return {
    padding: '8px 16px',
    backgroundColor: bg,
    color: '#fff',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '7px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 700
  }
}

// ── Estilos del panel de monitorización ────────────────────

export const monitorHeroCardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '720px',
  margin: '0 auto',
  boxSizing: 'border-box',
  backgroundColor: 'rgba(15, 23, 42, 0.7)',
  border: '1px solid rgba(124, 145, 173, 0.22)',
  borderRadius: '12px',
  padding: '24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px'
}

export const monitorEyebrowStyle: CSSProperties = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#7c8ca4'
}

export const monitorTitleStyle: CSSProperties = {
  fontSize: '22px',
  fontWeight: 700,
  color: '#f8fafc',
  margin: 0
}

export const monitorTextStyle: CSSProperties = {
  fontSize: '13px',
  lineHeight: 1.5,
  color: '#94a3b8',
  margin: 0
}

export const monitorOptionsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
  gap: '12px',
  minWidth: 0
}

export function monitorOptionCardStyle(selected: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '14px 8px',
    borderRadius: '8px',
    border: selected ? '1px solid #3b82f6' : '1px solid rgba(124, 145, 173, 0.22)',
    backgroundColor: selected ? 'rgba(59, 130, 246, 0.12)' : 'rgba(15, 23, 42, 0.5)',
    cursor: 'pointer',
    minWidth: 0,
    transition: 'all 120ms ease-out'
  }
}

export const monitorOptionLabelStyle: CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: '#e2e8f0'
}

export const monitorOptionHintStyle: CSSProperties = {
  fontSize: '11px',
  color: '#7c8ca4'
}

export const monitorResetButtonStyle: CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: 500,
  color: '#94a3b8',
  backgroundColor: 'transparent',
  border: '1px solid rgba(124, 145, 173, 0.22)',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'filter 120ms ease, transform 120ms ease, border-color 120ms ease'
}
