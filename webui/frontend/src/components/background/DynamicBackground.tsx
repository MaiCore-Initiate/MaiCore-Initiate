import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useTheme, type ResolvedTheme } from '../theme/ThemeProvider'

const FALLBACK_BG_URL = '/default_backgrounds/default.jpg'
const BASE_BG_STORAGE_KEY = 'mcstart.base_bg_url'
const BASE_BG_CHANGE_EVENT = 'mcstart:base-bg-change'
const BG_SETTINGS_STORAGE_KEY = 'mcstart.bg_settings'
const BG_SETTINGS_CHANGE_EVENT = 'mcstart:bg-settings-change'

let baseBgUrlCache = FALLBACK_BG_URL

function normalizeBgUrl(url?: string | null) {
  const value = (url ?? '').trim()
  return value || FALLBACK_BG_URL
}

function writeBaseBgUrl(url: string) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(BASE_BG_STORAGE_KEY, url) } catch {}
}

function readBaseBgUrl() {
  if (typeof window === 'undefined') return FALLBACK_BG_URL
  try { return normalizeBgUrl(window.localStorage.getItem(BASE_BG_STORAGE_KEY)) } catch { return FALLBACK_BG_URL }
}

function setBaseBgUrl(url?: string | null) {
  const next = normalizeBgUrl(url)
  if (next === baseBgUrlCache) return
  baseBgUrlCache = next
  writeBaseBgUrl(next)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<string>(BASE_BG_CHANGE_EVENT, { detail: next }))
  }
}

export function getBaseBgUrl() {
  return baseBgUrlCache
}

export function useBaseBgUrl() {
  const [url, setUrl] = useState(() => getBaseBgUrl())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>
      setUrl(normalizeBgUrl(customEvent.detail))
    }
    window.addEventListener(BASE_BG_CHANGE_EVENT, onChange as EventListener)
    return () => window.removeEventListener(BASE_BG_CHANGE_EVENT, onChange as EventListener)
  }, [])
  return url
}

baseBgUrlCache = readBaseBgUrl()
writeBaseBgUrl(baseBgUrlCache)

export interface BgSettings {
  interval_minutes: number
  pinned_file: string
  overlay_opacity: number
  overlay_blur: number
  overlay_color: string
  overlay_color_auto?: boolean
  use_custom_background: boolean
}

const DEFAULT_SETTINGS: BgSettings = {
  interval_minutes: 5,
  pinned_file: '',
  overlay_opacity: 0.5,
  overlay_blur: 0,
  overlay_color: '255,255,255',
  overlay_color_auto: true,
  use_custom_background: false,
}

let bgSettingsCache = DEFAULT_SETTINGS

function mergeBgSettings(patch?: Partial<BgSettings> | null): BgSettings {
  const merged = { ...DEFAULT_SETTINGS, ...(patch || {}) }
  if (patch && !Object.prototype.hasOwnProperty.call(patch, 'overlay_color_auto')) {
    merged.overlay_color_auto = !patch.overlay_color || patch.overlay_color === DEFAULT_SETTINGS.overlay_color
  }
  return merged
}

function writeBgSettings(settings: BgSettings) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(BG_SETTINGS_STORAGE_KEY, JSON.stringify(settings)) } catch {}
}

function readBgSettings() {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(BG_SETTINGS_STORAGE_KEY)
    return mergeBgSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return DEFAULT_SETTINGS
  }
}

function setCachedBgSettings(settings?: Partial<BgSettings> | null) {
  const next = mergeBgSettings(settings)
  bgSettingsCache = next
  writeBgSettings(next)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<BgSettings>(BG_SETTINGS_CHANGE_EVENT, { detail: next }))
  }
}

export function getCachedBgSettings() {
  return bgSettingsCache
}

export function useCachedBgSettings() {
  const [settings, setSettings] = useState(() => getCachedBgSettings())
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onChange = (event: Event) => {
      const customEvent = event as CustomEvent<BgSettings>
      setSettings(mergeBgSettings(customEvent.detail))
    }
    window.addEventListener(BG_SETTINGS_CHANGE_EVENT, onChange as EventListener)
    return () => window.removeEventListener(BG_SETTINGS_CHANGE_EVENT, onChange as EventListener)
  }, [])
  return settings
}

function extractBackgroundFileName(url: string | null | undefined) {
  if (!url || !url.startsWith('/backgrounds/')) return ''
  return decodeURIComponent(url.slice('/backgrounds/'.length))
}

function isValidBackgroundUrl(url: string | null | undefined, settings: BgSettings, files: string[]) {
  const normalized = normalizeBgUrl(url)
  if (!settings.use_custom_background) {
    return normalized === FALLBACK_BG_URL
  }
  if (settings.pinned_file && files.includes(settings.pinned_file)) {
    return normalized === `/backgrounds/${settings.pinned_file}`
  }
  if (files.length === 0) {
    return normalized === FALLBACK_BG_URL
  }
  const currentFile = extractBackgroundFileName(normalized)
  return currentFile !== '' && files.includes(currentFile)
}

export function getThemeDefaultOverlayColor(theme: ResolvedTheme) {
  return theme === 'dark' ? '0,0,0' : '255,255,255'
}

export function resolveOverlayColor(settings: BgSettings, theme: ResolvedTheme) {
  if (settings.overlay_color_auto !== false) {
    return getThemeDefaultOverlayColor(theme)
  }
  return settings.overlay_color
}

export function resolveOverlayStyle(settings: BgSettings, theme: ResolvedTheme) {
  return {
    backgroundColor: `rgba(${resolveOverlayColor(settings, theme)},${settings.overlay_opacity})`,
    backdropFilter: settings.overlay_blur > 0 ? `blur(${settings.overlay_blur}px)` : undefined,
  }
}

bgSettingsCache = readBgSettings()
writeBgSettings(bgSettingsCache)

interface BgContextValue {
  currentBgUrl: string | null
  nextBgUrl: string | null
  isTransitioning: boolean
  settings: BgSettings
  refreshFiles: () => void
  refreshSettings: () => void
}

const BgContext = createContext<BgContextValue>({
  currentBgUrl: getBaseBgUrl(),
  nextBgUrl: getBaseBgUrl(),
  isTransitioning: false,
  settings: DEFAULT_SETTINGS,
  refreshFiles: () => {},
  refreshSettings: () => {},
})

export const useBgContext = () => useContext(BgContext)

export function BgProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<string[]>([])
  const [settings, setSettings] = useState<BgSettings>(() => getCachedBgSettings())
  const [currentBgUrl, setCurrentBgUrl] = useState<string | null>(() => getBaseBgUrl())
  const [nextBgUrl, setNextBgUrl] = useState<string | null>(() => getBaseBgUrl())
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const filesRef = useRef(files)
  filesRef.current = files
  const prevUrlRef = useRef(currentBgUrl)
  const selectionKeyRef = useRef('')

  const refreshFiles = useCallback(() => {
    setFilesLoaded(false)
    fetch('/api/settings/backgrounds', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const names = (d.files as { filename: string }[]).map(f => f.filename)
          setFiles(names)
        }
      })
      .catch(() => {})
      .finally(() => setFilesLoaded(true))
  }, [])

  const refreshSettings = useCallback(() => {
    setSettingsLoaded(false)
    fetch('/api/preferences/bg_settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.value) {
          const next = mergeBgSettings(d.value)
          setSettings(next)
          setCachedBgSettings(next)
        }
      })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true))
  }, [])
  useEffect(() => { refreshFiles(); refreshSettings() }, [])

  // Pick background URL based on settings + files
  const pickUrl = useCallback(() => {
    // If custom background is disabled, use default background
    if (!settings.use_custom_background) {
      return FALLBACK_BG_URL
    }
    const f = filesRef.current
    if (f.length === 0) return FALLBACK_BG_URL
    if (settings.pinned_file && f.includes(settings.pinned_file)) {
      return `/backgrounds/${settings.pinned_file}`
    }
    return `/backgrounds/${f[Math.floor(Math.random() * f.length)]}`
  }, [settings.pinned_file, settings.use_custom_background])

  const selectionKey = `${settings.use_custom_background ? '1' : '0'}|${settings.pinned_file}|${files.join('|')}`

  const resolvePreferredUrl = useCallback(() => {
    const cached = getBaseBgUrl()
    if (isValidBackgroundUrl(cached, settings, filesRef.current)) {
      return cached
    }
    const current = prevUrlRef.current
    if (isValidBackgroundUrl(current, settings, filesRef.current)) {
      return current
    }
    return pickUrl()
  }, [pickUrl, settings])

  // Initialize background once startup fetches are done
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!initialized && filesLoaded && settingsLoaded) {
      const url = resolvePreferredUrl()
      setCurrentBgUrl(url)
      setNextBgUrl(url)
      prevUrlRef.current = url
      selectionKeyRef.current = selectionKey
      setInitialized(true)
    }
  }, [filesLoaded, settingsLoaded, initialized, resolvePreferredUrl, selectionKey])

  // Apply background immediately when custom mode/pinned file/library changes
  useEffect(() => {
    if (!initialized) return
    if (selectionKeyRef.current === selectionKey) return
    selectionKeyRef.current = selectionKey
    setCurrentBgUrl(resolvePreferredUrl())
  }, [initialized, selectionKey, resolvePreferredUrl])

  // Handle background transition
  useEffect(() => {
    setBaseBgUrl(currentBgUrl)
  }, [currentBgUrl])

  useEffect(() => {
    if (currentBgUrl !== prevUrlRef.current) {
      prevUrlRef.current = currentBgUrl
      setNextBgUrl(currentBgUrl)
      setIsTransitioning(true)
      // Transition duration is 3s (matches CSS transition in DynamicBackground)
      const timer = setTimeout(() => setIsTransitioning(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [currentBgUrl])

  // Carousel timer
  useEffect(() => {
    if (!initialized || !settings.use_custom_background || settings.pinned_file || files.length <= 1) return
    const ms = Math.max(1, settings.interval_minutes) * 60000
    const id = setInterval(() => setCurrentBgUrl(pickUrl()), ms)
    return () => clearInterval(id)
  }, [initialized, settings.use_custom_background, settings.pinned_file, settings.interval_minutes, files.length, pickUrl])

  return (
    <BgContext.Provider value={{ currentBgUrl, nextBgUrl, isTransitioning, settings, refreshFiles, refreshSettings }}>
      {children}
    </BgContext.Provider>
  )
}

const VIDEO_EXTS = ['.mp4', '.webm']
function isVideo(url: string) { return VIDEO_EXTS.some(e => url.toLowerCase().endsWith(e)) }

export default function DynamicBackground() {
  const { currentBgUrl, settings } = useBgContext()
  const { resolvedTheme } = useTheme()
  const [bgA, setBgA] = useState<string | null>(currentBgUrl)
  const [bgB, setBgB] = useState<string | null>(null)
  const [showA, setShowA] = useState(true)
  const prevUrl = useRef(currentBgUrl)

  useEffect(() => {
    if (currentBgUrl === prevUrl.current) return
    prevUrl.current = currentBgUrl
    if (showA) {
      setBgB(currentBgUrl)
      setShowA(false)
    } else {
      setBgA(currentBgUrl)
      setShowA(true)
    }
  }, [currentBgUrl])

  // 未拿到可用背景时交给 App 的基层背景层兜底
  if (currentBgUrl === null) {
    return null
  }

  const renderLayer = (url: string | null, visible: boolean, key: string) => (
    <div key={key} className="absolute inset-0" style={{ opacity: visible ? 1 : 0, transition: 'opacity 3s' }}>
      {url && (isVideo(url) ? (
        <video src={url} autoPlay muted loop playsInline className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${url}')` }} />
      ))}
    </div>
  )

  return (
    <>
      {renderLayer(bgA, showA, 'bg-a')}
      {renderLayer(bgB, !showA, 'bg-b')}
      <div className="absolute inset-0" style={resolveOverlayStyle(settings, resolvedTheme)} />
    </>
  )
}
