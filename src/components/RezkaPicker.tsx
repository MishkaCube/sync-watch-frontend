import { useState } from 'react'
import { rezkaSearch, rezkaInfo, rezkaStream } from '../lib/rezka'
import type { RezkaResult, RezkaInfo } from '../lib/rezka'
import type { SourceType } from '../lib/types'

interface Props {
  onSource: (type: SourceType, value: string, label?: string) => void
}

type Step = 'search' | 'info' | 'episode'

export default function RezkaPicker({ onSource }: Props) {
  const [query, setQuery]         = useState('')
  const [step, setStep]           = useState<Step>('search')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const [results, setResults]     = useState<RezkaResult[]>([])
  const [selected, setSelected]   = useState<RezkaResult | null>(null)
  const [info, setInfo]           = useState<RezkaInfo | null>(null)

  const [season, setSeason]       = useState<string>('')
  const [episode, setEpisode]     = useState<string>('')
  const [translator, setTranslator] = useState<string>('')
  const [quality, setQuality]     = useState('720p')
  const [streamLoading, setStreamLoading] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true); setError(null)
    try {
      const res = await rezkaSearch(query)
      setResults(res)
      setStep('search')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(item: RezkaResult) {
    setSelected(item); setLoading(true); setError(null)
    try {
      const i = await rezkaInfo(item.url)
      setInfo(i)
      setTranslator(i.translators[0]?.id ?? '')
      const seasons = Object.keys(i.seasons)
      if (seasons.length > 0) {
        setSeason(seasons[0])
        setEpisode(i.seasons[seasons[0]][0]?.episode ?? '1')
        setStep('episode')
      } else {
        // movie — get stream directly
        await loadStream(item.url, undefined, undefined, quality, i.translators[0]?.id, item.title)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadStream(
    url: string,
    s?: string,
    ep?: string,
    q = quality,
    tr?: string,
    label?: string,
  ) {
    setStreamLoading(true); setError(null)
    try {
      const stream = await rezkaStream(url, s, ep, q, tr)
      onSource('url', stream.url, label)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStreamLoading(false)
    }
  }

  function handlePlay() {
    if (!selected || !info) return
    loadStream(selected.url, season || undefined, episode || undefined, quality, translator || undefined,
      `${info.name} S${season}E${episode}`)
  }

  const seasonList = info ? Object.keys(info.seasons) : []
  const episodeList = (info && season) ? (info.seasons[season] ?? []) : []

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Поиск на HDRezka..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:border-violet-500"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? '...' : '🔍'}
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-xs px-1">{error}</p>
      )}

      {/* Search results */}
      {step === 'search' && results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-56 overflow-y-auto rounded-lg">
          {results.map((item, i) => (
            <button
              key={i}
              onClick={() => handleSelect(item)}
              className="flex items-center gap-3 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-left transition-colors"
            >
              {item.poster && (
                <img src={item.poster} alt="" className="w-8 h-12 object-cover rounded flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm text-gray-200 truncate">{item.title}</p>
                <p className="text-xs text-gray-500">
                  {item.rating ? `⭐ ${item.rating}` : ''}
                  {item.year ? ` · ${item.year}` : ''}
                  {item.type ? ` · ${item.type}` : ''}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Episode picker */}
      {step === 'episode' && info && selected && (
        <div className="flex flex-col gap-3 p-3 bg-gray-800 rounded-xl">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep('search')}
              className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
            >← назад</button>
            <span className="text-sm font-medium text-gray-200 truncate">{info.name}</span>
          </div>

          {/* Translator */}
          {info.translators.length > 1 && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Перевод</label>
              <select
                value={translator}
                onChange={(e) => setTranslator(e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm outline-none focus:border-violet-500"
              >
                {info.translators.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2">
            {/* Season */}
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Сезон</label>
              <select
                value={season}
                onChange={(e) => {
                  setSeason(e.target.value)
                  setEpisode(info.seasons[e.target.value]?.[0]?.episode ?? '1')
                }}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm outline-none focus:border-violet-500"
              >
                {seasonList.map((s) => (
                  <option key={s} value={s}>Сезон {s}</option>
                ))}
              </select>
            </div>

            {/* Quality */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Качество</label>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm outline-none focus:border-violet-500"
              >
                {['1080p','720p','480p','360p'].map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Episodes */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Серия</label>
            <div className="max-h-36 overflow-y-auto flex flex-col gap-1">
              {episodeList.map((ep) => (
                <button
                  key={ep.episode}
                  onClick={() => setEpisode(ep.episode)}
                  className={`px-2 py-1.5 rounded-lg text-left text-sm transition-colors ${
                    episode === ep.episode
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  <span className="text-gray-400 mr-2">{ep.episode}.</span>{ep.title || `Серия ${ep.episode}`}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handlePlay}
            disabled={streamLoading}
            className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
          >
            {streamLoading ? 'Получаем ссылку...' : '▶ Смотреть'}
          </button>
        </div>
      )}
    </div>
  )
}
