import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

export type FontFamily = 'system' | 'inter' | 'roboto' | 'open-sans' | 'lato' | 'montserrat'

export interface PreferencesState {
  theme: Theme
  fontFamily: FontFamily
  fontSize: number // in px, default 16
  setTheme: (theme: Theme) => void
  setFontFamily: (fontFamily: FontFamily) => void
  setFontSize: (fontSize: number) => void
}

const FONT_FAMILIES: Record<FontFamily, string> = {
  'system': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'inter': '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'roboto': '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'open-sans': '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'lato': '"Lato", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  'montserrat': '"Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'light',
      fontFamily: 'system',
      fontSize: 16,
      setTheme: (theme) => set({ theme }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    {
      name: 'app-preferences',
    }
  )
)

// Helper per ottenere il font-family CSS
export function getFontFamilyCss(fontFamily: FontFamily): string {
  return FONT_FAMILIES[fontFamily]
}

// Helper per ottenere il tema effettivo (risolve 'system' in 'light' o 'dark')
export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}
