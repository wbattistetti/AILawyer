import { useCallback, useEffect, useMemo, useRef } from 'react'

export type PageRegistry = {
  registerPage: (pageNum: number, el: HTMLElement | null) => void
  unregisterPage: (pageNum: number) => void
  getPageRect: (pageNum: number) => DOMRectReadOnly | undefined
  hitTestPage: (clientX: number, clientY: number) => number | undefined
  pageRefs: Map<number, HTMLElement>
  pageRects: Map<number, DOMRectReadOnly>
}

export function usePageRegistry(hostRef: React.RefObject<HTMLElement>): PageRegistry {
  const pageRefs = useRef(new Map<number, HTMLElement>()).current
  const pageRects = useRef(new Map<number, DOMRectReadOnly>()).current
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const updateRect = useCallback((pageNum: number) => {
    const el = pageRefs.get(pageNum)
    if (!el) return
    const rect = el.getBoundingClientRect()
    pageRects.set(pageNum, rect)
  }, [pageRefs, pageRects])

  const updateAll = useCallback(() => {
    for (const num of pageRefs.keys()) updateRect(num)
  }, [pageRefs, updateRect])

  const registerPage = useCallback((pageNum: number, el: HTMLElement | null) => {
    if (!el) return
    pageRefs.set(pageNum, el)
    // Ensure positioning context for absolutely positioned overlay
    const cs = getComputedStyle(el)
    if (cs.position === 'static') {
      el.style.position = 'relative'
    }
    el.style.overflow = el.style.overflow || 'visible'
    // Mark as verify page wrapper and store page number for closest() queries
    try {
      el.setAttribute('data-vp-page', '')
      ;(el as any).dataset.pageNum = String(pageNum)
    } catch {}
    updateRect(pageNum)
    if (!resizeObserverRef.current) {
      resizeObserverRef.current = new ResizeObserver(() => updateAll())
    }
    resizeObserverRef.current.observe(el)
  }, [pageRefs, updateRect, updateAll])

  const unregisterPage = useCallback((pageNum: number) => {
    const el = pageRefs.get(pageNum)
    if (el && resizeObserverRef.current) resizeObserverRef.current.unobserve(el)
    pageRefs.delete(pageNum)
    pageRects.delete(pageNum)
  }, [pageRefs, pageRects])

  const getPageRect = useCallback((pageNum: number) => pageRects.get(pageNum), [pageRects])

  const hitTestPage = useCallback((clientX: number, clientY: number) => {
    const entries = Array.from(pageRects.entries())
    if (entries.length === 1) return entries[0][0]
    for (const [num, rect] of entries) {
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) return num
    }
    return undefined
  }, [pageRects])

  useEffect(() => {
    const host = hostRef.current
    const onScroll = () => updateAll()
    window.addEventListener('scroll', onScroll, true)
    host?.addEventListener('scroll', onScroll, { passive: true } as any)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      host?.removeEventListener('scroll', onScroll as any)
    }
  }, [hostRef, updateAll])

  return useMemo(() => ({ registerPage, unregisterPage, getPageRect, hitTestPage, pageRefs, pageRects }), [registerPage, unregisterPage, getPageRect, hitTestPage, pageRefs, pageRects])
}


