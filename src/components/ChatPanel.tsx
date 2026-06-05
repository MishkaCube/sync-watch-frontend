import { useEffect, useRef, useState } from 'react'
import type { ChatMessage } from '../lib/types'
import Avatar from './Avatar'

interface Props {
  messages: ChatMessage[]
  myId: string
  onSend: (text: string) => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function ChatPanel({ messages, myId, onSend }: Props) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function submit() {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
  }

  return (
    <div className="flex flex-col bg-gray-900 rounded-xl h-80">
      <div className="px-4 py-2 border-b border-gray-800 text-sm font-medium text-gray-300">
        💬 Чат
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2">
        {messages.length === 0 && (
          <p className="text-gray-600 text-xs text-center mt-4">
            Сообщений пока нет — напишите первым
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.senderId === myId
          return (
            <div key={i} className={`flex items-end gap-2 max-w-[90%] ${mine ? 'self-end flex-row-reverse' : 'self-start'}`}>
              <Avatar seed={m.senderId} size={28} />
              <div className="flex flex-col">
                <div className={`px-3 py-1.5 rounded-2xl text-sm break-words ${
                  mine ? 'bg-violet-600 text-white rounded-br-sm'
                       : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
                <span className={`text-[10px] text-gray-600 mt-0.5 px-1 ${mine ? 'text-right' : 'text-left'}`}>
                  {mine ? 'Вы' : 'Партнёр'} · {formatTime(m.ts)}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Сообщение..."
          maxLength={500}
          className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:border-violet-500"
        />
        <button
          onClick={submit}
          className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
        >
          ➤
        </button>
      </div>
    </div>
  )
}
