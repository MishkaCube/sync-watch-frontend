import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useCallback, useEffect, useRef } from 'react'
import type { ChatMessage, ClockEvent, ParticipantEvent, PlayerEvent } from '../lib/types'
import { getRoom } from '../lib/api'

interface UseSyncOptions {
  roomId: string
  senderId: string
  onClock: (clock: ClockEvent) => void
  onSourceChange: (event: PlayerEvent) => void
  onParticipants: (count: number, previousCount: number) => void
  onBuffering?: (count: number) => void
  onChat?: (msg: ChatMessage) => void
  onChatHistory?: (msgs: ChatMessage[]) => void
  onInitialState?: (hasSource: boolean) => void  // first connect: state fetched
  onDisconnect?: () => void
  onReconnect?: () => void
}

export function useSync({
  roomId, senderId,
  onClock, onSourceChange, onParticipants, onBuffering, onChat, onChatHistory, onInitialState,
  onDisconnect, onReconnect,
}: UseSyncOptions) {
  const clientRef       = useRef<Client | null>(null)
  const onClockRef      = useRef(onClock)
  const onSourceRef     = useRef(onSourceChange)
  const onParticipantsRef = useRef(onParticipants)
  const onBufferingRef  = useRef(onBuffering)
  const onChatRef       = useRef(onChat)
  const onChatHistoryRef = useRef(onChatHistory)
  const onInitialStateRef = useRef(onInitialState)
  const onDisconnectRef = useRef(onDisconnect)
  const onReconnectRef  = useRef(onReconnect)

  useEffect(() => { onClockRef.current        = onClock        }, [onClock])
  useEffect(() => { onSourceRef.current       = onSourceChange }, [onSourceChange])
  useEffect(() => { onParticipantsRef.current = onParticipants }, [onParticipants])
  useEffect(() => { onBufferingRef.current    = onBuffering    }, [onBuffering])
  useEffect(() => { onChatRef.current         = onChat         }, [onChat])
  useEffect(() => { onChatHistoryRef.current  = onChatHistory  }, [onChatHistory])
  useEffect(() => { onInitialStateRef.current = onInitialState }, [onInitialState])
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
          if (data.type === 'chat') {
            onChatRef.current?.(data as ChatMessage)
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

        // Both first-join and reconnect — fetch each piece independently so one
        // failure (e.g. room 404 after a server restart) doesn't block the rest.

        // 1) source + live participant count (post-subscribe, so it includes us)
        let hasSource = false
        try {
          const room = await getRoom(roomId)
          if (room.lastSource) {
            onSourceRef.current(room.lastSource)
            hasSource = !!room.lastSource.sourceValue
          }
          if (typeof room.participantCount === 'number') {
            onParticipantsRef.current(room.participantCount, room.participantCount)
          }
        } catch { /* room may be 404 — ignore */ }

        // 2) clock
        try {
          const res = await fetch(`/api/rooms/${roomId}/clock`)
          if (res.ok) {
            const clock = await res.json()
            onClockRef.current({ ...clock, receivedAt: Date.now() })
          }
        } catch { /* ignore */ }

        // 3) chat history
        try {
          const chatRes = await fetch(`/api/rooms/${roomId}/chat`)
          if (chatRes.ok) {
            onChatHistoryRef.current?.(await chatRes.json())
          }
        } catch { /* ignore */ }

        if (isFirst) onInitialStateRef.current?.(hasSource)
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

  const sendChat = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    clientRef.current?.publish({
      destination: `/app/room/${roomId}/event`,
      body: JSON.stringify({ type: 'chat', text: trimmed, senderId, currentTime: 0 }),
    })
  }, [roomId, senderId])

  return { sendEvent, sendChat }
}
