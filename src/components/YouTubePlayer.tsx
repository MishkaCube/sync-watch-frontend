import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import { extractYouTubeId, loadYouTubeApi } from '../lib/youtube'

export interface PlayerHandle {
  play: () => void
  pause: () => void
  seekTo: (time: number) => void
  setPlaybackRate: (rate: number) => void
  getCurrentTime: () => number
  getIsPlaying: () => boolean
  /** seek to time + buffer; resolves when ready to play (or after a safety timeout) */
  prepare: (time: number) => Promise<void>
}

interface Props {
  videoId: string
  onUserPlay:  (time: number) => void
  onUserPause: (time: number) => void
  onUserSeek:  (time: number) => void
  onReady?:    () => void
}

const SUPPRESS_MS = 500

const YouTubePlayer = forwardRef<PlayerHandle, Props>(({ videoId, onUserPlay, onUserPause, onUserSeek, onReady }, ref) => {
  const containerRef   = useRef<HTMLDivElement>(null)
  const playerRef      = useRef<any>(null)
  const suppressUntil  = useRef(0)
  const onUserPlayRef  = useRef(onUserPlay)
  const onUserPauseRef = useRef(onUserPause)
  const onUserSeekRef  = useRef(onUserSeek)

  const onReadyRef     = useRef(onReady)
  useEffect(() => { onUserPlayRef.current  = onUserPlay  }, [onUserPlay])
  useEffect(() => { onUserPauseRef.current = onUserPause }, [onUserPause])
  useEffect(() => { onUserSeekRef.current  = onUserSeek  }, [onUserSeek])
  useEffect(() => { onReadyRef.current     = onReady     }, [onReady])

  const suppress     = () => { suppressUntil.current = Date.now() + SUPPRESS_MS }
  const isSuppressed = () => Date.now() < suppressUntil.current

  useImperativeHandle(ref, () => ({
    play:            () => { suppress(); playerRef.current?.playVideo() },
    pause:           () => { suppress(); playerRef.current?.pauseVideo() },
    seekTo:          (t) => { suppress(); playerRef.current?.seekTo(t, true) },
    setPlaybackRate: (r) => { playerRef.current?.setPlaybackRate(r) },
    getCurrentTime:  () => playerRef.current?.getCurrentTime() ?? 0,
    getIsPlaying:    () => {
      const YT = (window as any).YT?.PlayerState
      return YT ? playerRef.current?.getPlayerState() === YT.PLAYING : false
    },
    prepare: (t) => new Promise<void>((resolve) => {
      const p = playerRef.current
      if (!p) { resolve(); return }
      suppress()
      p.seekTo(t, true)
      // YouTube manages its own buffer; give it a short window to load the seek target
      setTimeout(resolve, 700)
    }),
  }))

  useEffect(() => {
    let player: any
    loadYouTubeApi().then(() => {
      player = new (window as any).YT.Player(containerRef.current, {
        videoId: extractYouTubeId(videoId) ?? videoId,
        playerVars: { controls: 1, rel: 0 },
        events: {
          onReady: () => onReadyRef.current?.(),
          onStateChange: (e: any) => {
            if (isSuppressed()) return
            const YT = (window as any).YT.PlayerState
            const t  = player.getCurrentTime()
            if      (e.data === YT.PLAYING) onUserPlayRef.current(t)
            else if (e.data === YT.PAUSED)  onUserPauseRef.current(t)
          },
        },
      })
      playerRef.current = player
    })
    return () => { player?.destroy() }
  }, [videoId])

  return (
    <div className="w-full aspect-video">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
})

export default YouTubePlayer
