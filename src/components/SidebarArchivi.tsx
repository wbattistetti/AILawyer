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
          background: '#f8fafc',
          borderRight: '1px solid #cbd5e1',
          zIndex: isDrawerStripVisible ? 999 : 1000, // ✅ Più basso quando cassetti visibili
          overflow: 'hidden',
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform 0.3s ease-out, opacity 0.3s ease-out, width 0.3s ease-out',
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
            gap: '4px',
            overflowY: 'auto',
            overflowX: 'hidden',
          }}
        >
          {tabs.map((tab) => {
            const isSelected = selectedId === tab.id
            const color = isSelected ? tab.colorActive : tab.colorBase

            return (
              <button
                key={tab.id}
                onClick={() => onSelect(tab.component, tab.id)}
                style={{
                  width: '100%',
                  minHeight: '85px', // ✅ Aumentato da 70px per bottoni più grandi
                  padding: '10px 4px', // ✅ Ridotto padding laterale (da 8px a 4px), aumentato verticale
                  background: isSelected ? `${color}20` : 'transparent',
                  border: `2px solid ${isSelected ? color : 'transparent'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px', // ✅ Aumentato da 6px per più spazio
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = `${color}15`
                    e.currentTarget.style.borderColor = color
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                  }
                }}
              >
                {/* Icona - volto stilizzato 12px */}
                <div className={styles.iconBox}>
                  {React.isValidElement(tab.icon) ? (
                    React.cloneElement(tab.icon as any, {
                      width: 12,
                      height: 12,
                      className: styles.iconInner,
                      color: color,
                    } as any)
                  ) : (
                    <span className={styles.iconInner} style={{ width: 12, height: 12, color }}>
                      {tab.icon}
                    </span>
                  )}
                </div>

                {/* Testo - usa font size dei cassetti */}
                <span
                  className={styles.labelText}
                  style={{
                    color: color,
                    fontSize: `${optimalFontSize}px`, // ✅ Usa font size calcolato dai cassetti
                    fontWeight: 600,
                    textAlign: 'center',
                    padding: '0 2px',
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
