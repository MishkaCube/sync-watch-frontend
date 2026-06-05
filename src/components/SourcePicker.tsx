import { useEffect, useRef, useState } from 'react'
import type { SourceType } from '../lib/types'
import { isYouTubeUrl } from '../lib/youtube'

interface Props {
  roomId: string
  currentSource?: string   // current active source value (may be proxied)
  onSource: (type: SourceType, value: string) => void
}

// Recover a human-readable URL from a possibly-proxied source value.
function displayUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('blob:')) return ''            // local file — nothing to show
  if (value.includes('/api/hls/manifest')) {
    const enc = new URLSearchParams(value.split('?')[1] ?? '').get('url')
    return enc ?? value
  }
  if (value.startsWith('/api/files/')) return ''      // uploaded file
  return value
}

export default function SourcePicker({ roomId, currentSource, onSource }: Props) {
  const [url, setUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const xhrRef = useRef<XMLHttpRequest | null>(null)

  // keep the URL field in sync with the active source
  useEffect(() => {
    setUrl(displayUrl(currentSource))
  }, [currentSource])

  function handleUrlSubmit() {
    const trimmed = url.trim()
    if (!trimmed) return
    // HLS proxying is handled centrally in RoomPage.handleSource
    onSource(isYouTubeUrl(trimmed) ? 'youtube' : 'url', trimmed)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const formData = new FormData()
    formData.append('file', file)
    formData.append('roomId', roomId)

    const xhr = new XMLHttpRequest()
    xhrRef.current = xhr

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        setUploadProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    }

    xhr.onload = () => {
      setUploading(false)
      setUploadProgress(0)
      // server broadcasts source-change to the room automatically
      // but also set locally so uploader sees the video
      if (xhr.status === 200) {
        const { url: fileUrl } = JSON.parse(xhr.responseText)
        onSource('url', fileUrl)
      }
    }

    xhr.onerror = () => {
      setUploading(false)
      setUploadProgress(0)
    }

    xhr.open('POST', `/api/files/upload?roomId=${roomId}`)
    xhr.send(formData)
    setUploading(true)
    setUploadProgress(0)
  }

  function cancelUpload() {
    xhrRef.current?.abort()
    setUploading(false)
    setUploadProgress(0)
  }

  return (
    <div className="flex flex-col gap-4 p-6 bg-gray-900 rounded-xl">
      <h2 className="text-lg font-semibold text-gray-200">Выбрать видео</h2>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="YouTube URL или прямая ссылка на видео"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:border-violet-500"
        />
        <button
          onClick={handleUrlSubmit}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm font-medium transition-colors"
        >
          Открыть
        </button>
      </div>

      <div className="flex items-center gap-3 text-gray-500 text-sm">
        <div className="flex-1 h-px bg-gray-800" />
        или
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      {uploading ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm text-gray-400">
            <span>Загрузка... {uploadProgress}%</span>
            <button onClick={cancelUpload} className="text-red-400 hover:text-red-300 transition-colors">
              Отмена
            </button>
          </div>
          <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-violet-500 transition-colors text-sm text-gray-400 hover:text-gray-200">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Загрузить файл с компьютера
          <input type="file" accept="video/*" className="hidden" onChange={handleFile} />
        </label>
      )}
    </div>
  )
}
