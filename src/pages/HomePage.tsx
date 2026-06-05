import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRoom } from '../lib/api'
import { useBackendHealth } from '../hooks/useBackendHealth'
import BackendDownOverlay from '../components/BackendDownOverlay'

export default function HomePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [joinId, setJoinId] = useState('')
  const backendHealthy = useBackendHealth()

  async function handleCreate() {
    setLoading(true)
    try {
      const room = await createRoom()
      navigate(`/room/${room.id}`)
    } finally {
      setLoading(false)
    }
  }

  function handleJoin() {
    const id = joinId.trim()
    if (id) navigate(`/room/${id}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-10 px-4">
      {!backendHealthy && <BackendDownOverlay />}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-2">
          SyncWatch
        </h1>
        <p className="text-gray-400">Смотрите видео вместе, синхронно</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl font-semibold text-lg transition-colors"
        >
          {loading ? 'Создаём...' : 'Создать комнату'}
        </button>

        <div className="flex items-center gap-3 text-gray-500 text-sm">
          <div className="flex-1 h-px bg-gray-800" />
          или войти в существующую
          <div className="flex-1 h-px bg-gray-800" />
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="ID комнаты"
            value={joinId}
            onChange={(e) => setJoinId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg outline-none focus:border-violet-500"
          />
          <button
            onClick={handleJoin}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium transition-colors"
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  )
}
