export default function WaitingOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950/90 backdrop-blur-sm rounded-xl gap-6">

      {/* Popcorn animation */}
      <div className="relative flex items-end justify-center gap-1 h-16">
        {['🍿', '🎬', '⏳'].map((emoji, i) => (
          <span
            key={i}
            className="text-3xl animate-bounce"
            style={{ animationDelay: `${i * 0.2}s`, animationDuration: '1s' }}
          >
            {emoji}
          </span>
        ))}
      </div>

      {/* Dots loader */}
      <div className="flex flex-col items-center gap-3">
        <p className="text-gray-100 text-lg font-semibold">Ждём партнёра...</p>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-violet-400 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
            />
          ))}
        </div>
        <p className="text-gray-500 text-sm">Видео возобновится автоматически после подключения</p>
      </div>

      {/* Film strip decoration */}
      <div className="flex gap-1 opacity-20">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-8 h-5 border border-gray-400 rounded-sm"
            style={{ animationDelay: `${i * 0.1}s` }}
          />
        ))}
      </div>
    </div>
  )
}
