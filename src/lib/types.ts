export type SourceType = 'youtube' | 'url' | 'file'

export interface PlayerEvent {
  type: 'play' | 'pause' | 'seek' | 'source-change' | 'source-reset' | 'buffering-start' | 'buffering-end'
  currentTime: number
  senderId: string
  sourceType?: SourceType
  sourceValue?: string
}

export interface ClockEvent {
  type: 'clock'
  position: number      // seconds from start (at the moment event was issued)
  playing: boolean
  updatedAt: string     // ISO-8601 (server time — not used for math, avoids clock skew)
  receivedAt?: number   // local Date.now() when this event arrived (set client-side)
}

export interface ParticipantEvent {
  type: 'participants-update'
  count: number
  previousCount: number
}

export interface BufferingEvent {
  type: 'buffering'
  count: number   // how many clients are currently buffering
}

export interface ChatMessage {
  type: 'chat'
  senderId: string
  text: string
  ts: number      // server epoch millis
}

export interface Room {
  id: string
  createdAt: string
  participantCount: number
  lastSource?: PlayerEvent
}

export function getExpectedPosition(clock: ClockEvent): number {
  if (!clock.playing) return clock.position
  // Measure elapsed locally from when WE received the event — avoids server/client clock skew.
  const base = clock.receivedAt ?? Date.now()
  const elapsed = (Date.now() - base) / 1000
  return clock.position + elapsed
}
