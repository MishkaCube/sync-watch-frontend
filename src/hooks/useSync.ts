import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useCallback, useEffect, useRef } from 'react'
import type { ChatMessage, ClockEvent, ConnQuality, LobbyEvent, ParticipantEvent, PlayerEvent } from '../lib/types'
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
  onPrepare?: (position: number) => void   // barrier: seek + buffer, then send ready
  onGo?: (position: number) => void        // barrier: start playing now
  onLobby?: (users: LobbyEvent['users']) => void
  onDisconnect?: () => void
  onReconnect?: () => void
}

export function useSync({
  roomId, senderId,
  onClock, onSourceChange, onParticipants, onBuffering, onChat, onChatHistory, onInitialState,
  onPrepare, onGo, onLobby,
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
  const onPrepareRef    = useRef(onPrepare)
  const onGoRef         = useRef(onGo)
  const onLobbyRef      = useRef(onLobby)
  const onDisconnectRef = useRef(onDisconnect)
  const onReconnectRef  = useRef(onReconnect)

  useEffect(() => { onClockRef.current        = onClock        }, [onClock])
  useEffect(() => { onSourceRef.current       = onSourceChange }, [onSourceChange])
  useEffect(() => { onParticipantsRef.current = onParticipants }, [onParticipants])
  useEffect(() => { onBufferingRef.current    = onBuffering    }, [onBuffering])
  useEffect(() => { onChatRef.current         = onChat         }, [onChat])
  useEffect(() => { onChatHistoryRef.current  = onChatHistory  }, [onChatHistory])
  useEffect(() => { onInitialStateRef.current = onInitialState }, [onInitialState])
  useEffect(() => { onPrepareRef.current      = onPrepare      }, [onPrepare])
  useEffect(() => { onGoRef.current           = onGo           }, [onGo])
  useEffect(() => { onLobbyRef.current        = onLobby        }, [onLobby])
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
          if (data.type === 'prepare') {
            onPrepareRef.current?.(data.position)
            return
          }
          if (data.type === 'go') {
            onGoRef.current?.(data.position)
            return
          }
          if (data.type === 'lobby') {
            onLobbyRef.current?.((data as LobbyEvent).users)
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

    // Presence heartbeat: measure RTT to the server, classify, and broadcast.
    async function measureQuality(): Promise<ConnQuality> {
      const t0 = performance.now()
      try {
        await fetch('/api/health', { cache: 'no-store' })
      } catch {
        return 'weak'
      }
      const rtt = performance.now() - t0
      if (rtt < 150) return 'good'
      if (rtt < 400) return 'normal'
      return 'weak'
    }
    async function sendPresence() {
      if (!client.connected) return
      const quality = await measureQuality()
      client.publish({
        destination: `/app/room/${roomId}/event`,
        body: JSON.stringify({ type: 'presence', quality, senderId, currentTime: 0 }),
      })
    }
    sendPresence()
    const presenceTimer = setInterval(sendPresence, 4000)

    return () => {
      clearInterval(presenceTimer)
      client.deactivate()
    }
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
