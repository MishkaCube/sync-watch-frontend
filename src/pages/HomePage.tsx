import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createRoom } from '../lib/api'
import { useBackendHealth } from '../hooks/useBackendHealth'
import { useTheme } from '../hooks/useTheme'
import BackendDownOverlay from '../components/BackendDownOverlay'

export default function HomePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [joinId, setJoinId] = useState('')
  const backendHealthy = useBackendHealth()
  const { theme, toggle: toggleTheme } = useTheme()

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
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 sm:gap-10 px-4 safe-top safe-bottom safe-x">
      {!backendHealthy && <BackendDownOverlay />}
      <button onClick={toggleTheme} title="Сменить тему"
        className="absolute top-4 right-4 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
      <div className="text-center flex flex-col items-center gap-3">
        <img src="/logo.svg" alt="SyncWatch" className="w-24 h-24 sm:w-28 sm:h-28" />
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100">SyncWatch</h1>
        <p className="text-gray-400 text-sm sm:text-base">Смотрите видео вместе, синхронно</p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <button
          onClick={handleCreate}
          disabled={loading}
          className="w-full py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl font-semibold text-lg text-white transition-colors"
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
