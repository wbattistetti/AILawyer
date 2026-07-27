/**
 * Selettore Groq basato sul catalogo live, con prezzi verificati €/M.
 */

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { LlmModelCatalogItem } from '../../lib/api'

export function LlmModelPicker({
  models,
  selectedModel,
  usdToEur,
  onSelect,
}: {
  models: LlmModelCatalogItem[]
  selectedModel: string
  usdToEur: number | null
  onSelect: (modelId: string) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('it')
    if (!needle) return models
    return models.filter(model => model.id.toLocaleLowerCase('it').includes(needle))
  }, [models, query])

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Modello Groq per legal-review</h3>
        <p className="text-xs text-neutral-500">
          I prezzi n/d non vengono stimati: il report li segnala come non prezzati.
        </p>
      </div>
      <label className="relative block">
        <Search className="absolute left-2 top-2 h-4 w-4 text-neutral-400" />
        <span className="sr-only">Filtra modelli</span>
        <input
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Filtra modelli…"
          className="w-full rounded border py-1.5 pl-8 pr-2 text-sm"
        />
      </label>
      <div className="max-h-64 overflow-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-2 py-1.5">Modello</th>
              <th className="px-2 py-1.5 text-right">Input €/M</th>
              <th className="px-2 py-1.5 text-right">Output €/M</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(model => {
              const selected = model.id === selectedModel
              return (
                <tr
                  key={model.id}
                  className={`cursor-pointer border-t hover:bg-sky-50 ${
                    selected ? 'bg-sky-100' : ''
                  }`}
                  onClick={() => onSelect(model.id)}
                >
                  <td className="px-2 py-1.5 font-mono">{model.id}</td>
                  <td className="px-2 py-1.5 text-right">
                    {formatPrice(model.pricing?.inputUsdPer1M, usdToEur)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {formatPrice(model.pricing?.outputUsdPer1M, usdToEur)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-3 text-sm text-neutral-500">Nessun modello corrispondente.</div>
        )}
      </div>
    </section>
  )
}

function formatPrice(usdPer1M: number | undefined, usdToEur: number | null): string {
  if (usdPer1M === undefined || usdToEur === null) return 'n/d'
  const value = usdPer1M * usdToEur
  return `${value.toLocaleString('it-IT', {
    minimumFractionDigits: value < 1 ? 3 : 2,
    maximumFractionDigits: value < 1 ? 3 : 2,
  })} €`
}
