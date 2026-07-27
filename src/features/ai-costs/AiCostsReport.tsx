/**
 * Riepilogo costi LLM di una singola pratica, aggregato per operazione.
 */

import type { PracticeAiCostsPayload } from '../../lib/api'
import { aggregateAiCallsByOperation, formatAiCostEur } from './report'

export function AiCostsReport({ data }: { data: PracticeAiCostsPayload }) {
  const rows = aggregateAiCallsByOperation(data.calls)
  const summary = data.summary

  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed p-6 text-center text-sm text-neutral-500">
        Nessuna chiamata IA registrata per questa pratica.
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge label="Operazioni" value={String(rows.length)} />
        <Badge label="Chiamate" value={String(summary.callCount)} />
        <Badge
          label="Token"
          value={`${summary.inputTokens} in / ${summary.outputTokens} out`}
        />
        <Badge label="Costo pratica" value={formatAiCostEur(summary.costEur)} emphasis />
        {summary.unpricedCallCount > 0 && (
          <Badge label="Non prezzate" value={String(summary.unpricedCallCount)} warning />
        )}
        {summary.errorCount > 0 && (
          <Badge label="Errori" value={String(summary.errorCount)} warning />
        )}
      </div>

      <div className="max-h-72 overflow-auto rounded border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-2 py-1.5">Ora</th>
              <th className="px-2 py-1.5">Operazione</th>
              <th className="px-2 py-1.5">Provider/modello</th>
              <th className="px-2 py-1.5 text-right">Chiamate</th>
              <th className="px-2 py-1.5 text-right">Token</th>
              <th className="px-2 py-1.5 text-right">Costo</th>
              <th className="px-2 py-1.5 text-right">Errori</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.operationId} className="border-t">
                <td className="whitespace-nowrap px-2 py-1.5">
                  {new Date(row.lastAt).toLocaleString('it-IT')}
                </td>
                <td className="px-2 py-1.5">{purposeLabel(row.purpose)}</td>
                <td className="whitespace-nowrap px-2 py-1.5 font-mono">
                  {row.modelLabel}
                </td>
                <td className="px-2 py-1.5 text-right">{row.calls}</td>
                <td className="px-2 py-1.5 text-right">
                  {row.inputTokens + row.outputTokens}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {row.unpricedCalls === row.calls ? 'n/d' : formatAiCostEur(row.costEur)}
                </td>
                <td className="px-2 py-1.5 text-right text-red-600">
                  {row.errors || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Badge({
  label,
  value,
  emphasis,
  warning,
}: {
  label: string
  value: string
  emphasis?: boolean
  warning?: boolean
}) {
  const tone = warning
    ? 'border-amber-300 bg-amber-50 text-amber-900'
    : emphasis
      ? 'border-sky-300 bg-sky-50 text-sky-900'
      : 'border-neutral-200 bg-neutral-50 text-neutral-700'
  return (
    <span className={`rounded border px-2 py-1 ${tone}`}>
      {label}: <strong>{value}</strong>
    </span>
  )
}

function purposeLabel(purpose: string): string {
  return purpose === 'legal-entity-review' ? 'Review entità legali' : purpose
}
