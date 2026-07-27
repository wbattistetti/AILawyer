/**
 * Pulsante toolbar multi-grafo: "Crea Grafo" se vuoto, altrimenti menu "Grafo".
 */

import { Check, Network, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { GraphMenuItem } from './graphSerialization'

export type GraphToolbarControlProps = {
  graphs: GraphMenuItem[]
  onCreateGraph: () => void
  onOpenGraph: (graphId: string) => void
}

/** Controllo header per creare/aprire grafi della pratica. */
export function GraphToolbarControl({
  graphs,
  onCreateGraph,
  onOpenGraph,
}: GraphToolbarControlProps) {
  if (graphs.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onCreateGraph}
        className="flex items-center"
      >
        <Network className="w-4 h-4 mr-2" />
        Crea Grafo
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center">
          <Network className="w-4 h-4 mr-2" />
          Grafo
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-[10050] min-w-[12rem]">
        <DropdownMenuItem
          onSelect={() => onCreateGraph()}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Crea Grafo
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {graphs.map((graph) => (
          <DropdownMenuItem
            key={graph.id}
            onSelect={() => onOpenGraph(graph.id)}
            className="gap-2"
          >
            <span className="flex-1 truncate">{graph.name}</span>
            {graph.isOpen ? (
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Aperto" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
