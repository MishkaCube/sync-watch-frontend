import { useEffect, useRef, useState } from 'react'

const POLL_MS    = 5000
const TIMEOUT_MS = 3000
const FAIL_LIMIT = 2   // mark down only after N consecutive failures

/** Polls the backend health endpoint; returns false when it's unreachable. */
export function useBackendHealth(): boolean {
  const [healthy, setHealthy] = useState(true)
  const failCount = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
        const res = await fetch('/api/health', { signal: ctrl.signal })
        clearTimeout(timer)
        if (cancelled) return
        if (res.ok) {
          failCount.current = 0
          setHealthy(true)
          return
        }
        throw new Error('bad status')
      } catch {
        if (cancelled) return
        failCount.current += 1
        if (failCount.current >= FAIL_LIMIT) setHealthy(false)
      }
    }

    check()
    const id = setInterval(check, POLL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return healthy
}
