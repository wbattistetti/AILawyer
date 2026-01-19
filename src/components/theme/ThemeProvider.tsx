import { useEffect } from 'react'
import { usePreferencesStore, getEffectiveTheme, getFontFamilyCss } from '@/stores/preferencesStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, fontFamily, fontSize } = usePreferencesStore()

  // ✅ MutationObserver AGGressivo: riapplica i colori quando vengono modificati da estensioni
  useEffect(() => {
    const effectiveTheme = getEffectiveTheme(theme)
    const root = document.documentElement

    // ✅ Funzione per riapplicare i colori del tema
    const reapplyThemeColors = () => {
      const bgValue = getComputedStyle(root).getPropertyValue('--background')
      const fgValue = getComputedStyle(root).getPropertyValue('--foreground')

      if (bgValue && fgValue) {
        // ✅ Forza i colori usando setProperty con !important
        document.body.style.setProperty('background-color', `hsl(${bgValue})`, 'important')
        document.body.style.setProperty('color', `hsl(${fgValue})`, 'important')

        const rootEl = document.getElementById('root')
        if (rootEl) {
          rootEl.style.setProperty('background-color', `hsl(${bgValue})`, 'important')
          rootEl.style.setProperty('color', `hsl(${fgValue})`, 'important')
        }
      }
    }

    const observer = new MutationObserver((mutations) => {
      let shouldReapply = false

      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target as HTMLElement
          if (target === document.body || target.id === 'root') {
            // ✅ Verifica se i colori sono stati modificati da un'estensione
            const computedBg = getComputedStyle(target).backgroundColor
            const computedColor = getComputedStyle(target).color

            // ✅ Se i colori non corrispondono al tema, riapplica
            const expectedBg = `hsl(${getComputedStyle(root).getPropertyValue('--background')})`
            const expectedColor = `hsl(${getComputedStyle(root).getPropertyValue('--foreground')})`

            // ✅ Confronta approssimativo (le estensioni possono modificare i valori)
            if (computedBg !== expectedBg || computedColor !== expectedColor) {
              shouldReapply = true
              console.warn('🚨 [THEME-DEBUG] Colors modified by extension, reapplying...', {
                target: target.tagName,
                expectedBg,
                computedBg,
                expectedColor,
                computedColor
              })
            }
          }
        }
      })

      if (shouldReapply) {
        // ✅ Riapplica i colori dopo un breve delay per evitare loop
        setTimeout(() => {
          requestAnimationFrame(() => {
            reapplyThemeColors()
          })
        }, 50)
      }
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

    // ✅ Riapplica periodicamente i colori (ogni 500ms) per forzare il tema
    const intervalId = setInterval(() => {
      reapplyThemeColors()
    }, 500)

    return () => {
      observer.disconnect()
      clearInterval(intervalId)
    }
  }, [theme])

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
      root.setAttribute('data-theme', 'dark') // ✅ Aggiungi attributo data-theme per identificare il tema
      console.log('🎨 [THEME-PROVIDER] Added dark class to root')
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light') // ✅ Aggiungi attributo data-theme per identificare il tema
      console.log('🎨 [THEME-PROVIDER] Removed dark class from root')
    }

    // ✅ Forza i colori immediatamente usando setProperty con !important
    const bgValue = getComputedStyle(root).getPropertyValue('--background')
    const fgValue = getComputedStyle(root).getPropertyValue('--foreground')

    if (bgValue && fgValue) {
      document.body.style.setProperty('background-color', `hsl(${bgValue})`, 'important')
      document.body.style.setProperty('color', `hsl(${fgValue})`, 'important')

      const rootEl = document.getElementById('root')
      if (rootEl) {
        rootEl.style.setProperty('background-color', `hsl(${bgValue})`, 'important')
        rootEl.style.setProperty('color', `hsl(${fgValue})`, 'important')
      }
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
