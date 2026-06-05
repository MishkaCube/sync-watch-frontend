import type { Room } from './types'

const BASE = '/api'

export async function createRoom(): Promise<Room> {
  const res = await fetch(`${BASE}/rooms`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create room')
  return res.json()
}

export async function getRoom(id: string): Promise<Room> {
  const res = await fetch(`${BASE}/rooms/${id}`)
  if (!res.ok) throw new Error('Room not found')
  return res.json()
}

export interface AppConfig {
  rezkaEnabled: boolean
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const res = await fetch(`${BASE}/config`)
    if (!res.ok) throw new Error('config failed')
    return res.json()
  } catch {
    // default: assume enabled if backend unreachable
    return { rezkaEnabled: true }
  }
}

export function hlsWarmup(manifestProxyUrl: string, time: number): void {
  const params = new URLSearchParams(manifestProxyUrl.split('?')[1] ?? '')
  const originalUrl = params.get('url')
  if (!originalUrl) return
  fetch(`/api/hls/warmup?manifest=${encodeURIComponent(originalUrl)}&time=${Math.floor(time)}`)
    .catch(() => {})
}
