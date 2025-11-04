import React, { useState, useRef, useEffect } from 'react'
import { FolderOpen, Search, User, Phone, CreditCard, Calendar, Network, Users } from 'lucide-react'
import styles from '../features/drawers/Label.module.css'

type ArchiveTab = {
  id: string
  component: string
  name: string
  icon: React.ReactNode
  colorBase: string
  colorActive: string
}

interface SidebarArchiviProps {
  tabs: ArchiveTab[]
  selectedId: string | null
  onSelect: (component: string, id: string) => void
  isOpen: boolean
  onToggle: () => void
  onMouseEnter?: () => void
  headerHeight?: number
  optimalFontSize?: number // ✅ Font size calcolato dai cassetti
  isDrawerStripVisible?: boolean // ✅ Per gestire z-index e bottom
}

export function SidebarArchivi({ tabs, selectedId, onSelect, isOpen, onToggle, onMouseEnter, headerHeight = 56, optimalFontSize = 13, isDrawerStripVisible = false }: SidebarArchiviProps) {
  const sidebarRef = useRef<HTMLDivElement>(null)
  const [hoveredTabId, setHoveredTabId] = React.useState<string | null>(null)

  // Log rimosso (troppo rumoroso)
  // React.useEffect(() => {
  //   if (sidebarRef.current) {
  //     const computed = window.getComputedStyle(sidebarRef.current)
  //     const inline = sidebarRef.current.style
  //     console.log('[SidebarArchivi] SIDEBAR STATE', { ... })
  //   }
  // }, [isOpen, tabs.length])

  // ✅ Calcola larghezza dinamica: testo più lungo misurato + 15px x 2
  const sidebarWidth = React.useMemo(() => {
    if (tabs.length === 0) return 200

    // Trova l'etichetta più lunga (intera label)
    const longestLabel = tabs.reduce((longest, tab) =>
      tab.name.length > longest.length ? tab.name : longest, '')

    if (longestLabel === '') return 200

    // Misura larghezza effettiva del testo con optimalFontSize
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return 200

    context.font = `600 ${optimalFontSize}px sans-serif` // font-weight 600
    const textWidth = context.measureText(longestLabel).width

    // Larghezza = testo più lungo + 15px sinistra + 15px destra
    const SIDEBAR_PADDING = 15
    const totalWidth = textWidth + (SIDEBAR_PADDING * 2)

    const minWidth = 100
    return Math.max(minWidth, Math.ceil(totalWidth))
  }, [tabs, optimalFontSize])

  return (
    <>
      {/* Linguetta a sinistra - visibile solo quando chiusa (come i cassetti) */}
      {!isOpen && (
        <div
          className="archive-sidebar-tab-handle"
          style={{
            position: 'fixed',
            left: '0px',
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 1001,
            pointerEvents: 'auto',
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
          }}
        >
          <div
            style={{
              background: '#f1f5f9',
              borderTopRightRadius: '8px',
              borderBottomRightRadius: '8px',
              border: '2px solid #94a3b8',
              borderLeft: 'none',
              padding: '20px 8px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#334155',
              cursor: 'pointer',
              boxShadow: '2px 0 8px rgba(0, 0, 0, 0.15)',
              whiteSpace: 'nowrap',
            }}
          >
            Qui per vedere gli archivi
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        style={{
          position: 'fixed',
          left: 0,
          top: `${headerHeight}px`, // ✅ Inizia sotto l'header
          bottom: isDrawerStripVisible ? '350px' : 0, // ✅ Non coprire i cassetti quando sono visibili
          width: `${sidebarWidth}px`, // ✅ Larghezza dinamica
          background: 'rgb(24, 26, 27)', // ✅ Sfondo grigio scuro identico al canvas
          zIndex: isDrawerStripVisible ? 999 : 1000, // ✅ Più basso quando cassetti visibili
          overflow: 'hidden',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          opacity: isOpen ? 1 : 0,
          visibility: isOpen ? 'visible' : 'hidden', // ✅ Nascondi completamente quando chiusa
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 0.3s ease-out, width 0.3s ease-out', // ✅ Rimossa transizione opacity per evitare ritardi
          boxShadow: isOpen ? '2px 0 12px rgba(0, 0, 0, 0.1)' : 'none',
        }}
        onMouseEnter={onMouseEnter}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            padding: '8px 2px', // ✅ Ridotto padding laterale (da 4px a 2px)
            gap: '8px', // ✅ Aumentato gap per separare i tab (come i cassetti)
            overflowY: 'auto',
            overflowX: 'hidden',
            pointerEvents: 'auto', // ✅ Assicura che gli eventi mouse funzionino
          }}
          onMouseMove={(e) => {
            // ✅ Fallback: se gli eventi sui bottoni non funzionano, usa questo
            const target = e.target as HTMLElement
            const button = target.closest('button[data-tab-id]') as HTMLButtonElement | null

            if (button) {
              const buttonTabId = button.getAttribute('data-tab-id')
              if (buttonTabId && buttonTabId !== hoveredTabId) {
                console.log('[SidebarArchivi] 🖱️ MOUSE MOVE on container (fallback)', {
                  buttonTabId: buttonTabId,
                  currentHovered: hoveredTabId,
                  targetTag: target.tagName,
                })
                setHoveredTabId(buttonTabId)
              }
            }
          }}
        >
          {tabs.map((tab) => {
            const isSelected = selectedId === tab.id
            const isHovered = hoveredTabId === tab.id
            const color = isSelected ? tab.colorActive : tab.colorBase

            // ✅ Log per debug hover
            if (isHovered) {
              console.log('[SidebarArchivi] TAB HOVERED', {
                tabId: tab.id,
                tabName: tab.name,
                isHovered,
                hoveredTabId,
                className: isHovered ? 'bg-slate-100 shadow-lg' : 'bg-slate-50',
              })
            }

            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onSelect(tab.component, tab.id)}
                onMouseMove={(e) => {
                  // ✅ Usa onMouseMove invece di onMouseEnter per rilevare il movimento in modo più affidabile
                  if (hoveredTabId !== tab.id) {
                    console.log('[SidebarArchivi] 🖱️ MOUSE MOVE on tab', {
                      tabId: tab.id,
                      tabName: tab.name,
                      currentHovered: hoveredTabId,
                      target: e.target,
                      currentTarget: e.currentTarget,
                    })
                    setHoveredTabId(tab.id)
                  }
                }}
                onMouseLeave={(e) => {
                  console.log('[SidebarArchivi] 🖱️ MOUSE LEAVE tab', {
                    tabId: tab.id,
                    tabName: tab.name,
                    relatedTarget: e.relatedTarget,
                  })
                  // ✅ Reset solo se non stiamo entrando in un'altra tab
                  const relatedTarget = e.relatedTarget as HTMLElement
                  const isEnteringAnotherTab = relatedTarget?.closest('button[data-tab-id]') !== null
                  if (!isEnteringAnotherTab) {
                    setHoveredTabId(null)
                  }
                }}
                className={`
                  flex flex-col items-center justify-start gap-1.5 px-2 py-2.5
                  transition-all flex-shrink-0
                  ${isSelected
                    ? 'bg-white shadow-md'
                    : isHovered
                    ? 'bg-slate-100 shadow-lg'
                    : 'bg-slate-50'
                  }
                `}
                ref={(el) => {
                  // ✅ Log per verificare se le classi vengono applicate
                  if (el && isHovered) {
                    const computed = window.getComputedStyle(el)
                    console.log('[SidebarArchivi] BUTTON COMPUTED STYLES', {
                      tabId: tab.id,
                      isHovered,
                      className: el.className,
                      computedBg: computed.backgroundColor,
                      computedBoxShadow: computed.boxShadow,
                      computedTransform: computed.transform,
                    })
                  }
                }}
                style={{
                  // ✅ Bordino sempre visibile (come i cassetti) - bordo sinistro TRASPARENTE (linguetta)
                  borderTop: `${isSelected || isHovered ? '3px' : '1px'} solid ${isSelected ? color : isHovered ? color : '#cbd5e1'}`,
                  borderLeft: 'transparent', // ✅ Bordo sinistro trasparente (linguetta che esce dallo schermo)
                  borderRight: `${isSelected || isHovered ? '2px' : '1px'} solid ${isSelected ? color : isHovered ? color : '#cbd5e1'}`,
                  borderBottom: `${isSelected || isHovered ? '3px' : '1px'} solid ${isSelected ? color : isHovered ? color : '#cbd5e1'}`,
                  borderRadius: '8px', // ✅ Angoli arrotondati
                  borderTopLeftRadius: '0', // ✅ Angolo sinistro superiore non arrotondato (linguetta)
                  borderBottomLeftRadius: '0', // ✅ Angolo sinistro inferiore non arrotondato (linguetta)
                  width: '100%',
                  minHeight: '85px',
                  padding: '10px 4px',
                  cursor: 'pointer',
                  position: 'relative',
                  // ✅ Transform leggero quando hover per effetto "sollevamento" (come i cassetti, ma orizzontale)
                  transform: isHovered && !isSelected ? 'translateX(-2px)' : 'translateX(0)',
                }}
              >
                {/* Icona - volto stilizzato 12px */}
                <div className="flex items-center justify-center w-full">
                  {React.isValidElement(tab.icon) ? (
                    <span className="flex-shrink-0" style={{ color: isHovered || isSelected ? color : color, opacity: isHovered || isSelected ? 1 : 0.8 }}>
                      {React.cloneElement(tab.icon as any, {
                        width: 12,
                        height: 12,
                        className: styles.iconInner,
                        color: color,
                      } as any)}
                    </span>
                  ) : (
                    <span className="flex-shrink-0" style={{ color: isHovered || isSelected ? color : color, opacity: isHovered || isSelected ? 1 : 0.8 }}>
                      {tab.icon}
                    </span>
                  )}
                </div>

                {/* Testo - usa font size dei cassetti */}
                <span
                  className={styles.labelText}
                  style={{
                    color: isSelected ? '#1e293b' : isHovered ? '#334155' : '#475569',
                    fontSize: `${optimalFontSize}px`, // ✅ Usa font size calcolato dai cassetti
                    fontWeight: 600,
                    textAlign: 'center',
                    padding: '0 2px',
                    lineHeight: '1.2',
                  }}
                >
                  {tab.name}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
