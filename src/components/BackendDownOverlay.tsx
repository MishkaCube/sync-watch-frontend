export default function BackendDownOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center
                    bg-gray-950/95 backdrop-blur-sm gap-8 px-6">

      {/* Bouncing emoji band */}
      <div className="flex items-end gap-2 h-20">
        {['🛠️', '🔌', '☕', '🤖'].map((emoji, i) => (
          <span
            key={i}
            className="text-4xl animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}
          >
            {emoji}
          </span>
        ))}
      </div>

      <div className="text-center max-w-md flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-white">Сервер прилёг отдохнуть</h2>
        <p className="text-gray-400">
          Бэкенд сейчас недоступен — наверное, пьёт кофе. ☕<br/>
          Мы сами переподключимся, как только он вернётся.
        </p>
      </div>

      {/* Pulsing dots */}
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <span>Переподключаемся</span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
