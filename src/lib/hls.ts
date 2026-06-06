// Route HLS sources through the backend caching/prefetch proxy.
// Idempotent: already-proxied URLs are returned unchanged.
//
// HLS streams don't always end in .m3u8 (e.g. rezka mirrors serve them via
// `ep.php?...`). So we proxy ANY remote URL that isn't an obvious plain media
// file or a local/uploaded resource. Proxying also fixes CORS: hls.js fetches
// the manifest/segments via XHR (needs CORS), which most CDNs don't allow —
// our backend fetches them server-side and serves them same-origin.

const PROXY_PREFIX = '/api/hls/manifest'

// Direct files that the <video> element can play natively (no hls.js / proxy).
function isPlainMedia(value: string): boolean {
  return (
    /\.(mp4|webm|ogg|ogv|mov|m4v|mkv)(\?|#|$)/i.test(value) ||
    value.startsWith('blob:') ||
    value.startsWith('/api/files/')   // our own uploaded files
  )
}

export function toProxiedUrl(value: string): string {
  if (!value) return value
  if (value.includes(PROXY_PREFIX)) return value     // already proxied
  if (isPlainMedia(value)) return value              // direct file → native <video>
  if (!/^https?:\/\//i.test(value)) return value     // not an absolute remote URL
  // assume HLS (with or without .m3u8 in the path) → route through caching proxy
  return `${PROXY_PREFIX}?url=${encodeURIComponent(value)}`
}
