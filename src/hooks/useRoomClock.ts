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
const ACTION_GRACE_MS = 1500  // after a local user action, don't correct (let state settle)

export function useRoomClock(
  playerRef: React.RefObject<PlayerHandle | null>,
  clock: ClockEvent | null,
  holdPaused: boolean = false,
  lastActionRef?: React.MutableRefObject<number>,
) {
  const clockRef = useRef(clock)
  const holdRef  = useRef(holdPaused)
  const appliedPausedPos = useRef<number | null>(null)  // last paused position we applied
  useEffect(() => { clockRef.current = clock }, [clock])
  useEffect(() => { holdRef.current = holdPaused }, [holdPaused])

  useEffect(() => {
    const timer = setInterval(() => {
      const p = playerRef.current
      const c = clockRef.current
      if (!p || !c) return

      // Just after a local action (play/pause/seek), stay out of the way so the
      // optimistic clock can propagate to clockRef without the loop fighting it.
      if (lastActionRef && Date.now() - lastActionRef.current < ACTION_GRACE_MS) {
        return
      }

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
        p.setPlaybackRate(1.0)
        // Apply a paused position ONLY when it actually changed (a real remote seek).
        // Don't re-seek every tick — HLS snaps to keyframes, so actual rarely equals
        // c.position exactly, and constant re-seeking blocks the user's own seeking.
        if (appliedPausedPos.current !== c.position) {
          appliedPausedPos.current = c.position
          if (Math.abs(actual - c.position) > 0.5) p.seekTo(c.position)
        }
        return
      }
      // playing → forget the applied paused position so the next pause re-applies
      appliedPausedPos.current = null

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
