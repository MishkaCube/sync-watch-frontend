export interface RezkaResult {
  title: string
  url: string
  year: string
  type: string
  poster: string
  rating?: number
}

export interface RezkaInfo {
  name: string
  origName: string
  type: string
  year: string
  thumbnail: string
  description: string
  rating: string
  translators: { id: string; name: string }[]
  seasons: Record<string, { episode: string; title: string }[]>
}

export interface RezkaStream {
  url: string
  quality: string
  available_qualities: string[]
}

const BASE = '/rezka'

export async function rezkaSearch(q: string): Promise<RezkaResult[]> {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

export async function rezkaInfo(url: string): Promise<RezkaInfo> {
  const res = await fetch(`${BASE}/info?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error('Failed to load info')
  return res.json()
}

export async function rezkaStream(
  url: string,
  season?: string,
  episode?: string,
  quality = '720p',
  translator?: string,
): Promise<RezkaStream> {
  const params = new URLSearchParams({ url, quality })
  if (season)     params.set('season', season)
  if (episode)    params.set('episode', episode)
  if (translator) params.set('translator', translator)
  const res = await fetch(`${BASE}/stream?${params}`)
  if (!res.ok) throw new Error('Failed to get stream')
  return res.json()
}
