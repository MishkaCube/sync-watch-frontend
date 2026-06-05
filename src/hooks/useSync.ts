import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useCallback, useEffect, useRef } from 'react'
import type { ClockEvent, ParticipantEvent, PlayerEvent } from '../lib/types'
import { getRoom } from '../lib/api'

interface UseSyncOptions {
  roomId: string
  senderId: string
  onClock: (clock: ClockEvent) => void
  onSourceChange: (event: PlayerEvent) => void
  onParticipants: (count: number, previousCount: number) => void
  onBuffering?: (count: number) => void
  onDisconnect?: () => void
  onReconnect?: () => void
}

export function useSync({
  roomId, senderId,
  onClock, onSourceChange, onParticipants, onBuffering,
  onDisconnect, onReconnect,
}: UseSyncOptions) {
  const clientRef       = useRef<Client | null>(null)
  const onClockRef      = useRef(onClock)
  const onSourceRef     = useRef(onSourceChange)
  const onParticipantsRef = useRef(onParticipants)
  const onBufferingRef  = useRef(onBuffering)
  const onDisconnectRef = useRef(onDisconnect)
  const onReconnectRef  = useRef(onReconnect)

  useEffect(() => { onClockRef.current        = onClock        }, [onClock])
  useEffect(() => { onSourceRef.current       = onSourceChange }, [onSourceChange])
  useEffect(() => { onParticipantsRef.current = onParticipants }, [onParticipants])
  useEffect(() => { onBufferingRef.current    = onBuffering    }, [onBuffering])
  useEffect(() => { onDisconnectRef.current   = onDisconnect   }, [onDisconnect])
  useEffect(() => { onReconnectRef.current    = onReconnect    }, [onReconnect])

  useEffect((): (() => void) => {
    let isFirst = true

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      heartbeatIncoming: 2000,
      heartbeatOutgoing: 2000,
      reconnectDelay: 3000,
      onDisconnect: () => onDisconnectRef.current?.(),
      onConnect: () => void (async () => {
        client.subscribe(`/topic/room.${roomId}`, (msg) => {
          const data = JSON.parse(msg.body)

          if (data.type === 'participants-update') {
            onParticipantsRef.current(data.count, data.previousCount)
            return
          }
          if (data.type === 'clock') {
            onClockRef.current({ ...data, receivedAt: Date.now() } as ClockEvent)
            return
          }
          if (data.type === 'buffering') {
            onBufferingRef.current?.(data.count)
            return
          }
          if (data.type === 'source-change' && data.senderId !== senderId) {
            onSourceRef.current(data as PlayerEvent)
            return
          }
          if (data.type === 'source-reset') {
            // applies to everyone, including the sender
            onSourceRef.current(data as PlayerEvent)
            return
          }
        })

        // Both first-join and reconnect: fetch current source + clock from server
        try {
          const room = await getRoom(roomId)
          if (room.lastSource) onSourceRef.current(room.lastSource)
          const res = await fetch(`/api/rooms/${roomId}/clock`)
          if (res.ok) {
            const clock = await res.json()
            onClockRef.current({ ...clock, receivedAt: Date.now() })
          }
        } catch { /* ignore */ }

        if (!isFirst) onReconnectRef.current?.()
        isFirst = false
      })(),
    })

    client.activate()
    clientRef.current = client
    return () => client.deactivate()
  }, [roomId, senderId])

  const sendEvent = useCallback((event: Omit<PlayerEvent, 'senderId'>) => {
    clientRef.current?.publish({
      destination: `/app/room/${roomId}/event`,
      body: JSON.stringify({ ...event, senderId }),
    })
  }, [roomId, senderId])

  return { sendEvent }
}
