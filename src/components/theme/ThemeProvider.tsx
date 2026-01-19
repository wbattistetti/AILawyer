import { useEffect } from 'react'
import { usePreferencesStore, getEffectiveTheme, getFontFamilyCss } from '@/stores/preferencesStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, fontFamily, fontSize } = usePreferencesStore()

  // ✅ DEBUG: MutationObserver per tracciare modifiche al body (temporaneo per diagnosticare)
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement
          if (target === document.body || target.id === 'root') {
            const stack = new Error().stack
            console.warn('🚨 [THEME-DEBUG] Body/Root style modified by:', {
              target: target.tagName,
              backgroundColor: getComputedStyle(target).backgroundColor,
              color: getComputedStyle(target).color,
              stack: stack?.split('\n').slice(2, 6).join('\n') // Mostra solo le prime righe dello stack
            })
          }
        }
      })
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['style']
    })

    const rootEl = document.getElementById('root')
    if (rootEl) {
      observer.observe(rootEl, {
        attributes: true,
        attributeFilter: ['style']
      })
    }

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    console.log('🎨 [THEME-PROVIDER] Applying preferences:', { theme, fontFamily, fontSize })

    // Applica tema
    const effectiveTheme = getEffectiveTheme(theme)
    const root = document.documentElement

    console.log('🎨 [THEME-PROVIDER] Effective theme:', effectiveTheme)

    // ✅ DEBUG: Verifica stato PRIMA del cambio
    const hasDarkBefore = root.classList.contains('dark')
    const bgBefore = getComputedStyle(root).getPropertyValue('--background')
    const fgBefore = getComputedStyle(root).getPropertyValue('--foreground')
    console.log('🎨 [THEME-PROVIDER] BEFORE:', {
      hasDarkClass: hasDarkBefore,
      '--background': bgBefore,
      '--foreground': fgBefore,
      rootClasses: Array.from(root.classList)
    })

    // ✅ SOLO classe dark - niente inline styles (soluzione architetturale pulita)
    if (effectiveTheme === 'dark') {
      root.classList.add('dark')
      console.log('🎨 [THEME-PROVIDER] Added dark class to root')
    } else {
      root.classList.remove('dark')
      console.log('🎨 [THEME-PROVIDER] Removed dark class from root')
    }

    // ✅ DEBUG: Verifica stato DOPO il cambio
    setTimeout(() => {
      const hasDarkAfter = root.classList.contains('dark')
      const bgAfter = getComputedStyle(root).getPropertyValue('--background')
      const fgAfter = getComputedStyle(root).getPropertyValue('--foreground')
      const bodyBg = getComputedStyle(document.body).backgroundColor
      const bodyColor = getComputedStyle(document.body).color
      console.log('🎨 [THEME-PROVIDER] AFTER:', {
        hasDarkClass: hasDarkAfter,
        '--background': bgAfter,
        '--foreground': fgAfter,
        bodyBackgroundColor: bodyBg,
        bodyColor: bodyColor,
        rootClasses: Array.from(root.classList)
      })
    }, 100)

    // ✅ Applica font-family a root e body
    const fontFamilyCss = getFontFamilyCss(fontFamily)
    console.log('🎨 [THEME-PROVIDER] Applying font-family:', fontFamilyCss)
    root.style.setProperty('--font-family', fontFamilyCss)
    root.style.fontFamily = fontFamilyCss
    document.body.style.fontFamily = fontFamilyCss

    // ✅ Applica font-size-base che scala tutti i rem
    console.log('🎨 [THEME-PROVIDER] Applying font-size:', fontSize)
    root.style.setProperty('--font-size-base', `${fontSize}px`)
    root.style.fontSize = `${fontSize}px` // Base per rem - tutti gli elementi che usano rem si adattano
    document.body.style.fontSize = '1rem' // Usa rem invece di px diretto

    // ✅ FIX: Listener per cambiamenti sistema (se theme === 'system')
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => {
        const newEffectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        console.log('🎨 [THEME-PROVIDER] System theme changed:', newEffectiveTheme)
        if (newEffectiveTheme === 'dark') {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme, fontFamily, fontSize])

  return <>{children}</>
}
