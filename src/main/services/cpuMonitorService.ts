import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'

const execFileAsync = promisify(execFile)

interface ProcessSample {
  pid: number
  ppid: number
  cpu: number
  memory: number
  command: string
}

interface ElectronProcessSample extends ProcessSample {
  role: string
}

interface CpuMonitorConfig {
  enabled: boolean
  intervalMs: number
  maxSessions: number
  maxSamplesPerSession: number
}

const SESSION_MARKER = '# OpenMix-CG CPU session '
const DEFAULT_INTERVAL_MS = 5000
const DEFAULT_MAX_SESSIONS = 3
const DEFAULT_MAX_SAMPLES_PER_SESSION = 900
const CPU_MONITOR_HEADER_LINES = 3
const DIAGNOSTIC_ENV_KEYS = [
  'OPENMIX_CPU_MONITOR',
  'OPENMIX_CPU_MONITOR_INTERVAL_MS',
  'OPENMIX_CPU_MONITOR_SESSIONS',
  'OPENMIX_CPU_MONITOR_SAMPLES',
  'OPENMIX_MOBILE_PROFILE',
  'OPENMIX_MOBILE_QUALITY_MODE',
  'OPENMIX_MOBILE_BITRATE_MODE',
  'OPENMIX_MOBILE_MAX_BITRATE_KBPS',
  'OPENMIX_MOBILE_SENDER_MODE',
  'OPENMIX_MOBILE_TRANSPORT_CC',
  'OPENMIX_MOBILE_AUDIO',
  'OPENMIX_MOBILE_PREVIEW',
  'OPENMIX_MOBILE_CADENCE_MONITOR',
  'OPENMIX_MOBILE_STATS',
  'OPENMIX_REALTIME_DIAGNOSTICS',
  'OPENMIX_STUTTER_TRACE',
  'OPENMIX_RTP_TIMELINE_TRACE',
  'OPENMIX_WEBRTC_RX_STATS',
  'OPENMIX_WEBRTC_STANDALONE_RX',
  'OPENMIX_WEBRTC_RTP_DIRECT_SINK',
  'OPENMIX_WEBRTC_DECODE_BRANCH',
  'OPENMIX_WEBRTC_MONITOR_BRANCH',
  'OPENMIX_WEBRTC_H264_DECODER',
  'OPENMIX_SYNC_BUFFER',
  'OPENMIX_SYNC_BUFFER_MIN_PEERS',
  'OPENMIX_SYNC_BUFFER_STATS',
  'OPENMIX_SYNC_BUFFER_NTP',
  'OPENMIX_SYNC_BUFFER_NTP_APPLY',
  'OPENMIX_SYNC_BUFFER_NTP_MAX_DELAY_MS',
  'OPENMIX_SYNC_BUFFER_NTP_MAX_STEP_MS',
  'OPENMIX_SYNC_BUFFER_NTP_MIN_STEP_MS',
  'OPENMIX_SYNC_BUFFER_NTP_ADJUST_INTERVAL_MS',
  'OPENMIX_SYNC_BUFFER_RETIMER',
  'OPENMIX_SYNC_BUFFER_CLOCK',
  'OPENMIX_MONITOR_RENDERER',
  'OPENMIX_MONITOR_COMPOSITOR_BACKEND',
  'OPENMIX_MONITOR_GL_ZERO_COPY',
  'OPENMIX_MONITOR_TARGETS',
  'OPENMIX_MONITOR_INPUTS',
  'OPENMIX_MONITOR_IPC',
  'OPENMIX_COMBINED_MONITOR',
  'OPENMIX_THUMBNAILS',
  'OPENMIX_MULTIVIEW',
  'OPENMIX_MULTIVIEW_HUD',
  'OPENMIX_MULTIVIEW_ACTIVE_SLOTS',
  'OPENMIX_MULTIVIEW_BARS',
  'OPENMIX_MULTIVIEW_BARS_CACHE',
  'OPENMIX_MULTIVIEW_LIVE_BARS',
  'OPENMIX_MULTIVIEW_SOURCE_FPS',
  'OPENMIX_MULTIVIEW_SURFACE',
  'OPENMIX_GRAPHICS_BRANCHES',
  'OPENMIX_GRAPHICS_OVERLAY_PUMP',
  'OPENMIX_GRAPHICS_SPIKE_TRACE',
  'OPENMIX_GRAPHICS_SPIKE_TRACE_SLOW_MS',
  'OPENMIX_GRAPHICS_SPIKE_TRACE_DIRTY_PERCENT',
  'OPENMIX_BIG_MONITORS_SURFACE',
  'OPENMIX_NATIVE_MONITOR_WINDOWS',
  'OPENMIX_NATIVE_MONITOR_SINK',
  'OPENMIX_NATIVE_MONITOR_SYNC'
] as const

let cpuMonitorTimer: NodeJS.Timeout | null = null
let previousSessions: string[] = []
let currentSessionLines: string[] = []
let cpuMonitorLogPath: string | null = null
let cpuMonitorConfig: CpuMonitorConfig | null = null

function readBooleanEnv(name: string, defaultValue: boolean): boolean {
  const rawValue = process.env[name]?.trim().toLowerCase()
  if (!rawValue) {
    return defaultValue
  }

  return ['1', 'true', 'yes', 'on'].includes(rawValue)
}

function readIntegerEnv(
  name: string,
  defaultValue: number,
  minValue: number,
  maxValue: number
): number {
  const parsedValue = Number.parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(parsedValue)) {
    return defaultValue
  }

  return Math.min(Math.max(parsedValue, minValue), maxValue)
}

function resolveCpuMonitorConfig(): CpuMonitorConfig {
  return {
    // Este monitor lanza un muestreo de procesos externo. Es útil para
    // pruebas de CPU, pero no debe perturbar una sesión de realización en
    // tiempo real ni introducir pulsos periódicos en el Main Process.
    enabled: readBooleanEnv('OPENMIX_CPU_MONITOR', false),
    intervalMs: readIntegerEnv('OPENMIX_CPU_MONITOR_INTERVAL_MS', DEFAULT_INTERVAL_MS, 1000, 60000),
    maxSessions: readIntegerEnv('OPENMIX_CPU_MONITOR_SESSIONS', DEFAULT_MAX_SESSIONS, 1, 10),
    maxSamplesPerSession: readIntegerEnv(
      'OPENMIX_CPU_MONITOR_SAMPLES',
      DEFAULT_MAX_SAMPLES_PER_SESSION,
      60,
      7200
    )
  }
}

function getCpuMonitorLogPath(): string {
  const logDirectory = join(app.getPath('userData'), 'logs')
  mkdirSync(logDirectory, { recursive: true })
  return join(logDirectory, 'electron-cpu-monitor.log')
}

function readPreviousSessions(logPath: string, maxSessions: number): string[] {
  if (!existsSync(logPath)) {
    return []
  }

  const content = readFileSync(logPath, 'utf8')
  const sessions = content
    .split(new RegExp(`(?=^${SESSION_MARKER})`, 'm'))
    .map((session) => session.trimEnd())
    .filter((session) => session.startsWith(SESSION_MARKER))

  return sessions.slice(Math.max(0, sessions.length - Math.max(0, maxSessions - 1)))
}

function writeCpuMonitorLog(): void {
  if (!cpuMonitorLogPath || !cpuMonitorConfig) {
    return
  }

  const sessions = [...previousSessions, currentSessionLines.join('\n')]
    .filter((session) => session.trim().length > 0)
    .slice(-cpuMonitorConfig.maxSessions)

  writeFileSync(cpuMonitorLogPath, `${sessions.join('\n\n')}\n`, 'utf8')
}

function appendCpuMonitorLine(line: string): void {
  if (!cpuMonitorConfig) {
    return
  }

  currentSessionLines.push(line)
  const maxLines = CPU_MONITOR_HEADER_LINES + cpuMonitorConfig.maxSamplesPerSession
  if (currentSessionLines.length > maxLines) {
    currentSessionLines.splice(CPU_MONITOR_HEADER_LINES, currentSessionLines.length - maxLines)
  }

  writeCpuMonitorLog()
}

function formatLocalTimestamp(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absoluteOffsetMinutes = Math.abs(offsetMinutes)
  const offsetHours = Math.floor(absoluteOffsetMinutes / 60)
  const offsetRemainderMinutes = absoluteOffsetMinutes % 60
  const pad = (value: number): string => value.toString().padStart(2, '0')

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offsetHours)}:${pad(offsetRemainderMinutes)}`
  )
}

function formatDiagnosticEnvSnapshot(): string {
  const entries = DIAGNOSTIC_ENV_KEYS
    .map((key) => [key, process.env[key]] as const)
    .filter((entry): entry is readonly [typeof DIAGNOSTIC_ENV_KEYS[number], string] =>
      Boolean(entry[1])
    )
    .map(([key, value]) => `${key}=${value}`)

  return entries.length > 0 ? entries.join(' ') : 'none'
}

function parsePsOutput(output: string): ProcessSample[] {
  return output
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(.+)$/)
      if (!match) {
        return null
      }

      return {
        pid: Number.parseInt(match[1], 10),
        ppid: Number.parseInt(match[2], 10),
        cpu: Number.parseFloat(match[3]),
        memory: Number.parseFloat(match[4]),
        command: match[5]
      }
    })
    .filter((sample): sample is ProcessSample => Boolean(sample))
}

function isDescendantOfRoot(
  sample: ProcessSample,
  rootPid: number,
  processByPid: Map<number, ProcessSample>
): boolean {
  if (sample.pid === rootPid) {
    return true
  }

  const visitedPids = new Set<number>()
  let currentPpid = sample.ppid

  while (currentPpid > 0 && !visitedPids.has(currentPpid)) {
    if (currentPpid === rootPid) {
      return true
    }

    visitedPids.add(currentPpid)
    const parent = processByPid.get(currentPpid)
    if (!parent) {
      return false
    }

    currentPpid = parent.ppid
  }

  return false
}

function classifyElectronProcess(sample: ProcessSample, rootPid: number): string {
  if (sample.pid === rootPid) {
    return 'main'
  }

  const typeMatch = sample.command.match(/--type=([^\s]+)/)
  if (!typeMatch) {
    return 'helper'
  }

  const processType = typeMatch[1]
  if (processType === 'gpu-process') {
    return 'gpu'
  }

  if (processType === 'renderer') {
    if (sample.command.includes('--offscreen')) {
      return 'renderer-offscreen'
    }

    return 'renderer'
  }

  if (processType === 'utility') {
    return 'utility'
  }

  return processType
}

function summarizeRoleCpu(samples: ElectronProcessSample[]): Record<string, number> {
  return samples.reduce<Record<string, number>>((summary, sample) => {
    summary[sample.role] = (summary[sample.role] ?? 0) + sample.cpu
    return summary
  }, {})
}

function formatRoleSummary(samples: ElectronProcessSample[]): string {
  const summary = summarizeRoleCpu(samples)
  const orderedRoles = ['main', 'renderer', 'renderer-offscreen', 'gpu', 'utility', 'helper']
  const roles = [
    ...orderedRoles.filter((role) => summary[role] !== undefined),
    ...Object.keys(summary)
      .filter((role) => !orderedRoles.includes(role))
      .sort()
  ]

  return roles.map((role) => `${role}=${summary[role].toFixed(1)}%`).join(' ')
}

function formatProcessDetails(samples: ElectronProcessSample[]): string {
  return samples
    .sort((left, right) => right.cpu - left.cpu)
    .map((sample) => `${sample.role}[${sample.pid}]=${sample.cpu.toFixed(1)}%`)
    .join(' ')
}

async function sampleElectronCpuUsage(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,%cpu=,%mem=,command='])
    const samples = parsePsOutput(stdout)
    const processByPid = new Map(samples.map((sample) => [sample.pid, sample]))
    const rootPid = process.pid
    const electronSamples = samples
      .filter((sample) => isDescendantOfRoot(sample, rootPid, processByPid))
      .map<ElectronProcessSample>((sample) => ({
        ...sample,
        role: classifyElectronProcess(sample, rootPid)
      }))
      .filter((sample) => sample.pid === rootPid || sample.command.includes('Electron'))

    const totalCpu = electronSamples.reduce((total, sample) => total + sample.cpu, 0)
    appendCpuMonitorLine(
      `${new Date().toISOString()} total=${totalCpu.toFixed(1)}% ${formatRoleSummary(
        electronSamples
      )} | ${formatProcessDetails(electronSamples)}`
    )
  } catch (error) {
    appendCpuMonitorLine(
      `${new Date().toISOString()} ERROR ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

export function startElectronCpuMonitor(): void {
  if (cpuMonitorTimer) {
    return
  }

  const config = resolveCpuMonitorConfig()
  if (!config.enabled) {
    return
  }

  cpuMonitorConfig = config
  cpuMonitorLogPath = getCpuMonitorLogPath()
  previousSessions = readPreviousSessions(cpuMonitorLogPath, config.maxSessions)
  const sessionStartedAt = new Date()
  currentSessionLines = [
    `${SESSION_MARKER}${sessionStartedAt.toISOString()} local=${formatLocalTimestamp(
      sessionStartedAt
    )}`,
    `# pid=${process.pid} intervalMs=${config.intervalMs} maxSamples=${config.maxSamplesPerSession}`,
    `# env ${formatDiagnosticEnvSnapshot()}`
  ]
  writeCpuMonitorLog()

  console.info(`[CpuMonitor] Log CPU Electron: ${cpuMonitorLogPath}`)
  void sampleElectronCpuUsage()
  cpuMonitorTimer = setInterval(() => {
    void sampleElectronCpuUsage()
  }, config.intervalMs)
}

export function stopElectronCpuMonitor(): void {
  if (!cpuMonitorTimer) {
    return
  }

  clearInterval(cpuMonitorTimer)
  cpuMonitorTimer = null
  appendCpuMonitorLine(`${new Date().toISOString()} session-end`)
}
