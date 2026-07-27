/**
 * Tab header Dockview per i pannelli graph-builder:
 * hover → matita / nota / cestino; rename inline con ✓ e ×; conferma delete.
 */

import React, { useEffect, useState } from 'react'
import type { IDockviewPanelHeaderProps } from 'dockview'
import { Network, Pencil, StickyNote, Trash2 } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useGraphWorkspace } from './graph-workspace-context'
import InlineTextEditor from './InlineTextEditor'

const TAB_COLOR_BASE = '#34d399'
const TAB_COLOR_ACTIVE = '#10b981'

export type GraphBuilderTabHeaderProps = IDockviewPanelHeaderProps & {
  isCloseable: boolean
}

/** Header tab grafo collegato al catalogo workspace. */
export function GraphBuilderTabHeader({
  api,
  isCloseable,
}: GraphBuilderTabHeaderProps) {
  const tabId = api.id
  const isActive = api.group?.model?.activePanel?.id === tabId
  const {
    graphsById,
    openNoteByGraphId,
    renameGraph,
    toggleGraphNote,
    deleteGraph,
  } = useGraphWorkspace()

  const graphId = (api as any).params?.graphId || tabId
  const title = graphsById.get(graphId)?.name || api.title || 'Grafo'
  const noteOpen = openNoteByGraphId.get(graphId) === true
  const color = isActive ? TAB_COLOR_ACTIVE : TAB_COLOR_BASE
  const opacity = isActive ? 1 : 0.4

  const [hovered, setHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [draftName, setDraftName] = useState(title)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    if (!isEditing) setDraftName(title)
  }, [title, isEditing])

  const commitRename = () => {
    const next = draftName.trim()
    if (!next) {
      setDraftName(title)
      setIsEditing(false)
      return
    }
    renameGraph(graphId, next)
    api.setTitle?.(next)
    if (typeof (api as any).updateTitle === 'function') {
      ;(api as any).updateTitle(next)
    }
    setIsEditing(false)
  }

  const cancelRename = () => {
    setDraftName(title)
    setIsEditing(false)
  }

  const showActions = hovered || deleteOpen || noteOpen

  if (isEditing) {
    return (
      <div
        data-graph-tab-editing="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          width: 'max-content',
          minWidth: 'max-content',
          color,
          opacity,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <Network
          size={18}
          strokeWidth={2.5}
          fill="none"
          style={{ color, stroke: color, opacity, flexShrink: 0 }}
        />
        <InlineTextEditor
          value={draftName}
          onChange={setDraftName}
          onCommit={commitRename}
          onCancel={cancelRename}
          aria-label="Nome grafo"
          autoWidth
          inputStyle={{
            border: '1px solid var(--ui-border)',
            background: '#ffffff',
            color: '#0f172a',
          }}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color,
        opacity,
        transition: 'opacity 0.3s ease, color 0.3s ease',
        width: '100%',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        if (!deleteOpen) setHovered(false)
      }}
    >
      <Network
        size={18}
        strokeWidth={2.5}
        fill="none"
        style={{
          color,
          stroke: color,
          opacity,
          transition: 'opacity 0.3s ease, color 0.3s ease, stroke 0.3s ease',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontWeight: isActive ? 700 : 400,
          transition: 'font-weight 0.3s ease',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>

      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          opacity: showActions ? 1 : 0,
          pointerEvents: showActions ? 'auto' : 'none',
          transition: 'opacity 0.15s ease',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          title="Rinomina grafo"
          aria-label="Rinomina grafo"
          onClick={(e) => {
            e.stopPropagation()
            setIsEditing(true)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={iconButtonStyle}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          title={noteOpen ? 'Nascondi nota' : 'Mostra nota'}
          aria-label={noteOpen ? 'Nascondi nota' : 'Mostra nota'}
          onClick={(e) => {
            e.stopPropagation()
            toggleGraphNote(graphId)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...iconButtonStyle,
            color: noteOpen ? color : 'var(--ui-text-muted)',
          }}
        >
          <StickyNote size={13} />
        </button>

        <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Elimina grafo"
              aria-label="Elimina grafo"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={iconButtonStyle}
            >
              <Trash2 size={13} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={6}
            className="w-64 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm mb-3">
              Eliminare il grafo «{title}»? L&apos;azione non si può annullare.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(false)}
              >
                Annulla
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setDeleteOpen(false)
                  deleteGraph(graphId)
                }}
              >
                Elimina
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {isCloseable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            api.close()
          }}
          style={{
            marginLeft: 4,
            padding: '2px 6px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
            color: 'var(--ui-text-muted)',
            borderRadius: 3,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ui-bg-hover)'
            e.currentTarget.style.color = 'var(--drawer-text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--ui-text-muted)'
          }}
          title="Chiudi tab"
        >
          ×
        </button>
      )}
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 2,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'var(--ui-text-muted)',
  borderRadius: 3,
  lineHeight: 1,
}
