import { useCallback, useRef, useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import SourcePicker from '../components/SourcePicker'
import RezkaPicker from '../components/RezkaPicker'
import YouTubePlayer from '../components/YouTubePlayer'
import VideoPlayer from '../components/VideoPlayer'
import WaitingOverlay from '../components/WaitingOverlay'
import PartnerBufferingOverlay from '../components/PartnerBufferingOverlay'
import BackendDownOverlay from '../components/BackendDownOverlay'
import JoiningOverlay from '../components/JoiningOverlay'
import RoomNotFound from '../components/RoomNotFound'
import ChatPanel from '../components/ChatPanel'
import Avatar from '../components/Avatar'
import { useSync } from '../hooks/useSync'
import { useRoomClock } from '../hooks/useRoomClock'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useTheme } from '../hooks/useTheme'
import { hlsWarmup, getConfig, getRoom } from '../lib/api'
import { toProxiedUrl } from '../lib/hls'
import type { PlayerHandle } from '../components/YouTubePlayer'
import type { ChatMessage, ClockEvent, PlayerEvent, SourceType } from '../lib/types'

const senderId = uuidv4()

interface Source { type: SourceType; value: string }

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>()

  const navigate = useNavigate()

  const [source, setSource] = useState<Source | null>(null)
  const [copied, setCopied] = useState(false)
  const [connected, setConnected] = useState(true)
  const [participants, setParticipants] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'url' | 'rezka'>('rezka')
  const [clock, setClock] = useState<ClockEvent | null>(null)
  const [bufferingCount, setBufferingCount] = useState(0)
  const [rezkaEnabled, setRezkaEnabled] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [joining, setJoining] = useState(true)   // "connecting to session" overlay
  const [roomStatus, setRoomStatus] = useState<'checking' | 'ok' | 'notfound'>('checking')

  // Validate the room exists, and seed the live participant count
  useEffect(() => {
    if (!roomId) return
    getRoom(roomId)
      .then((room) => {
        setRoomStatus('ok')
        // seed count, but never clobber a fresher value already set via WS broadcast
        if (typeof room.participantCount === 'number') {
          setParticipants((prev) => Math.max(prev, room.participantCount))
        }
      })
      .catch(() => setRoomStatus('notfound'))
  }, [roomId])

  // safety: never trap the user behind the joining overlay
  useEffect(() => {
    const t = setTimeout(() => setJoining(false), 20000)
    return () => clearTimeout(t)
  }, [])

  // Load feature flags
  useEffect(() => {
    getConfig().then((cfg) => {
      setRezkaEnabled(cfg.rezkaEnabled)
      if (!cfg.rezkaEnabled) setSidebarTab('url')   // fall back when HDRezka is off
    })
  }, [])

  const playerRef = useRef<PlayerHandle>(null)
  const sendEventRef = useRef<((e: Omit<PlayerEvent, 'senderId'>) => void) | null>(null)
  const sourceRef = useRef<Source | null>(null)
  const isHostRef = useRef(false)
  const localBuffering = useRef(false)
  const wasPlayingRef = useRef(false)   // intended play state (for buffering resume)
  const lastActionRef = useRef(0)   // timestamp of last local play/pause/seek

  // Sync browser online/offline
  useEffect(() => {
    const off = () => setConnected(false)
    const on = () => setConnected(true)
    window.addEventListener('offline', off)
    window.addEventListener('online', on)
    return () => { window.removeEventListener('offline', off); window.removeEventListener('online', on) }
  }, [])

  // ── Backend health ──────────────────────────────────────────────────────────
  const backendHealthy = useBackendHealth()
  const { theme, toggle: toggleTheme } = useTheme()

  // ── Room clock loop ── (hold when anyone is buffering) ──────────────────────
  useRoomClock(playerRef, clock, bufferingCount > 0, lastActionRef)

  // ── WebSocket sync ─────────────────────────────────────────────────────────
  const { sendEvent, sendChat } = useSync({
    roomId: roomId!,
    senderId,
    onClock: setClock,
    onChat: useCallback((msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg])
    }, []),
    onChatHistory: useCallback((msgs: ChatMessage[]) => {
      setMessages(msgs)
    }, []),
    onSourceChange: useCallback((event: PlayerEvent) => {
      if (event.type === 'source-reset') {
        setSource(null)
        sourceRef.current = null
        setClock(null)
        setBufferingCount(0)         // clear any stuck "ждём партнёра" overlay
        localBuffering.current = false
        return
      }
      if (event.sourceType && event.sourceValue) {
        const s = { type: event.sourceType, value: event.sourceValue }
        setSource(s)
        sourceRef.current = s
        setBufferingCount(0)         // new source — reset buffering state
        localBuffering.current = false
      }
    }, []),
    onBuffering: useCallback((count: number) => setBufferingCount(count), []),
    onInitialState: useCallback((hasSource: boolean) => {
      // No video in the room yet → nothing to buffer, session is ready.
      // If there is a source, we keep the overlay until the player reports ready.
      if (!hasSource) setJoining(false)
    }, []),
    // ── Barrier: prepare → seek + buffer → tell server we're ready ──────────
    onPrepare: useCallback((position: number) => {
      const p = playerRef.current
      const send = sendEventRef.current
      if (!p) return
      lastActionRef.current = Date.now()
      p.pause()   // hold until everyone is ready (the initiator too)
      p.prepare(position).then(() => {
        send?.({ type: 'ready', currentTime: position })
      })
    }, []),
    // ── Barrier: go → everyone starts together (already buffered) ───────────
    onGo: useCallback((position: number) => {
      const p = playerRef.current
      if (!p) return
      lastActionRef.current = Date.now()
      wasPlayingRef.current = true
      p.seekTo(position)
      p.play()
      setClock({ type: 'clock', position, playing: true, updatedAt: new Date().toISOString(), receivedAt: Date.now() })
    }, []),
    onParticipants: useCallback((count: number, previousCount: number) => {
      // equal values = a seed/refresh (not a real join/leave) → don't clobber a fresher value
      if (count === previousCount) {
        setParticipants((prev) => Math.max(prev, count))
        return
      }
      setParticipants(count)
      const someoneLeft = count < previousCount
      const someoneJoined = count > previousCount && count >= 2

      if (someoneLeft && count < 2) {
        setWaiting(true)
        isHostRef.current = true
      }

      if (someoneJoined) {
        setWaiting(false)
        // Re-broadcast source to newly joined client
        setTimeout(() => {
          const src = sourceRef.current
          const send = sendEventRef.current
          if (src && send) {
            send({ type: 'source-change', currentTime: 0, sourceType: src.type, sourceValue: src.value })
          }
          isHostRef.current = false
        }, 500)
      }
    }, []),
    onDisconnect: useCallback(() => setConnected(false), []),
    onReconnect: useCallback(() => setConnected(true), []),
  })

  sendEventRef.current = sendEvent

  // Optimistically update the local clock so the clock loop doesn't fight
  // the user's own action while the server round-trip is in flight.
  function optimisticClock(position: number, playing: boolean) {
    lastActionRef.current = Date.now()   // grace window: keep clock loop off our back
    setClock({ type: 'clock', position, playing, updatedAt: new Date().toISOString(), receivedAt: Date.now() })
  }

  // ── User actions → send to server (server updates clock) ──────────────────
  function handleUserPlay(t: number) {
    const src = sourceRef.current
    if (src?.value.includes('/api/hls/manifest')) hlsWarmup(src.value, t)
    // don't start locally — the server barrier will drive a synchronized start (prepare → go)
    optimisticClock(t, false)
    sendEvent({ type: 'play', currentTime: t })
  }
  function handleUserPause(t: number) {
    optimisticClock(t, false)
    sendEvent({ type: 'pause', currentTime: t })
  }
  function handleUserSeek(t: number) {
    // keep current play/pause state, just move position
    optimisticClock(t, clock?.playing ?? false)
    sendEvent({ type: 'seek', currentTime: t })
  }

  function handleBufferingChange(isBuffering: boolean) {
    localBuffering.current = isBuffering
    sendEvent({
      type: isBuffering ? 'buffering-start' : 'buffering-end',
      currentTime: playerRef.current?.getCurrentTime() ?? 0,
    })
  }

  function handleSource(type: SourceType, value: string) {
    // route HLS through the caching proxy (covers both manual URLs and HDRezka)
    const finalValue = type === 'url' ? toProxiedUrl(value) : value
    const s = { type, value: finalValue }
    setSource(s); sourceRef.current = s
    sendEvent({ type: 'source-change', currentTime: 0, sourceType: type, sourceValue: finalValue })
  }

  function handleResetSource() {
    sendEvent({ type: 'source-reset', currentTime: 0 })
    // local clear (server also broadcasts back)
    setSource(null); sourceRef.current = null; setClock(null)
    setBufferingCount(0); localBuffering.current = false
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function handleHomeButton() {
    navigate('/')
  }

  // Room doesn't exist → show a friendly screen instead of joining a phantom room
  if (roomStatus === 'notfound') {
    return <RoomNotFound />
  }

  return (
    <div className="min-h-screen flex flex-col">
      {!backendHealthy && <BackendDownOverlay />}
      {joining && backendHealthy && roomStatus === 'ok' && <JoiningOverlay />}

      {/* Header */}
      <div className="safe-top safe-x flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5
                      px-4 sm:px-6  bg-gray-900 border-b border-gray-800">
        <button onClick={handleHomeButton} className="flex items-center gap-2 font-semibold text-gray-200 shrink-0 pr-2 py-4 px-4">
          <img src="/logo.svg" alt="SyncWatch" className="w-10 h-10 sm:w-9 sm:h-9" />
          <span className="hidden sm:inline">SyncWatch</span>
        </button>

        <div className="flex items-center gap-2.5 sm:gap-3 text-sm text-gray-400 flex-wrap justify-end pr-4">
          {/* connection: dot always, label only on ≥sm */}
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full
            ${connected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
            <span className="hidden sm:inline">{connected ? 'Подключено' : 'Нет связи...'}</span>
          </span>

          {/* participants */}
          <span className="flex items-center -space-x-1.5">
            {Array.from({ length: Math.min(participants, 4) }).map((_, i) => (
              <Avatar
                key={i}
                seed={i === 0 ? senderId : `${roomId}-${i}`}
                size={24}
                className="ring-2 ring-gray-900"
              />
            ))}
            <span className="text-gray-500 pl-2.5">{participants}/2</span>
          </span>

          {/* room code — label hidden on mobile */}
          <span className="text-xs sm:text-sm">
            <span className="hidden sm:inline">Комната: </span>
            <span className="font-mono text-violet-400">{roomId}</span>
          </span>

          {source && (
            <button onClick={handleResetSource} title="Сбросить видео"
              className="px-3 py-2 sm:py-1 bg-gray-800 hover:bg-red-900/60 hover:text-red-300 rounded-lg transition-colors">
              <span className="sm:hidden">✕</span>
              <span className="hidden sm:inline">✕ Сбросить видео</span>
            </button>
          )}
          <button onClick={toggleTheme} title="Сменить тему"
            className="px-3 py-2 sm:py-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={copyLink} title="Поделиться"
            className="px-3 py-2  sm:py-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            <span className="sm:hidden">{copied ? '✓' : '🔗'}</span>
            <span className="hidden sm:inline">{copied ? '✓ Скопировано' : 'Поделиться'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-3 sm:p-4 safe-x safe-bottom">
        {/* Player */}
        <div className="flex-1 flex flex-col gap-4">
          <div className="relative">
            {waiting && <WaitingOverlay />}
            {/* show overlay when a partner is buffering (count exceeds our own contribution) */}
            {!waiting && bufferingCount > (localBuffering.current ? 1 : 0) && <PartnerBufferingOverlay />}
            {source ? (
              source.type === 'youtube' ? (
                <YouTubePlayer
                  ref={playerRef}
                  videoId={source.value}
                  onUserPlay={handleUserPlay}
                  onUserPause={handleUserPause}
                  onUserSeek={handleUserSeek}
                  onReady={() => setJoining(false)}
                />
              ) : (
                <VideoPlayer
                  ref={playerRef}
                  src={source.value}
                  onUserPlay={handleUserPlay}
                  onUserPause={handleUserPause}
                  onUserSeek={handleUserSeek}
                  onBufferingChange={handleBufferingChange}
                  onReady={() => setJoining(false)}
                />
              )
            ) : (
              <div className="flex items-center justify-center bg-gray-900 rounded-xl aspect-video text-gray-600">
                Выберите видео для просмотра
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:w-80 flex flex-col gap-3">
          {/* Tab switcher — only shown when HDRezka feature is enabled */}
          {rezkaEnabled && (
            <div className="flex gap-1 p-1 bg-gray-900 rounded-xl">
              <button onClick={() => setSidebarTab('rezka')}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${sidebarTab === 'rezka' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                🎬 HDRezka
              </button>
              <button onClick={() => setSidebarTab('url')}
                className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${sidebarTab === 'url' ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
                🔗 URL / Файл
              </button>
            </div>
          )}
          <div className="p-4 bg-gray-900 rounded-xl">
            {rezkaEnabled && sidebarTab === 'rezka'
              ? <RezkaPicker onSource={handleSource} />
              : <SourcePicker roomId={roomId!} currentSource={source?.value} onSource={handleSource} />}
          </div>

          {/* Chat */}
          <ChatPanel messages={messages} myId={senderId} onSend={sendChat} />
        </div>
      </div>
    </div>
  )
}
