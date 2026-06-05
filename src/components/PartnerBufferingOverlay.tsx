export default function PartnerBufferingOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-950/80 backdrop-blur-sm rounded-xl gap-5">

      {/* Dual spinner — two rings for "two people" */}
      <div className="relative w-16 h-16">
        <span className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        <span
          className="absolute inset-2 rounded-full border-4 border-pink-400 border-b-transparent animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '0.7s' }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-lg">📶</span>
      </div>

      <div className="flex flex-col items-center gap-2 text-center px-6">
        <p className="text-white font-semibold">Ждём партнёра...</p>
        <p className="text-gray-400 text-sm">Видео возобновится автоматически,<br/>когда буфер загрузится у обоих</p>
      </div>

      {/* Animated dots */}
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce"
            style={{ animationDelay: `${i * 0.12}s`, animationDuration: '0.9s' }}
          />
        ))}
      </div>
    </div>
  )
}
