import { useEffect, useState } from 'react'

export type Theme = 'sunset' | 'midnight'
const STORAGE_KEY = 'syncwatch-theme'

function initialTheme(): Theme {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved === 'midnight' ? 'midnight' : 'sunset'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'sunset' ? 'midnight' : 'sunset'))

  return { theme, toggle }
}
