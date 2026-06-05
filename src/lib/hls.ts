// Route HLS (.m3u8) sources through the backend caching/prefetch proxy.
// Idempotent: already-proxied URLs are returned unchanged.

const PROXY_PREFIX = '/api/hls/manifest'

export function toProxiedUrl(value: string): string {
  if (!value) return value
  if (value.includes(PROXY_PREFIX)) return value          // already proxied
  if (value.includes('.m3u8')) {
    return `${PROXY_PREFIX}?url=${encodeURIComponent(value)}`
  }
  return value                                            // plain mp4 / blob / etc.
}
