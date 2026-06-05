import { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import Hls from 'hls.js'
import type { PlayerHandle } from './YouTubePlayer'

interface Props {
  src: string
  onUserPlay:  (time: number) => void
  onUserPause: (time: number) => void
  onUserSeek:  (time: number) => void
  onBufferingChange?: (isBuffering: boolean) => void
}

const SUPPRESS_MS       = 500
const BUFFER_DEBOUNCE   = 700   // only report buffering if stall persists this long

function isHls(src: string) {
  return src.includes('.m3u8') || src.includes('/api/hls/manifest')
}

const VideoPlayer = forwardRef<PlayerHandle, Props>(({ src, onUserPlay, onUserPause, onUserSeek, onBufferingChange }, ref) => {
  const videoRef        = useRef<HTMLVideoElement>(null)
  const suppressUntil   = useRef(0)
  const bufferDebounce  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferReported  = useRef(false)
  const hlsRef          = useRef<Hls | null>(null)
  const [buffering, setBuffering] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [retrying, setRetrying]   = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)  // Chrome autoplay block

  const suppress     = () => { suppressUntil.current = Date.now() + SUPPRESS_MS }
  const isSuppressed = () => Date.now() < suppressUntil.current

  // Report real buffering (debounced) — ignores short stalls from seeks
  const onStall = () => {
    setBuffering(true)
    if (bufferDebounce.current) return
    bufferDebounce.current = setTimeout(() => {
      bufferDebounce.current = null
      if (!bufferReported.current) {
        bufferReported.current = true
        onBufferingChange?.(true)
      }
    }, BUFFER_DEBOUNCE)
  }

  const onResume = () => {
    setBuffering(false)
    if (bufferDebounce.current) { clearTimeout(bufferDebounce.current); bufferDebounce.current = null }
    if (bufferReported.current) {
      bufferReported.current = false
      onBufferingChange?.(false)
    }
  }

  useImperativeHandle(ref, () => ({
    play: () => {
      suppress()
      videoRef.current?.play()
        .then(() => setNeedsGesture(false))
        .catch((err) => {
          // Chrome blocks autoplay without a user gesture
          if (err?.name === 'NotAllowedError') setNeedsGesture(true)
        })
    },
    pause: () => {
      suppress()
      videoRef.current?.pause()
    },
    seekTo: (t) => {
      suppress()
      if (videoRef.current) videoRef.current.currentTime = t
    },
    setPlaybackRate: (r) => {
      if (videoRef.current) videoRef.current.playbackRate = r
    },
    getCurrentTime:  () => videoRef.current?.currentTime ?? 0,
    getIsPlaying:    () => !(videoRef.current?.paused ?? true),
  }))

  // HLS setup
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setError(null); setRetrying(false); setBuffering(false)

    if (!isHls(src)) { video.src = src; return }
    if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; return }

    if (!Hls.isSupported()) { setError('Браузер не поддерживает HLS'); return }

    setBuffering(true)
    const hls = new Hls({
      maxBufferLength: 60, maxMaxBufferLength: 120,
      lowLatencyMode: false, enableWorker: true,
      fragLoadingMaxRetry: 2, fragLoadingRetryDelay: 1000,
    })
    hlsRef.current = hls
    hls.loadSource(src)
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, () => setBuffering(false))
    hls.on(Hls.Events.FRAG_LOADED,     () => { setError(null); setRetrying(false) })
    hls.on(Hls.Events.ERROR, (_e, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        setError('Ошибка сети. Повторяем...'); setRetrying(true); hls.startLoad()
      } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
        setError('Ошибка декодирования...'); setRetrying(true); hls.recoverMediaError()
      } else {
        setError('Не удалось загрузить поток'); hls.destroy()
      }
    })
    return () => { hls.destroy(); hlsRef.current = null }
  }, [src])

  const handleRetry = useCallback(() => {
    setError(null); setRetrying(true)
    hlsRef.current?.startLoad()
  }, [])

  // User gesture to unblock Chrome autoplay — plays within the click handler
  const handleGesturePlay = useCallback(() => {
    suppress()
    videoRef.current?.play()
      .then(() => setNeedsGesture(false))
      .catch(() => {})
  }, [])

  return (
    <div className="relative w-full aspect-video">
      <video
        ref={videoRef}
        controls
        className="w-full h-full bg-black rounded-xl"
        onPlay={() => {
          // hls.js uses 'waiting'/'stalled' for buffering, never 'pause',
          // so play/pause events here are genuine user/programmatic actions.
          if (!isSuppressed()) onUserPlay(videoRef.current?.currentTime ?? 0)
        }}
        onPause={() => {
          if (!isSuppressed()) onUserPause(videoRef.current?.currentTime ?? 0)
        }}
        onSeeked={() => {
          if (!isSuppressed()) onUserSeek(videoRef.current?.currentTime ?? 0)
        }}
        onWaiting={onStall}
        onStalled={onStall}
        onPlaying={onResume}
        onCanPlayThrough={onResume}
      />

      {/* Chrome autoplay block — needs a user gesture */}
      {needsGesture && (
        <button
          onClick={handleGesturePlay}
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4
                     bg-gray-950/80 backdrop-blur-sm rounded-xl cursor-pointer">
          <span className="w-20 h-20 flex items-center justify-center rounded-full
                           bg-violet-600 hover:bg-violet-500 transition-colors text-3xl">▶</span>
          <span className="text-gray-200 font-medium">Нажмите, чтобы начать синхронный просмотр</span>
          <span className="text-gray-500 text-sm">Chrome требует клик для запуска со звуком</span>
        </button>
      )}

      {buffering && !error && !needsGesture && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 bg-black/60 px-5 py-4 rounded-xl">
            <span className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-gray-300">Буферизация...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3
                        bg-gray-900/95 border border-red-800 px-4 py-3 rounded-xl text-sm w-max max-w-sm">
          <span className="text-lg flex-shrink-0">{retrying ? '🔄' : '⚠️'}</span>
          <span className="text-gray-200 flex-1">{error}</span>
          {!retrying && (
            <button onClick={handleRetry}
              className="ml-2 px-3 py-1 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs font-medium flex-shrink-0">
              Повторить
            </button>
          )}
        </div>
      )}
    </div>
  )
})

export default VideoPlayer
