import { useNavigate } from 'react-router-dom'

export default function RoomNotFound() {
  const navigate = useNavigate()
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-6xl">🕳️</div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-100">Комната не найдена</h2>
        <p className="text-gray-400 max-w-sm">
          Такой комнаты нет или она уже закрылась.<br/>
          Создайте новую или попросите свежую ссылку.
        </p>
      </div>
      <button
        onClick={() => navigate('/')}
        className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-semibold transition-colors"
      >
        На главную
      </button>
    </div>
  )
}
