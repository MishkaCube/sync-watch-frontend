export default function JoiningOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center
                    bg-gray-950/95 backdrop-blur-sm gap-8 px-6">

      {/* Spinning film reel of emoji */}
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 rounded-full border-4 border-violet-500/30" />
        <div className="absolute inset-0 rounded-full border-4 border-violet-400 border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-4xl animate-pulse">🎬</div>
      </div>

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-xl font-bold text-white">Подключаемся к сеансу...</h2>
        <p className="text-gray-400 text-sm">
          Синхронизируем время и готовим видео — почти готово
        </p>
      </div>

      {/* Bouncing dots */}
      <div className="flex gap-2">
        {['🍿', '🎥', '💜'].map((e, i) => (
          <span key={i} className="text-2xl animate-bounce"
            style={{ animationDelay: `${i * 0.15}s`, animationDuration: '1s' }}>
            {e}
          </span>
        ))}
      </div>
    </div>
  )
}
