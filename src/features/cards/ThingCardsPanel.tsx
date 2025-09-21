import { useEffect, useState } from 'react'

type Thing = { id: string; kind: string; label: string; value: string; page: number }

function jumpTo(page:number, box?:{x0Pct:number;x1Pct:number;y0Pct:number;y1Pct:number}) {
  window.dispatchEvent(new CustomEvent('viewer:jump', { detail: { page, box } }))
}

export function ThingCardsPanel({ kind }: { kind: 'contact'|'id'|'place'|'vehicle'|'docref' }) {
  const [items, setItems] = useState<Thing[]>([])
  useEffect(() => {
    const onEvt = (e: any) => {
      const all: Thing[] = (e.detail?.items || []).filter((x: Thing) => x.kind === kind)
      if (all.length) setItems(prev => [...prev, ...all])
    }
    window.addEventListener('app:things', onEvt as any)
    return () => window.removeEventListener('app:things', onEvt as any)
  }, [kind])

  return (
    <div className="p-2 space-y-2">
      {items.map(it => (
        <div key={it.id} className="border rounded px-2 py-1 text-sm hover:bg-muted cursor-pointer" onClick={()=>jumpTo(it.page, (it as any).box)}>
          <div className="font-medium">{it.label}</div>
          <div className="text-muted-foreground break-all">{it.value}</div>
          <div className="text-xs">Pag. {it.page}</div>
        </div>
      ))}
      {items.length === 0 && <div className="text-sm text-neutral-500">Nessun elemento rilevato.</div>}
    </div>
  )
}


