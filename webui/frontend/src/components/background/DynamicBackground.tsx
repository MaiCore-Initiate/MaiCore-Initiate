import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'

export interface BgSettings {
  interval_minutes: number
  pinned_file: string
  overlay_opacity: number
  overlay_blur: number
  overlay_color: string
  use_custom_background: boolean
}

const DEFAULT_SETTINGS: BgSettings = {
  interval_minutes: 5,
  pinned_file: '',
  overlay_opacity: 0.5,
  overlay_blur: 0,
  overlay_color: '255,255,255',
  use_custom_background: false,
}

interface BgContextValue {
  currentBgUrl: string
  nextBgUrl: string
  isTransitioning: boolean
  settings: BgSettings
  refreshFiles: () => void
  refreshSettings: () => void
}

const BgContext = createContext<BgContextValue>({
  currentBgUrl: '/default_backgrounds/default.jpg',
  nextBgUrl: '/default_backgrounds/default.jpg',
  isTransitioning: false,
  settings: DEFAULT_SETTINGS,
  refreshFiles: () => {},
  refreshSettings: () => {},
})

export const useBgContext = () => useContext(BgContext)

export function BgProvider({ children }: { children: ReactNode }) {
  const [files, setFiles] = useState<string[]>([])
  const [settings, setSettings] = useState<BgSettings>(DEFAULT_SETTINGS)
  const [currentBgUrl, setCurrentBgUrl] = useState('/default_backgrounds/default.jpg')
  const [nextBgUrl, setNextBgUrl] = useState('/default_backgrounds/default.jpg')
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
      .then(d => { if (d?.value) setSettings({ ...DEFAULT_SETTINGS, ...d.value }) })
      .catch(() => {})
      .finally(() => setSettingsLoaded(true))
  }, [])
  useEffect(() => { refreshFiles(); refreshSettings() }, [])

  // Pick background URL based on settings + files
  const pickUrl = useCallback(() => {
    // If custom background is disabled, use default background
    if (!settings.use_custom_background) {
      return '/default_backgrounds/default.jpg'
    }
    const f = filesRef.current
    if (f.length === 0) return '/default_backgrounds/default.jpg'
    if (settings.pinned_file && f.includes(settings.pinned_file)) {
      return `/backgrounds/${settings.pinned_file}`
    }
    return `/backgrounds/${f[Math.floor(Math.random() * f.length)]}`
  }, [settings.pinned_file, settings.use_custom_background])

  const selectionKey = `${settings.use_custom_background ? '1' : '0'}|${settings.pinned_file}|${files.join('|')}`

  // Initialize background once startup fetches are done
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!initialized && filesLoaded && settingsLoaded) {
      const url = pickUrl()
      setCurrentBgUrl(url)
      setNextBgUrl(url)
      prevUrlRef.current = url
      selectionKeyRef.current = selectionKey
      setInitialized(true)
    }
  }, [filesLoaded, settingsLoaded, initialized, pickUrl, selectionKey])

  // Apply background immediately when custom mode/pinned file/library changes
  useEffect(() => {
    if (!initialized) return
    if (selectionKeyRef.current === selectionKey) return
    selectionKeyRef.current = selectionKey
    setCurrentBgUrl(pickUrl())
  }, [initialized, selectionKey, pickUrl])

  // Handle background transition
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
  const [bgA, setBgA] = useState(currentBgUrl)
  const [bgB, setBgB] = useState('')
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

  const renderLayer = (url: string, visible: boolean, key: string) => (
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
      <div className="absolute inset-0 bg-white" />
      {renderLayer(bgA, showA, 'bg-a')}
      {renderLayer(bgB, !showA, 'bg-b')}
      <div className="absolute inset-0" style={{
        background: `rgba(${settings.overlay_color},${settings.overlay_opacity})`,
        backdropFilter: settings.overlay_blur > 0 ? `blur(${settings.overlay_blur}px)` : undefined,
      }} />
    </>
  )
}
