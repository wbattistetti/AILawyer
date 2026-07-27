/**
 * Barra nota a tutta larghezza sopra il canvas del grafo.
 */

import React from 'react'

export type GraphNoteBarProps = {
  value: string
  onChange: (next: string) => void
  onClose: () => void
}

/** Editor descrizione grafo integrato nella scheda, sopra il canvas. */
export function GraphNoteBar({ value, onChange, onClose }: GraphNoteBarProps) {
  return (
    <div
      className="shrink-0 border-b bg-background px-3 py-2"
      style={{ borderColor: 'var(--ui-border-subtle)' }}
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="graph-note-editor">
          Nota del grafo
        </label>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          Chiudi
        </button>
      </div>
      <textarea
        id="graph-note-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Descrizione o appunti associati a questo grafo…"
        rows={3}
        className="w-full resize-y rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={{ borderColor: 'var(--ui-border)', minHeight: 64 }}
      />
    </div>
  )
}
