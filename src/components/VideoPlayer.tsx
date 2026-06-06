import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react'
import Hls from 'hls.js'
import type {PlayerHandle} from './YouTubePlayer'

interface Props {
    src: string
    onUserPlay: (time: number) => void
    onUserPause: (time: number) => void
    onUserSeek: (time: number) => void
    onBufferingChange?: (isBuffering: boolean) => void
    onReady?: () => void   // fired once the media is ready to play
}

const SUPPRESS_MS = 500
// Only coordinate a room-wide pause if a stall really persists — short hiccups
// (segment boundaries, brief network jitter) shouldn't freeze both clients.
const BUFFER_DEBOUNCE = 2500
// Right after a seek, buffering is expected and likely to desync the room, so
// report it quickly to freeze both clients before noticeable jank.
const BUFFER_DEBOUNCE_SEEK = 600
const POST_SEEK_WINDOW_MS = 6000

function isHls(src: string) {
    return src.includes('.m3u8') || src.includes('/api/hls/manifest')
}

// Seek that prefers fastSeek() (more reliable for native HLS on WebKit/iOS),
// and clamps the target into the seekable range so iOS doesn't reject & revert it.
function seekVideo(v: HTMLVideoElement | null, t: number) {
    if (!v) return
    let target = t
    try {
        const ranges = v.seekable
        if (ranges && ranges.length > 0) {
            const start = ranges.start(0)
            const end = ranges.end(ranges.length - 1)
            target = Math.min(Math.max(t, start), Math.max(start, end - 0.3))
        }
    } catch { /* seekable not ready */
    }
    if (typeof v.fastSeek === 'function') {
        v.fastSeek(target)
    } else {
        v.currentTime = target
    }
}

const VideoPlayer = forwardRef<PlayerHandle, Props>(({
                                                         src,
                                                         onUserPlay,
                                                         onUserPause,
                                                         onUserSeek,
                                                         onBufferingChange,
                                                         onReady
                                                     }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const suppressUntil = useRef(0)
    const bufferDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
    const bufferReported = useRef(false)
    const readyFired = useRef(false)
    const lastTime = useRef(0)
    const fsSettleUntil = useRef(0)   // ignore stalls right around fullscreen transitions
    const postSeekUntil = useRef(0)   // report buffering faster shortly after a seek
    const hlsRef = useRef<Hls | null>(null)
    const [buffering, setBuffering] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [retrying, setRetrying] = useState(false)
    const [needsGesture, setNeedsGesture] = useState(false)  // Chrome autoplay block

    const suppress = () => {
        suppressUntil.current = Date.now() + SUPPRESS_MS
    }
    const isSuppressed = () => Date.now() < suppressUntil.current

    // Report real buffering (debounced) — ignores short stalls from seeks
    const onStall = () => {
        // Safari fires transient waiting/seeking around fullscreen enter/exit — ignore those
        if (Date.now() < fsSettleUntil.current) return
        setBuffering(true)
        if (bufferDebounce.current) return
        const delay = Date.now() < postSeekUntil.current ? BUFFER_DEBOUNCE_SEEK : BUFFER_DEBOUNCE
        bufferDebounce.current = setTimeout(() => {
            bufferDebounce.current = null
            if (!bufferReported.current) {
                bufferReported.current = true
                onBufferingChange?.(true)
            }
        }, delay)
    }

    const onResume = () => {
        setBuffering(false)
        if (bufferDebounce.current) {
            clearTimeout(bufferDebounce.current);
            bufferDebounce.current = null
        }
        if (bufferReported.current) {
            bufferReported.current = false
            onBufferingChange?.(false)
        }
    }

    const fireReady = () => {
        if (!readyFired.current) {
            readyFired.current = true
            onReady?.()
        }
    }

    useImperativeHandle(ref, () => ({
        play: () => {
            suppress()
            videoRef.current?.play()
                .then(() => setNeedsGesture(false))
                .catch((err) => {
                    // Autoplay blocked without a user gesture (Chrome/Safari/iOS)
                    if (err?.name === 'NotAllowedError') setNeedsGesture(true)
                })
        },
        pause: () => {
            suppress()
            videoRef.current?.pause()
        },
        seekTo: (t) => {
            suppress()
            postSeekUntil.current = Date.now() + POST_SEEK_WINDOW_MS
            seekVideo(videoRef.current, t)
        },
        setPlaybackRate: (r) => {
            if (videoRef.current) videoRef.current.playbackRate = r
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getIsPlaying: () => !(videoRef.current?.paused ?? true),
        prepare: (t) => new Promise<void>((resolve) => {
            const v = videoRef.current
            if (!v) {
                resolve();
                return
            }
            suppress()
            postSeekUntil.current = Date.now() + POST_SEEK_WINDOW_MS
            seekVideo(v, t)
            // HAVE_FUTURE_DATA = enough buffered to start playing
            if (v.readyState >= 3) {
                resolve();
                return
            }
            let done = false
            const finish = () => {
                if (done) return;
                done = true;
                cleanup();
                resolve()
            }
            const cleanup = () => {
                clearTimeout(safety)
                v.removeEventListener('canplay', finish)
                v.removeEventListener('canplaythrough', finish)
            }
            const safety = setTimeout(finish, 8000)   // never block the barrier forever
            v.addEventListener('canplay', finish, {once: true})
            v.addEventListener('canplaythrough', finish, {once: true})
        }),
    }))

    // iOS inline playback — set BOTH the property and legacy attributes,
    // otherwise iPhone Safari forces the video into fullscreen on play.
    useEffect(() => {
        const v = videoRef.current
        if (!v) return
        v.playsInline = true
        ;(v as any).webkitPlaysInline = true
        v.setAttribute('playsinline', 'true')
        v.setAttribute('webkit-playsinline', 'true')
        v.setAttribute('x-webkit-airplay', 'allow')

        // Around fullscreen enter/exit, Safari emits transient waiting/seeking events.
        // Open a settle window where we ignore stalls and clear any false buffering.
        const onFsTransition = () => {
            fsSettleUntil.current = Date.now() + 2000
            onResume()   // drop any pending/active (false) buffering
        }
        v.addEventListener('webkitbeginfullscreen', onFsTransition)
        v.addEventListener('webkitendfullscreen', onFsTransition)
        document.addEventListener('fullscreenchange', onFsTransition)
        return () => {
            v.removeEventListener('webkitbeginfullscreen', onFsTransition)
            v.removeEventListener('webkitendfullscreen', onFsTransition)
            document.removeEventListener('fullscreenchange', onFsTransition)
        }
    }, [])

    // HLS setup
    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        setError(null);
        setRetrying(false);
        setBuffering(false)
        readyFired.current = false   // new source — wait for it to become playable

        if (!isHls(src)) {
            video.src = src;
            return
        }
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src;
            return
        }

        if (!Hls.isSupported()) {
            setError('Браузер не поддерживает HLS');
            return
        }

        setBuffering(true)
        const hls = new Hls({
            // hold a generous buffer so playback survives slow segments
            maxBufferLength: 120, maxMaxBufferLength: 300, backBufferLength: 30,
            lowLatencyMode: false, enableWorker: true,
            fragLoadingMaxRetry: 4, fragLoadingRetryDelay: 800,
        })
        hlsRef.current = hls
        hls.loadSource(src)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => setBuffering(false))
        hls.on(Hls.Events.FRAG_LOADED, () => {
            setError(null);
            setRetrying(false)
        })
        hls.on(Hls.Events.ERROR, (_e, d) => {
            if (!d.fatal) return
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                setError('Ошибка сети. Повторяем...');
                setRetrying(true);
                hls.startLoad()
            } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                setError('Ошибка декодирования...');
                setRetrying(true);
                hls.recoverMediaError()
            } else {
                setError('Не удалось загрузить поток');
                hls.destroy()
            }
        })
        return () => {
            hls.destroy();
            hlsRef.current = null
        }
    }, [src])

    const handleRetry = useCallback(() => {
        setError(null);
        setRetrying(true)
        hlsRef.current?.startLoad()
    }, [])

    // User gesture to unblock Chrome autoplay — plays within the click handler
    const handleGesturePlay = useCallback(() => {
        suppress()
        videoRef.current?.play()
            .then(() => setNeedsGesture(false))
            .catch(() => {
            })
    }, [])

    return (
        <div className="relative w-full aspect-video">
            <video
                ref={videoRef}
                controls
                playsInline
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
                    postSeekUntil.current = Date.now() + POST_SEEK_WINDOW_MS
                    if (!isSuppressed()) onUserSeek(videoRef.current?.currentTime ?? 0)
                }}
                onWaiting={onStall}
                onStalled={onStall}
                onPlaying={() => {
                    onResume();
                    fireReady()
                }}
                onCanPlay={fireReady}
                onCanPlayThrough={onResume}
                onTimeUpdate={() => {
                    // Reliable recovery signal across browsers (iOS native HLS doesn't always
                    // fire 'playing'/'canplaythrough'): if time is actually advancing again,
                    // clear buffering so buffering-end is sent and the room clock unfreezes.
                    const t = videoRef.current?.currentTime ?? 0
                    if (bufferReported.current && t > lastTime.current + 0.05) {
                        onResume()
                    }
                    lastTime.current = t
                }}
            />

            {/* Chrome autoplay block — needs a user gesture */}
            {needsGesture && (
                <button
                    onClick={handleGesturePlay}
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4
                     bg-gray-950/80 backdrop-blur-sm rounded-xl cursor-pointer">
          <span className="w-20 h-20 flex items-center justify-center rounded-full
                           bg-violet-600 hover:bg-violet-500 text-white transition-colors text-3xl">▶</span>
                    <span className="text-gray-200 font-medium">Нажмите, чтобы начать синхронный просмотр</span>
                    <span className="text-gray-500 text-sm">Браузер требует нажатие для запуска со звуком</span>
                </button>
            )}

            {buffering && !error && !needsGesture && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col items-center gap-2 bg-black/60 px-5 py-4 rounded-xl">
                        <span
                            className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin"/>
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
                                className="ml-2 px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium flex-shrink-0">
                            Повторить
                        </button>
                    )}
                </div>
            )}
        </div>
    )
})

export default VideoPlayer
