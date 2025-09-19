import React, { useEffect, useMemo, useState } from 'react'
import { getEvents, subscribe } from './event-index'

export function EventsTab({ currentDocId }: { currentDocId?: string }) {
  const [tick, setTick] = useState(0)
  const [q, setQ] = useState('')
  const [person, setPerson] = useState('')
  const [type, setType] = useState<string>('')
  const [confMin, setConfMin] = useState<number>(0.6)

  useEffect(() => subscribe(() => setTick(t => t + 1)), [])

  const list = useMemo(() => {
    let evs = getEvents({ docId: currentDocId, person: person || undefined, types: type? [type]: [], confMin })
    const ql = (q || '').trim().toLowerCase()
    if (ql) evs = evs.filter(e => (e.text || '').toLowerCase().includes(ql) || (e.place_raw || '').toLowerCase().includes(ql) || (e.participants||[]).some(p => p.toLowerCase().includes(ql)))
    return evs
  }, [tick, q, person, type, confMin, currentDocId])

  return (
    <div className="h-full w-full flex flex-col">
      <div className="border-b p-2 flex gap-2 items-center text-sm">
        <input className="border rounded px-2 py-1 w-52" placeholder="Filtro persona" value={person} onChange={e=>setPerson(e.target.value)} />
        <select className="border rounded px-2 py-1" value={type} onChange={e=>setType(e.target.value)}>
          <option value="">Tutti i tipi</option>
          <option value="incontro">Incontro</option>
          <option value="telefonata">Telefonata</option>
          <option value="consegna">Consegna</option>
        </select>
        <input className="border rounded px-2 py-1 w-60" placeholder="Ricerca testo/luogo" value={q} onChange={e=>setQ(e.target.value)} />
        <label className="ml-auto flex items-center gap-2">Conf ≥
          <input type="number" min={0} max={1} step={0.05} className="border rounded px-2 py-1 w-20" value={confMin} onChange={e=>setConfMin(parseFloat(e.target.value||'0')||0)} />
        </label>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 w-36">Data/Ora</th>
              <th className="px-3 py-2 w-28">Tipo</th>
              <th className="px-3 py-2">Partecipanti</th>
              <th className="px-3 py-2">Luogo</th>
              <th className="px-3 py-2 w-20">Conf</th>
              <th className="px-3 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {list.map(e => (
              <tr key={e.id} className="border-b hover:bg-neutral-50">
                <td className="px-3 py-2 whitespace-nowrap">{e.time || '-'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{e.type}</td>
                <td className="px-3 py-2">{(e.participants||[]).join(', ')}</td>
                <td className="px-3 py-2">{e.place_raw || '-'}</td>
                <td className="px-3 py-2">{typeof e.confidence==='number'? (e.confidence.toFixed(2)) : '-'}</td>
                <td className="px-3 py-2 text-right">
                  <button className="px-2 py-1 border rounded" onClick={()=>{
                    const ev = new CustomEvent('app:open-doc', { detail: { docId: e.docId, page: (e as any).source?.page, match: (e as any).source, q: (e as any).text } })
                    window.dispatchEvent(ev)
                  }}>Apri</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


