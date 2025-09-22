import React, { useEffect, useState } from 'react'
import type { CaseNode } from '../types/graph'

export function RightEditorPanel({ node, onClose }: { node: CaseNode | null; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, any>>({})
  useEffect(() => {
    if (!node) return
    setValues({ label: node.label, ...node.meta })
  }, [node])

  if (!node) return null

  const set = (k: string, v: any) => setValues((s) => ({ ...s, [k]: v }))

  const Field = ({ label, k, type = 'text' }: { label: string; k: string; type?: string }) => (
    <label className="block mb-2">
      <span className="block text-xs text-neutral-600 mb-1">{label}</span>
      <input
        type={type}
        value={values[k] ?? ''}
        onChange={(e) => set(k, e.target.value)}
        className="w-full border rounded px-2 py-1 text-sm"
      />
    </label>
  )

  const renderForm = () => {
    switch (node.kind) {
      case 'ENTITY':
        return (
          <>
            <Field label="Nome" k="label" />
            <Field label="Alias" k="alias" />
            <Field label="Documento ID" k="docid" />
          </>
        )
      case 'DOCUMENT':
        return (
          <>
            <Field label="Titolo" k="label" />
            <Field label="Data" k="date" type="date" />
            <Field label="Protocollo" k="protocol" />
          </>
        )
      case 'EVENT':
        return (
          <>
            <Field label="Titolo" k="label" />
            <Field label="Data/Ora" k="datetime" type="datetime-local" />
            <Field label="Luogo" k="place" />
          </>
        )
      case 'MEASURE':
        return (
          <>
            <Field label="Descrizione" k="label" />
            <Field label="Articolo" k="article" />
          </>
        )
      case 'EVIDENCE':
        return (
          <>
            <Field label="Oggetto" k="label" />
            <Field label="Numero repertorio" k="repertorio" />
          </>
        )
      case 'TIMELINE':
        return (
          <>
            <Field label="Da" k="from" type="date" />
            <Field label="A" k="to" type="date" />
          </>
        )
      case 'CONTAINER':
      default:
        return <Field label="Etichetta" k="label" />
    }
  }

  return (
    <aside className="absolute top-0 right-0 h-full w-[340px] bg-white border-l shadow-lg z-20 flex flex-col">
      <header className="px-3 py-2 border-b flex items-center justify-between">
        <div className="font-medium text-sm truncate" title={node.label}>{node.label}</div>
        <button type="button" onClick={onClose} className="text-neutral-600 hover:text-black">✕</button>
      </header>
      <div className="p-3 overflow-auto text-sm">
        {renderForm()}
      </div>
      <div className="p-3 border-t flex gap-2">
        <button type="button" className="px-3 py-1 border rounded text-sm bg-neutral-50">Annulla</button>
        <button type="button" className="px-3 py-1 border rounded text-sm bg-blue-600 text-white">Salva</button>
      </div>
    </aside>
  )
}

export default RightEditorPanel


