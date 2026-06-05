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
import ChatPanel from '../components/ChatPanel'
import Avatar from '../components/Avatar'
import { useSync } from '../hooks/useSync'
import { useRoomClock } from '../hooks/useRoomClock'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { hlsWarmup, getConfig } from '../lib/api'
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

  // ── Room clock loop ── (hold when anyone is buffering) ──────────────────────
  useRoomClock(playerRef, clock, bufferingCount > 0)

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
        return
      }
      if (event.sourceType && event.sourceValue) {
        const s = { type: event.sourceType, value: event.sourceValue }
        setSource(s)
        sourceRef.current = s
      }
    }, []),
    onBuffering: useCallback((count: number) => setBufferingCount(count), []),
    onParticipants: useCallback((count: number, previousCount: number) => {
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
    setClock({ type: 'clock', position, playing, updatedAt: new Date().toISOString(), receivedAt: Date.now() })
  }

  // ── User actions → send to server (server updates clock) ──────────────────
  function handleUserPlay(t: number) {
    const src = sourceRef.current
    if (src?.value.includes('/api/hls/manifest')) hlsWarmup(src.value, t)
    optimisticClock(t, true)
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
    const s = { type, value }
    setSource(s); sourceRef.current = s
    sendEvent({ type: 'source-change', currentTime: 0, sourceType: type, sourceValue: value })
  }

  function handleResetSource() {
    sendEvent({ type: 'source-reset', currentTime: 0 })
    // local clear (server also broadcasts back)
    setSource(null); sourceRef.current = null; setClock(null)
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }

  function handleHomeButton() {
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col">
      {!backendHealthy && <BackendDownOverlay />}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <button onClick={handleHomeButton} className="flex items-center gap-2 font-semibold text-gray-200">
          <img src="/logo.svg" alt="SyncWatch" className="w-7 h-7" />
          SyncWatch
        </button>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full
            ${connected ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse'}`} />
            {connected ? 'Подключено' : 'Нет связи...'}
          </span>
          <span className="flex items-center -space-x-1.5">
            {Array.from({ length: Math.min(participants, 4) }).map((_, i) => (
              <Avatar
                key={i}
                // first slot = me (real seed), others stable per room slot
                seed={i === 0 ? senderId : `${roomId}-${i}`}
                size={24}
                className="ring-2 ring-gray-900"
              />
            ))}
            <span className="text-gray-500 pl-2.5">{participants} / 2</span>
          </span>
          <span>Комната: <span className="font-mono text-violet-400">{roomId}</span></span>
          {source && (
            <button onClick={handleResetSource}
              className="px-3 py-1 bg-gray-800 hover:bg-red-900/60 hover:text-red-300 rounded-lg transition-colors">
              ✕ Сбросить видео
            </button>
          )}
          <button onClick={copyLink}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
            {copied ? '✓ Скопировано' : 'Поделиться'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4">
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
                />
              ) : (
                <VideoPlayer
                  ref={playerRef}
                  src={source.value}
                  onUserPlay={handleUserPlay}
                  onUserPause={handleUserPause}
                  onUserSeek={handleUserSeek}
                  onBufferingChange={handleBufferingChange}
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
