import type { LobbyUser, ConnQuality } from '../lib/types'
import Avatar from './Avatar'

interface Props {
  users: LobbyUser[]
  myId: string
}

const QUALITY: Record<ConnQuality, { label: string; color: string; bars: number }> = {
  good:   { label: 'Хорошая связь', color: 'text-green-400',  bars: 3 },
  normal: { label: 'Средняя связь', color: 'text-amber-400',  bars: 2 },
  weak:   { label: 'Слабая связь',  color: 'text-red-400',    bars: 1 },
}

function SignalBars({ quality }: { quality: ConnQuality }) {
  const { color, bars } = QUALITY[quality]
  return (
    <span className={`flex items-end gap-0.5 h-3 ${color}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-1 rounded-sm bg-current"
          style={{ height: `${i * 33}%`, opacity: i <= bars ? 1 : 0.25 }}
        />
      ))}
    </span>
  )
}

export default function LobbyPanel({ users, myId }: Props) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
      <div className="text-sm font-medium text-gray-300 flex items-center gap-2">
        👥 В лобби <span className="text-gray-500">· {users.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {users.length === 0 && (
          <p className="text-gray-600 text-xs">Пока никого…</p>
        )}
        {users.map((u) => {
          const mine = u.id === myId
          const q = QUALITY[u.quality] ?? QUALITY.normal
          return (
            <div key={u.id} className="flex items-center gap-2.5">
              <Avatar seed={u.id} size={28} className="ring-2 ring-gray-800" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate">
                  {mine ? 'Вы' : 'Партнёр'}
                </div>
                <div className={`text-[11px] flex items-center gap-1 ${q.color}`}>
                  <SignalBars quality={u.quality} />
                  {q.label}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
