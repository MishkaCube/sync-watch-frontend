import { useEffect, useRef } from 'react'
import type { ClockEvent } from '../lib/types'
import type { PlayerHandle } from '../components/YouTubePlayer'
import { getExpectedPosition } from '../lib/types'

// Thresholds
const TICK_MS        = 1000   // how often we check
const SEEK_THRESHOLD = 3.0    // seconds: hard seek if drift exceeds this
const RATE_THRESHOLD = 0.3    // seconds: adjust speed if drift exceeds this
const RATE_SLOW      = 0.92   // playback rate when ahead
const RATE_FAST      = 1.08   // playback rate when behind

export function useRoomClock(
  playerRef: React.RefObject<PlayerHandle | null>,
  clock: ClockEvent | null,
  holdPaused: boolean = false,
) {
  const clockRef = useRef(clock)
  const holdRef  = useRef(holdPaused)
  useEffect(() => { clockRef.current = clock }, [clock])
  useEffect(() => { holdRef.current = holdPaused }, [holdPaused])

  useEffect(() => {
    const timer = setInterval(() => {
      const p = playerRef.current
      const c = clockRef.current
      if (!p || !c) return

      // While any client is buffering, keep paused — don't fight the hold
      if (holdRef.current) {
        if (p.getIsPlaying()) p.pause()
        p.setPlaybackRate(1.0)
        return
      }

      const expected   = getExpectedPosition(c)
      const actual     = p.getCurrentTime()
      const isPlaying  = p.getIsPlaying()

      // ── 1. Sync play / pause state ──────────────────────────────────────
      if (c.playing && !isPlaying) {
        p.play()
        return   // let the player settle, check drift next tick
      }
      if (!c.playing && isPlaying) {
        p.pause()
        return
      }

      // ── 2. Correct drift (only while playing) ───────────────────────────
      if (!c.playing) {
        // Paused — just make sure position matches
        if (Math.abs(actual - c.position) > 0.5) p.seekTo(c.position)
        p.setPlaybackRate(1.0)
        return
      }

      const drift = actual - expected   // positive = we're ahead; negative = behind

      if (Math.abs(drift) > SEEK_THRESHOLD) {
        // Too far off — hard seek
        p.seekTo(expected)
        p.setPlaybackRate(1.0)
      } else if (Math.abs(drift) > RATE_THRESHOLD) {
        // Slightly off — nudge speed to converge smoothly
        p.setPlaybackRate(drift > 0 ? RATE_SLOW : RATE_FAST)
      } else {
        // In sync — back to normal speed
        p.setPlaybackRate(1.0)
      }
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [])   // stable ref-based, no deps needed
}
